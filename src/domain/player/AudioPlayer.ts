// ═══════════════════════════════════════════
//  AudioPlayer — HTML5 Audio singleton with Web Audio DSP
//  Handles playback, queue, MediaSession API, Full-Track Resolver,
//  Smart AutoPlay & Continuous Next Song Recommendation,
//  "Continue Listening" Persistence, and Real-time Audio Quality Switching
//  Adaptive Streaming — network-aware buffering, smart cache, pre-buffer
// ═══════════════════════════════════════════

import type { Song, RepeatMode, AudioQuality } from '../../data/models';
import { shuffle } from '../../core/utils';
import { resolveFullTrack, formatMediaUrlWithQuality, isPreviewAudioUrl, fetchSaavnSongStreamById } from '../../data/api/saavnApi';
import { cacheSongForOfflineBackup, getOfflineSongStream } from '../../services/OfflineBackupService';
import { showToast } from '../../core/utils/toast';
import { MediaNotificationService } from '../../services/MediaNotificationService';
import {
  smartRecommendationEngine,
  getCoreTitle,
  isSameOrSimilarTitle,
  normalizeArtist,
} from '../recommendation/SmartRecommendationEngine';
import { userProfileTracker } from '../recommendation/UserProfileTracker';
import { aiTasteProfileEngine } from '../ai/AITasteProfileEngine';
import { adaptiveStreaming } from '../../services/AdaptiveStreamingService';
import { studioAudioEngine } from './StudioAudioEngine';
import { youtubeAudioEngine } from './YouTubeAudioEngine';
import { YouTubeQueueService } from '../../services/YouTubeQueue';
import { BeatAnalyzer } from './BeatAnalyzer';
import { dolbyAudioService } from '../../services/DolbyAudioService';

export interface PlaybackSession {
  song: Song;
  trackId: string;
  playbackPosition: number;
  duration: number;
  progress: number;
  queue: Song[];
  queueIndex: number;
  updatedAt: number;
}

export const CONTINUE_LISTENING_KEY = 'sw_continue_listening_session';
export const PERSISTENT_AUTOMIX_KEY = 'sw_persistent_automix';

type AudioPlayerCallback = (event: AudioPlayerEvent) => void;

export type AudioPlayerEvent =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'ended' }
  | { type: 'timeupdate'; currentTime: number; duration: number; progress: number }
  | { type: 'loading'; isLoading: boolean }
  | { type: 'error'; error: string | null }
  | { type: 'queuechange' }
  | { type: 'songchange'; song: Song | null }
  | { type: 'autoplaychange'; autoPlay: boolean }
  | { type: 'automixchange'; automixQueue: Song[] }
  | { type: 'qualitychange'; quality: AudioQuality }
  | { type: 'ridingmodechange'; ridingMode: boolean };

class AudioPlayer {
  private primaryAudio: HTMLAudioElement;
  private secondaryAudio: HTMLAudioElement;

  get audio(): HTMLAudioElement {
    return this.primaryAudio;
  }

  get crossfadeAudio(): HTMLAudioElement {
    return this.secondaryAudio;
  }

  private activeEngine: 'html5' | 'youtube' | 'none' = 'none';
  private playbackSessionId = 0;
  private _queue: Song[] = [];
  private _originalQueue: Song[] = [];
  private _queueIndex = 0;
  private _shuffle = false;
  private _repeat: RepeatMode = 'off';
  private _volume = 1;
  private _autoPlay = true;
  private _ridingMode = false;
  private _audioQuality: AudioQuality = 'high';
  private callbacks: Set<AudioPlayerCallback> = new Set();

  // Endless Seed Radio & Automix state
  private _automixQueue: Song[] = [];
  private _sessionHistory: Song[] = [];
  private isAutomixReplenishing = false;

  // Crossfade state
  private isCrossfading = false;
  private isCrossfadePaused = false;
  private crossfadeTimer: ReturnType<typeof setInterval> | null = null;
  private crossfadeSongId: string | null = null;
  private crossfadeProgress = 0;
  private crossfadeTargetSong: Song | null = null;
  private crossfadeTargetIndex = -1;
  private isResolvingCrossfade = false;

  // AutoPlay & Recommendation state
  private isAutoPlayFetching = false;
  private lastPrefetchedSongId: string | null = null;
  private lastTimeUpdateSecond = 0;

  // Adaptive streaming state
  private currentStreamSongId: string | null = null;
  private stallWatcherCleanup: (() => void) | null = null;
  private nextSongPreBuffered: string | null = null;

  // Continue Listening & Resume state (Restored from previous session exclusively for resume)
  private savedResumeTrackId: string | null = null;
  private savedResumePosition = 0;
  private pendingSeekPosition = 0;
  private lastSavedPositionTime = 0;
  private isAutoRecovering = false;
  private isUserInteracted = false;

  constructor() {
    this.primaryAudio = new Audio();
    this.secondaryAudio = new Audio();
    this.primaryAudio.autoplay = false;
    this.secondaryAudio.autoplay = false;
    this.primaryAudio.preload = 'none';
    this.secondaryAudio.preload = 'none';
    adaptiveStreaming.configureAudioElement(this.primaryAudio);
    adaptiveStreaming.configureAudioElement(this.secondaryAudio);
    // Initialise network monitoring immediately
    adaptiveStreaming.initNetworkMonitor();

    // Retrieve saved configuration from localStorage if available
    try {
      const savedConfig = localStorage.getItem('sw_config');
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        if (parsed.audioQuality) {
          this._audioQuality = parsed.audioQuality;
        }
        if (typeof parsed.autoPlay === 'boolean') {
          this._autoPlay = parsed.autoPlay;
        }
      }
      const savedRiding = localStorage.getItem('sw_riding_mode');
      if (savedRiding === 'true') {
        this._ridingMode = true;
      }
    } catch {
      // default
    }

    this.restoreSavedSession();
    this.restoreAutomixQueue();
    this.bindEvents();

    // Attach high-definition DSP audio engine
    studioAudioEngine.attachAudioElement(this.primaryAudio);
    studioAudioEngine.attachAudioElement(this.secondaryAudio);
    studioAudioEngine.setQuality(this._audioQuality);

    if (this._audioQuality === 'dolby') {
      dolbyAudioService.setEnabled(true).catch(() => {});
    }
  }

  /**
   * Restores the previous song and queue metadata on launch for Resume.
   * Position is bound to savedResumeTrackId so new song plays always start at 0:00.
   */
  private restoreSavedSession() {
    try {
      const raw = localStorage.getItem(CONTINUE_LISTENING_KEY);
      if (!raw) return;
      const session: PlaybackSession = JSON.parse(raw);
      if (!session || !session.song) return;

      this._queue = session.queue && session.queue.length > 0 ? session.queue : [session.song];
      this._originalQueue = [...this._queue];
      this._queueIndex = session.queueIndex !== undefined && session.queueIndex < this._queue.length ? session.queueIndex : 0;
      
      // Save trackId and position ONLY for explicit Resume
      this.savedResumeTrackId = session.trackId || session.song.id;
      this.savedResumePosition = session.playbackPosition || 0;
      this.pendingSeekPosition = 0;
      this.isUserInteracted = false;

      // DO NOT start playback or load audio source on launch
      this.audio.src = '';
      this.audio.pause();
      youtubeAudioEngine.stop();
    } catch {
      // ignore
    }
  }

  /**
   * Restores persistent automix recommendations from localStorage.
   */
  private restoreAutomixQueue(): void {
    try {
      const raw = localStorage.getItem(PERSISTENT_AUTOMIX_KEY);
      if (!raw) return;
      const parsed: Song[] = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        this._automixQueue = parsed;
      }
    } catch {
      // ignore
    }
  }

  /**
   * Persists automix recommendations into localStorage.
   */
  public saveAutomixQueue(): void {
    try {
      localStorage.setItem(PERSISTENT_AUTOMIX_KEY, JSON.stringify(this._automixQueue.slice(0, 30)));
    } catch {
      // ignore
    }
  }

  /**
   * Persists current song, queue, and playback position to localStorage.
   */
  public saveCurrentSession() {
    this.saveAutomixQueue();
    const song = this.currentSong;
    if (!song) return;

    let rawDuration = 0;
    let rawTime = 0;

    if (this.activeEngine === 'youtube') {
      rawDuration = youtubeAudioEngine.getDuration();
      rawTime = youtubeAudioEngine.getCurrentTime();
    } else {
      rawDuration = this.audio.duration;
      rawTime = this.audio.currentTime;
    }

    const duration = (rawDuration && !isNaN(rawDuration) && isFinite(rawDuration) && rawDuration > 0)
      ? Math.round(rawDuration)
      : (song.duration || 0);

    let currentTime = (rawTime && !isNaN(rawTime) && isFinite(rawTime) && rawTime > 0)
      ? Math.round(rawTime)
      : 0;

    if (this.savedResumePosition > 0 && currentTime === 0 && this.savedResumeTrackId === song.id) {
      currentTime = this.savedResumePosition;
    }

    const progress = duration > 0 ? currentTime / duration : 0;
    // If completed (≥ 95%), reset saved position to 0:00
    const savedPosition = progress >= 0.95 ? 0 : currentTime;

    const session: PlaybackSession = {
      song,
      trackId: song.id,
      playbackPosition: savedPosition,
      duration,
      progress: duration > 0 ? savedPosition / duration : 0,
      queue: this._queue.length > 0 ? this._queue : [song],
      queueIndex: this._queueIndex,
      updatedAt: Date.now(),
    };

    try {
      localStorage.setItem(CONTINUE_LISTENING_KEY, JSON.stringify(session));
    } catch {
      // quota or private mode
    }
  }

  private bindEvents() {
    // Initialize Android native media notification & background lockscreen controls
    MediaNotificationService.init({
      onPlay: () => {
        if (this.currentSong && (this.audio.src || this.activeEngine === 'youtube')) {
          this.resume();
        }
      },
      onPause: () => this.pause(),
      onNext: () => {
        this.next();
      },
      onPrev: () => {
        this.previous();
      },
      onSeekTo: (seconds) => this.seekToTime(seconds),
    });

    this.bindAudioElement(this.primaryAudio);
    this.bindAudioElement(this.secondaryAudio);

    // ── Bind Headless YouTube Audio Engine Events ──
    youtubeAudioEngine.subscribe((event) => {
      if (this.activeEngine !== 'youtube' || event.sessionId !== this.playbackSessionId) {
        return;
      }
      if (event.type === 'play') {
        this.emit({ type: 'loading', isLoading: false });
        this.emit({ type: 'play' });
        this.emit({ type: 'error', error: null });
        if (this.currentSong) {
          MediaNotificationService.update(
            this.currentSong,
            true,
            youtubeAudioEngine.getDuration() || this.currentSong.duration,
            youtubeAudioEngine.getCurrentTime()
          );
        }
      } else if (event.type === 'playing') {
        this.emit({ type: 'loading', isLoading: false });
        this.emit({ type: 'error', error: null });
      } else if (event.type === 'pause') {
        this.emit({ type: 'pause' });
        this.saveCurrentSession();
        if (this.currentSong) {
          MediaNotificationService.update(
            this.currentSong,
            false,
            youtubeAudioEngine.getDuration() || this.currentSong.duration,
            youtubeAudioEngine.getCurrentTime()
          );
        }
      } else if (event.type === 'ended') {
        if (this.isCrossfading) {
          if (this.crossfadeTargetSong) {
            this.completeCrossfade(this.crossfadeTargetSong, this.crossfadeTargetIndex);
          }
          return;
        }
        this.saveCurrentSession();
        this.handleEnded();
      } else if (event.type === 'timeupdate') {
        const duration = event.duration || this.currentSong?.duration || 0;
        const currentTime = event.currentTime;
        const progress = duration > 0 ? currentTime / duration : 0;
        this.emit({ type: 'timeupdate', currentTime, duration, progress });
        this.updateMediaSessionPosition();
        this.checkRidingModeAndAutomix(currentTime, duration, progress);
      } else if (event.type === 'loading') {
        this.emit({ type: 'loading', isLoading: event.isLoading });
      } else if (event.type === 'error') {
        this.emit({ type: 'loading', isLoading: false });
        if (event.error) {
          this.emit({ type: 'error', error: event.error });
        }
      }
    });

    // Install adaptive stall watcher for graceful buffering recovery
    this.installAdaptiveStallWatcher();

    // Save session on app backgrounding / window close
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', () => this.saveCurrentSession());
      window.addEventListener('beforeunload', () => this.saveCurrentSession());
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          this.saveCurrentSession();
        }
      });
    }
  }

  private bindAudioElement(el: HTMLAudioElement) {
    el.addEventListener('play', () => {
      if (el !== this.primaryAudio || this.activeEngine !== 'html5') return;
      this.emit({ type: 'loading', isLoading: false });
      this.emit({ type: 'play' });
      this.emit({ type: 'error', error: null });
      if (this.currentSong) {
        MediaNotificationService.update(
          this.currentSong,
          true,
          el.duration,
          el.currentTime
        );
      }
    });

    el.addEventListener('playing', () => {
      if (el !== this.primaryAudio || this.activeEngine !== 'html5') return;
      this.emit({ type: 'loading', isLoading: false });
      this.emit({ type: 'play' });
      this.emit({ type: 'error', error: null });
    });

    el.addEventListener('pause', () => {
      if (el !== this.primaryAudio || this.activeEngine !== 'html5') return;
      this.emit({ type: 'pause' });
      this.saveCurrentSession();
      if (this.currentSong) {
        MediaNotificationService.update(
          this.currentSong,
          false,
          el.duration,
          el.currentTime
        );
      }
    });

    el.addEventListener('ended', () => {
      if (el !== this.primaryAudio || this.activeEngine !== 'html5') return;
      if (this.isCrossfading) {
        if (this.crossfadeTargetSong) {
          this.completeCrossfade(this.crossfadeTargetSong, this.crossfadeTargetIndex);
        }
        return;
      }
      this.saveCurrentSession();
      this.handleEnded();
    });

    el.addEventListener('timeupdate', () => {
      if (el !== this.primaryAudio || this.activeEngine !== 'html5') return;
      const duration = el.duration || 0;
      const currentTime = el.currentTime;
      const progress = duration > 0 ? currentTime / duration : 0;
      this.emit({ type: 'timeupdate', currentTime, duration, progress });
      this.updateMediaSessionPosition();

      // Periodically persist playback position every 4 seconds
      const now = Date.now();
      if (now - this.lastSavedPositionTime > 4000) {
        this.lastSavedPositionTime = now;
        this.saveCurrentSession();
      }

      // Track listening duration in intelligence profile
      const currentSec = Math.floor(currentTime);
      if (currentSec > this.lastTimeUpdateSecond) {
        userProfileTracker.recordListeningDuration(currentSec - this.lastTimeUpdateSecond);
        this.lastTimeUpdateSecond = currentSec;
      }

      this.checkRidingModeAndAutomix(currentTime, duration, progress);
    });

    el.addEventListener('loadstart', () => {
      if (el === this.primaryAudio && this.activeEngine === 'html5') {
        this.emit({ type: 'loading', isLoading: true });
      }
    });

    el.addEventListener('canplay', () => {
      if (el === this.primaryAudio && this.activeEngine === 'html5') {
        this.emit({ type: 'loading', isLoading: false });
        this.emit({ type: 'error', error: null });
      }
    });

    el.addEventListener('error', () => {
      if (el !== this.primaryAudio || this.activeEngine !== 'html5') return;
      const err = el.error;
      // Filter out abort errors, empty src resets during song switching, or unmounted states
      if (!el.src || !this.currentSong || err?.code === MediaError.MEDIA_ERR_ABORTED || !this.isUserInteracted) {
        return;
      }

      // Automatic Instant YouTube Fallback if JioSaavn stream fails
      if (navigator.onLine && this.currentSong && !this.isAutoRecovering && this.isUserInteracted) {
        this.isAutoRecovering = true;
        const songToRecover = this.currentSong;
        const resumePos = el.currentTime || this.savedResumePosition || 0;
        this.playViaYouTubeFallback(songToRecover, this.playbackSessionId, resumePos)
          .catch(() => {
            this.emit({ type: 'loading', isLoading: false });
            this.emit({ type: 'error', error: 'Playback failed. Tap to retry.' });
          })
          .finally(() => {
            this.isAutoRecovering = false;
          });
        return;
      }

      this.emit({ type: 'loading', isLoading: false });
      this.emit({ type: 'error', error: 'Playback failed. Tap to retry.' });
    });
  }

  /**
   * Helper to retrieve current recommendation context from localStorage.
   */
  private getRecommendationContext() {
    try {
      const languages = JSON.parse(localStorage.getItem('sw_music_languages') || '["Hindi", "International", "Punjabi"]');
      const favorites = JSON.parse(localStorage.getItem('sw_favorites') || '[]');
      const userPlaylists = JSON.parse(localStorage.getItem('sw_playlists') || '[]');
      const searchHistory = JSON.parse(localStorage.getItem('sw_search_history') || '[]');
      const recentlyPlayed = JSON.parse(localStorage.getItem('sw_recently_played') || '[]');

      const sessionHistoryArtists = this._sessionHistory.map((s) => normalizeArtist(s.artist)).filter(Boolean);
      const sessionPlayedIds = new Set<string>(this._sessionHistory.map((s) => s.id));

      return {
        languages,
        favorites,
        userPlaylists,
        searchHistory,
        recentlyPlayed,
        sessionHistoryArtists,
        sessionPlayedIds,
        queue: this._queue,
      };
    } catch {
      return { queue: this._queue };
    }
  }

  /**
   * Pre-fetches smart recommendations in background for zero-gap playback.
   */
  private async triggerSmartPreload(currentSong: Song) {
    if (this.isAutoPlayFetching) return;
    this.isAutoPlayFetching = true;
    try {
      const context = this.getRecommendationContext();
      const nextTracks = await smartRecommendationEngine.getSmartNextTracks(currentSong, 5, context);
      if (nextTracks && nextTracks.length > 0 && this._queueIndex >= this._queue.length - 2) {
        this._queue.push(...nextTracks);
        this._originalQueue.push(...nextTracks);
        this.emit({ type: 'queuechange' });
        this.saveCurrentSession();
      }
    } catch {
      // background preload non-blocking
    } finally {
      this.isAutoPlayFetching = false;
    }
  }

  /**
   * Updates audio quality in real-time and refreshes active stream if needed.
   */
  async setAudioQuality(quality: AudioQuality) {
    this._audioQuality = quality;
    studioAudioEngine.setQuality(quality);
    if (quality === 'dolby') {
      dolbyAudioService.setEnabled(true).catch(() => {});
    } else {
      dolbyAudioService.setEnabled(false).catch(() => {});
    }
    this.emit({ type: 'qualitychange', quality });

    // Save preference
    try {
      const cfg = JSON.parse(localStorage.getItem('sw_config') || '{}');
      cfg.audioQuality = quality;
      localStorage.setItem('sw_config', JSON.stringify(cfg));
    } catch {}

    // If currently playing a Saavn track, switch stream seamlessly without losing position
    const current = this.currentSong;
    if (current && current.provider === 'saavn' && current.previewUrl && !current.previewUrl.startsWith('blob:')) {
      const currentTime = this.audio.currentTime;
      const wasPlaying = !this.audio.paused;

      const formattedUrl = formatMediaUrlWithQuality(current.previewUrl, quality);
      if (formattedUrl !== current.previewUrl) {
        current.previewUrl = formattedUrl;
        this.audio.src = formattedUrl;
        this.audio.currentTime = currentTime;
        if (wasPlaying) {
          this.audio.play().catch(() => {});
        }
      }
    }
  }

  // ─── Getters / Setters ──────────────────────────────────────────────────────

  get currentSong(): Song | null {
    return this._queue[this._queueIndex] || null;
  }

  get queue(): Song[] {
    return this._queue;
  }

  get queueIndex(): number {
    return this._queueIndex;
  }

  get isPlaying(): boolean {
    if (this.activeEngine === 'youtube') {
      return youtubeAudioEngine.isPlaying();
    }
    return !this.audio.paused;
  }

  get duration(): number {
    if (this.activeEngine === 'youtube') {
      return youtubeAudioEngine.getDuration() || this.currentSong?.duration || 0;
    }
    return this.audio.duration || this.currentSong?.duration || 0;
  }

  get currentTime(): number {
    if (this.activeEngine === 'youtube') {
      return youtubeAudioEngine.getCurrentTime() || 0;
    }
    return this.audio.currentTime || 0;
  }

  get volume(): number {
    return this._volume;
  }

  set volume(v: number) {
    this._volume = Math.max(0, Math.min(1, v));
    this.audio.volume = this._volume;
    youtubeAudioEngine.setVolume(this._volume);
  }

  get shuffle(): boolean {
    return this._shuffle;
  }

  set shuffle(enabled: boolean) {
    this._shuffle = enabled;
    const current = this.currentSong;
    if (enabled) {
      this._queue = shuffle(this._originalQueue);
      if (current) {
        this._queueIndex = this._queue.findIndex((s) => s.id === current.id);
        if (this._queueIndex === -1) {
          this._queue.unshift(current);
          this._queueIndex = 0;
        }
      }
    } else {
      this._queue = [...this._originalQueue];
      if (current) {
        this._queueIndex = this._queue.findIndex((s) => s.id === current.id);
        if (this._queueIndex === -1) this._queueIndex = 0;
      }
    }
    this.emit({ type: 'queuechange' });
    this.saveCurrentSession();
  }

  get repeat(): RepeatMode {
    return this._repeat;
  }

  set repeat(mode: RepeatMode) {
    this._repeat = mode;
  }

  get autoPlay(): boolean {
    return this._autoPlay;
  }

  set autoPlay(enabled: boolean) {
    this._autoPlay = enabled;
    this.emit({ type: 'autoplaychange', autoPlay: enabled });
  }

  get ridingMode(): boolean {
    return this._ridingMode;
  }

  set ridingMode(enabled: boolean) {
    this._ridingMode = enabled;
    try {
      localStorage.setItem('sw_riding_mode', String(enabled));
    } catch {}
    if (!enabled) {
      this.cancelCrossfade();
    }
    this.emit({ type: 'ridingmodechange', ridingMode: enabled });
  }

  toggleRidingMode(): boolean {
    this.ridingMode = !this.ridingMode;
    return this.ridingMode;
  }

  get audioQuality(): AudioQuality {
    return this._audioQuality;
  }

  get automixQueue(): Song[] {
    return [...this._automixQueue];
  }

  getAutomixItems(): Song[] {
    return [...this._automixQueue];
  }

  canSkipNext(): boolean {
    return (
      this._queueIndex < this._queue.length - 1 ||
      this._repeat === 'all' ||
      (this._autoPlay && (this._automixQueue.length > 0 || this._queue.length > 0))
    );
  }

  /**
   * Generates and replenishes the active automix queue using YouTube Seed Radio.
   */
  async replenishAutomixQueue(seedSong?: Song | null, force = false): Promise<void> {
    const target = seedSong || this.currentSong;
    if (!target || (!force && this.isAutomixReplenishing)) return;
    if (!force && this._automixQueue.length >= 15) return;

    this.isAutomixReplenishing = true;
    try {
      const existingIds = new Set<string>([
        ...this._queue.map((s) => s.id),
        ...this._automixQueue.map((s) => s.id),
        target.id,
      ]);

      const targetCore = getCoreTitle(target.title);
      const existingCores = new Set<string>([
        ...this._queue.map((s) => getCoreTitle(s.title)).filter(Boolean),
        ...this._automixQueue.map((s) => getCoreTitle(s.title)).filter(Boolean),
      ]);
      if (targetCore) existingCores.add(targetCore);

      const newRadioTracks = await YouTubeQueueService.generateSeedRadio(
        target,
        undefined,
        existingIds,
        this._queue
      );
      if (newRadioTracks && newRadioTracks.length > 0) {
        for (const track of newRadioTracks) {
          const trackCore = getCoreTitle(track.title);
          const isSameTitle = (trackCore && targetCore && trackCore === targetCore) || isSameOrSimilarTitle(track.title, target.title);

          if (
            !isSameTitle &&
            (!trackCore || !existingCores.has(trackCore)) &&
            !this._automixQueue.some((s) => s.id === track.id) &&
            !this._queue.some((s) => s.id === track.id)
          ) {
            this._automixQueue.push(track);
            if (trackCore) existingCores.add(trackCore);
          }
        }
        if (this._automixQueue.length > 30) {
          this._automixQueue = this._automixQueue.slice(0, 30);
        }
        this.saveAutomixQueue();
        this.emit({ type: 'automixchange', automixQueue: [...this._automixQueue] });
      }
    } catch (e) {
      console.warn('AutoMix replenishment error:', e);
    } finally {
      this.isAutomixReplenishing = false;
    }
  }

  /**
   * Pops the next track from the automix queue buffer and appends it to the active player queue.
   */
  injectNextAutomixTrack(): Song | null {
    if (this._automixQueue.length === 0) return null;

    const currentCore = this.currentSong ? getCoreTitle(this.currentSong.title) : '';
    const existingIds = new Set<string>(this._queue.map((s) => s.id));
    const sessionIds = new Set<string>(this._sessionHistory.map((s) => s.id));
    const existingCores = new Set<string>(this._queue.map((s) => getCoreTitle(s.title)).filter(Boolean));
    const sessionCores = new Set<string>(this._sessionHistory.slice(0, 20).map((s) => getCoreTitle(s.title)).filter(Boolean));
    if (currentCore) {
      existingCores.add(currentCore);
      sessionCores.add(currentCore);
    }

    let nextSong: Song | null = null;

    while (this._automixQueue.length > 0) {
      const candidate = this._automixQueue.shift()!;
      const candCore = getCoreTitle(candidate.title);

      // Enforce ID, title uniqueness, anti-duplicate/remix, and recent session exclusion
      if (
        !existingIds.has(candidate.id) &&
        !sessionIds.has(candidate.id) &&
        (!candCore || (!existingCores.has(candCore) && !sessionCores.has(candCore))) &&
        (!this.currentSong || !isSameOrSimilarTitle(candidate.title, this.currentSong.title))
      ) {
        nextSong = candidate;
        break;
      }
    }

    if (!nextSong) {
      this.saveAutomixQueue();
      this.emit({ type: 'automixchange', automixQueue: [...this._automixQueue] });
      if (this.currentSong) this.replenishAutomixQueue(this.currentSong, true);
      return null;
    }

    this._queue.push(nextSong);
    this._originalQueue.push(nextSong);
    this.saveAutomixQueue();
    this.saveCurrentSession();
    this.emit({ type: 'queuechange' });
    this.emit({ type: 'automixchange', automixQueue: [...this._automixQueue] });
    this.scheduleNextSongPreBuffer();

    // Replenish buffer if low (< 6 items)
    if (this._automixQueue.length < 6) {
      this.replenishAutomixQueue(nextSong);
    }
    return nextSong;
  }

  // ─── Playback ─────────────────────────────────────────────────────────────

  async play(song?: Song, queue?: Song[], startIndex?: number, seekToSeconds?: number) {
    this.cancelCrossfade();
    const targetSong = song || (queue && queue.length > 0 ? (startIndex !== undefined && startIndex >= 0 && startIndex < queue.length ? queue[startIndex] : queue[0]) : this._queue[this._queueIndex]);
    if (!targetSong) return;

    // If starting a single song explicitly (e.g. from Search), clear stale automix buffer
    const isSingleSongSelect = queue && queue.length <= 1;
    if (isSingleSongSelect) {
      this._automixQueue = [];
    }

    if (queue && queue.length > 0) {
      this._originalQueue = [...queue];
      this._queue = this._shuffle ? shuffle(queue) : [...queue];
      const matchIndex = this._queue.findIndex((s) => s.id === targetSong.id);
      this._queueIndex = matchIndex !== -1 ? matchIndex : (startIndex !== undefined && startIndex >= 0 && startIndex < this._queue.length ? startIndex : 0);
    }

    // Trigger proactive automix seed radio buffer replenishment in background
    if (this._autoPlay) {
      this.replenishAutomixQueue(targetSong, isSingleSongSelect);
    }

    // ── Centralized Playback Session ID ──
    // Every play() call creates a unique, monotonically increasing session ID.
    // Any async resolution, callback, or engine ready event from a previous session is immediately discarded.
    this.playbackSessionId = (this.playbackSessionId + 1) & 0x7fffffff;
    const currentSessionId = this.playbackSessionId;
    this.isUserInteracted = true;

    // ── 1. Immediately stop & release all currently active audio engines ──
    this.cancelCrossfade();
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    if (this.crossfadeAudio) {
      this.crossfadeAudio.pause();
      this.crossfadeAudio.removeAttribute('src');
      this.crossfadeAudio.load();
    }
    youtubeAudioEngine.stop();
    this.activeEngine = 'none';

    // ── Cancel all in-flight adaptive stream downloads immediately ──
    adaptiveStreaming.cancelAllExcept('');
    this.currentStreamSongId = targetSong.id;
    this.nextSongPreBuffered = null;
    this.crossfadeSongId = null;

    // ── Correct Playback State Rules ──
    if (seekToSeconds !== undefined) {
      this.pendingSeekPosition = seekToSeconds;
    } else {
      this.pendingSeekPosition = 0;
      this.savedResumePosition = 0;
      this.savedResumeTrackId = null;
    }

    this.lastTimeUpdateSecond = 0;
    this._sessionHistory = [targetSong, ...this._sessionHistory.filter((s) => s.id !== targetSong.id)].slice(0, 30);
    userProfileTracker.recordPlay(targetSong);
    aiTasteProfileEngine.recordSongPlay(targetSong);

    // ── Immediately update UI with new song info (artwork, title, artist) ──
    this.emit({ type: 'songchange', song: targetSong });
    this.emit({ type: 'loading', isLoading: true });
    this.updateMediaSession(targetSong);
    MediaNotificationService.update(targetSong, true, targetSong.duration, this.pendingSeekPosition || 0);

    // ── Offline check ──
    if (!navigator.onLine) {
      let offlineUrl: string | null = null;
      try { offlineUrl = await getOfflineSongStream(targetSong.id); } catch {}

      if (!offlineUrl && targetSong.previewUrl?.startsWith('blob:')) {
        offlineUrl = targetSong.previewUrl;
      }

      if (currentSessionId !== this.playbackSessionId) return;

      if (offlineUrl) {
        targetSong.previewUrl = offlineUrl;
        targetSong.isDownloaded = true;
        youtubeAudioEngine.stop();
        this.activeEngine = 'html5';
      } else {
        this.emit({ type: 'loading', isLoading: false });
        showToast("You're offline. This song isn't available for offline playback.", 'danger', 3200);
        return;
      }
    }

    // ── 0. Attempt Ultra-Fast Direct 320kbps Audio Stream Resolution ──
    // Every song (whether from YouTube search, JioSaavn search, or Spotify) first resolves its authentic 320kbps master stream from CDN for instant 50ms playback.
    const isRestoredTrack = this.savedResumeTrackId === targetSong.id;
    if (isRestoredTrack && targetSong.previewUrl && !targetSong.previewUrl.startsWith('blob:') && !targetSong.isDownloaded) {
      targetSong.previewUrl = null;
    }

    // Fast-path: If track is an explicit YouTube track, route immediately to YouTube playback without querying Saavn
    const isExplicitYouTube = targetSong.provider === 'youtube' || targetSong.id.startsWith('yt_');
    if (isExplicitYouTube && navigator.onLine && (!targetSong.previewUrl || isPreviewAudioUrl(targetSong.previewUrl))) {
      const handled = await this.playViaYouTubeFallback(targetSong, currentSessionId, this.pendingSeekPosition);
      if (handled) return;
    }

    if ((!targetSong.previewUrl || isPreviewAudioUrl(targetSong.previewUrl)) && navigator.onLine) {
      // 1. Direct Saavn ID lookup if saavn_
      if (targetSong.id.startsWith('saavn_')) {
        try {
          const directSaavnUrl = await fetchSaavnSongStreamById(targetSong.id, this._audioQuality);
          if (currentSessionId !== this.playbackSessionId) return;
          if (directSaavnUrl && !isPreviewAudioUrl(directSaavnUrl)) {
            targetSong.previewUrl = directSaavnUrl;
            targetSong.provider = 'saavn';
            this.emit({ type: 'songchange', song: { ...targetSong } });
          }
        } catch {}
      }

      // 2. Full track matching by Title & Artist on high-speed CDN
      if (!targetSong.previewUrl || isPreviewAudioUrl(targetSong.previewUrl)) {
        try {
          const isSpotifyImport = targetSong.id.startsWith('spotify_');
          const fullTrack = await resolveFullTrack(
            targetSong.title,
            targetSong.artist,
            this._audioQuality,
            targetSong.duration,
            isSpotifyImport
          );
          if (currentSessionId !== this.playbackSessionId) return;
          if (fullTrack?.streamUrl && !isPreviewAudioUrl(fullTrack.streamUrl)) {
            targetSong.previewUrl = fullTrack.streamUrl;
            if (fullTrack.duration > 0) targetSong.duration = fullTrack.duration;
            if (!targetSong.artwork && fullTrack.artwork) {
              targetSong.artwork = fullTrack.artwork;
              targetSong.artworkLg = fullTrack.artwork;
            }
            targetSong.provider = 'saavn';
            this.emit({ type: 'songchange', song: { ...targetSong } });
          }
        } catch (e) {
          console.warn('[AudioPlayer] Full track resolve fallback:', e);
        }
      }
    }

    // ── 1. If song is NOT available on CDN, trigger Instant YouTube Fallback ──
    if ((!targetSong.previewUrl || isPreviewAudioUrl(targetSong.previewUrl)) && navigator.onLine) {
      const handled = await this.playViaYouTubeFallback(targetSong, currentSessionId, this.pendingSeekPosition);
      if (handled) return;
    }

    if (currentSessionId !== this.playbackSessionId) return;

    if (!targetSong.previewUrl || isPreviewAudioUrl(targetSong.previewUrl)) {
      this.emit({ type: 'loading', isLoading: false });
      this.emit({ type: 'error', error: `Audio source unavailable for "${targetSong.title}".` });
      if (this._queue.length > 1 && this._queueIndex < this._queue.length - 1) {
        setTimeout(() => { if (currentSessionId === this.playbackSessionId && !this.isPlaying) this.next(); }, 1200);
      }
      return;
    }



    // ── Switch to HTML5 Audio engine ──
    youtubeAudioEngine.stop();
    this.activeEngine = 'html5';
    const resolvedUrl = formatMediaUrlWithQuality(targetSong.previewUrl, this._audioQuality);

    if (currentSessionId !== this.playbackSessionId) return;

    // ── Set audio source and start playback ──
    targetSong.previewUrl = resolvedUrl;
    this.audio.src = resolvedUrl;
    this.audio.volume = this._volume;

    const targetSeek = this.pendingSeekPosition;
    this.pendingSeekPosition = 0;

    if (targetSeek > 0) {
      const applySeek = () => {
        try {
          if (currentSessionId === this.playbackSessionId && targetSeek > 0 && isFinite(targetSeek)) {
            this.audio.currentTime = targetSeek;
          }
        } catch {}
      };
      if (this.audio.readyState >= 1) {
        applySeek();
      } else {
        this.audio.addEventListener('loadedmetadata', applySeek, { once: true });
      }
    } else {
      this.audio.currentTime = 0;
    }

    this.saveCurrentSession();

    // Adaptive pre-buffer of stream
    if (!resolvedUrl.startsWith('blob:')) {
      adaptiveStreaming.preBufferSong(targetSong.id, resolvedUrl, this._audioQuality);
    }

    try {
      const playPromise = this.audio.play();
      if (playPromise !== undefined) await playPromise;
      if (currentSessionId === this.playbackSessionId) {
        this.emit({ type: 'loading', isLoading: false });
        this.emit({ type: 'play' });
      }
    } catch {
      this.emit({ type: 'loading', isLoading: false });
    }

    if (currentSessionId !== this.playbackSessionId) return;

    // ── Schedule pre-buffer of the next song in queue ──
    this.scheduleNextSongPreBuffer();
  }

  /**
   * Ultra-fast YouTube Fallback Resolver.
   * Resolves the correct YouTube video ID and plays seamlessly via Headless YouTube Audio Engine.
   */
  private async playViaYouTubeFallback(targetSong: Song, sessionId: number, seekSeconds = 0): Promise<boolean> {
    if (!this.isUserInteracted) return false;
    this.emit({ type: 'loading', isLoading: true });

    const { resolveYouTubeVideoId } = await import('../../data/api/youtubeMusicApi');
    if (sessionId !== this.playbackSessionId) return false;

    // ── Step 1: Get Video ID ──────────────────────────────────────────────────
    let videoId = '';
    const directVid = targetSong.id.replace('yt_', '').replace('/watch?v=', '').trim();

    if (directVid.length === 11 && /^[a-zA-Z0-9_-]{11}$/.test(directVid)) {
      // Already have a direct YouTube video ID in the song
      videoId = directVid;
    } else {
      // Search YouTube Music for the right video ID
      try {
        const ytMatch = await resolveYouTubeVideoId(targetSong.title, targetSong.artist, targetSong.duration);
        if (sessionId !== this.playbackSessionId) return false;
        if (ytMatch?.videoId) {
          videoId = ytMatch.videoId;
          if (ytMatch.duration > 0) targetSong.duration = ytMatch.duration;
          if (!targetSong.artwork && ytMatch.artwork) {
            targetSong.artwork = ytMatch.artwork;
            targetSong.artworkLg = ytMatch.artwork;
          }
        }
      } catch (e) {
        console.warn('[AudioPlayer] YouTube video ID resolution error:', e);
      }
      if (!videoId || sessionId !== this.playbackSessionId) {
        if (sessionId === this.playbackSessionId) {
          this.emit({ type: 'loading', isLoading: false });
          this.emit({ type: 'error', error: `Could not find "${targetSong.title}" on YouTube.` });
        }
        return false;
      }
    }

    if (sessionId !== this.playbackSessionId) return false;

    // ── Step 2: Route cleanly to YouTube Audio Engine ────────────────────────
    this.cancelCrossfade();
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    this.activeEngine = 'youtube';

    targetSong.provider = 'youtube';
    targetSong.id = `yt_${videoId}`;
    this.emit({ type: 'songchange', song: { ...targetSong } });
    this.updateMediaSession(targetSong);
    this.saveCurrentSession();

    await youtubeAudioEngine.loadAndPlay(videoId, sessionId, seekSeconds);
    return true;
  }

  /**
   * Installs adaptive stall watching on the audio element.
   */
  private installAdaptiveStallWatcher(): void {
    if (this.stallWatcherCleanup) this.stallWatcherCleanup();
    this.stallWatcherCleanup = adaptiveStreaming.installStallWatcher(
      this.audio,
      () => this.currentStreamSongId || '',
      () => {
        // Stall detected – notify UI via loading event
        this.emit({ type: 'loading', isLoading: true });
      },
      () => {
        // Recovered – clear loading
        this.emit({ type: 'loading', isLoading: false });
      },
    );
  }

  /**
   * Schedules a background pre-buffer of the next song in queue.
   * Waits a few seconds to avoid competing with the current song's streaming.
   */
  private scheduleNextSongPreBuffer(): void {
    const nextIndex = this._queueIndex + 1;
    if (nextIndex >= this._queue.length) return;
    const nextSong = this._queue[nextIndex];
    if (!nextSong || !nextSong.previewUrl || nextSong.previewUrl.startsWith('blob:')) return;
    if (this.nextSongPreBuffered === nextSong.id) return;

    // Delay start to let the current song start playing first
    setTimeout(() => {
      if (this.nextSongPreBuffered === nextSong.id) return;
      this.nextSongPreBuffered = nextSong.id;
      adaptiveStreaming.preBufferSong(nextSong.id, nextSong.previewUrl!, this._audioQuality);
    }, 8000);
  }

  // ─── Riding Mode DJ Crossfade & Automix Buffer Engine ───────────────────────

  private checkRidingModeAndAutomix(currentTime: number, duration: number, progress: number) {
    if (!this.currentSong || duration <= 15 || currentTime <= 0) return;

    const isCurrentPlaying = this.activeEngine === 'youtube'
      ? youtubeAudioEngine.isPlaying()
      : (!this.audio.paused && !this.audio.ended);

    if (!isCurrentPlaying) return;

    // When Riding Mode is ON, continuously check remaining duration and trigger DJ crossfade 8-9s before track end
    if (
      this._ridingMode &&
      !this.isCrossfading &&
      !this.isResolvingCrossfade &&
      this.crossfadeSongId !== this.currentSong.id
    ) {
      const remaining = duration - currentTime;
      if (remaining > 0 && remaining <= 8.5 && this._repeat !== 'one') {
        const nextIndex = this._queueIndex + 1;
        const hasNext = nextIndex < this._queue.length || (this._repeat === 'all' && this._queue.length > 0) || (this._autoPlay && (this._queue.length > 0 || this._automixQueue.length > 0));
        if (hasNext) {
          this.crossfadeSongId = this.currentSong.id;
          this.startCrossfade();
        }
      }
    }

    // ── Non-Stop Playback AutoMix Auto-Injection ──
    // When user is near the final track in queue (<= 16s remaining), pop next automix song and append
    const remainingSec = duration - currentTime;
    if (
      this._autoPlay &&
      duration > 20 &&
      remainingSec > 0 &&
      remainingSec <= 16 &&
      this._queueIndex >= this._queue.length - 1 &&
      this._automixQueue.length > 0
    ) {
      this.injectNextAutomixTrack();
    }

    // Proactively replenish automix buffer if it drops below 5 items
    if (
      this._autoPlay &&
      this.currentSong &&
      this._automixQueue.length < 5 &&
      !this.isAutomixReplenishing
    ) {
      this.replenishAutomixQueue(this.currentSong);
    }

    // Proactively pre-fetch context-pure recommendations when 50% through the song and near queue end
    if (
      this._autoPlay &&
      progress > 0.50 &&
      this.currentSong &&
      this.lastPrefetchedSongId !== this.currentSong.id &&
      this._queueIndex >= this._queue.length - 2
    ) {
      this.lastPrefetchedSongId = this.currentSong.id;
      this.triggerSmartPreload(this.currentSong);
    }
  }

  private async startCrossfade(): Promise<void> {
    const isCurrentPlaying = this.activeEngine === 'youtube'
      ? youtubeAudioEngine.isPlaying()
      : (!this.audio.paused && !this.audio.ended);

    if (this.isCrossfading || this.isResolvingCrossfade || !this._ridingMode || !isCurrentPlaying) return;

    let nextIndex = this._queueIndex + 1;
    let nextSong: Song | null = null;

    if (nextIndex < this._queue.length) {
      nextSong = this._queue[nextIndex];
    } else if (this._repeat === 'all' && this._queue.length > 0) {
      nextIndex = 0;
      nextSong = this._queue[0];
    } else if (this._autoPlay && this._queue.length > 0) {
      try {
        const current = this.currentSong;
        if (current) {
          const context = this.getRecommendationContext();
          const nextTracks = await smartRecommendationEngine.getSmartNextTracks(current, 3, context);
          if (nextTracks && nextTracks.length > 0) {
            this._queue.push(...nextTracks);
            this._originalQueue.push(...nextTracks);
            this.emit({ type: 'queuechange' });
            nextSong = this._queue[nextIndex];
          }
        }
      } catch {}
    }

    if (!nextSong) return;

    this.isResolvingCrossfade = true;
    const targetSong = nextSong;
    const targetIndex = nextIndex;

    try {
      let streamUrl: string | null = targetSong.previewUrl || null;

      // ── Resolve full audio stream for upcoming song if needed ──
      const isShortPreview = !streamUrl
        || targetSong.provider === 'itunes'
        || targetSong.id.startsWith('spotify_')
        || isPreviewAudioUrl(streamUrl);

      if (isShortPreview && navigator.onLine) {
        const isSpotifyImport = targetSong.id.startsWith('spotify_');
        const fullTrack = await resolveFullTrack(
          targetSong.title,
          targetSong.artist,
          this._audioQuality,
          targetSong.duration,
          isSpotifyImport
        );
        if (fullTrack?.streamUrl && !isPreviewAudioUrl(fullTrack.streamUrl)) {
          streamUrl = fullTrack.streamUrl;
          targetSong.previewUrl = fullTrack.streamUrl;
          if (fullTrack.duration > 0) targetSong.duration = fullTrack.duration;
          targetSong.provider = 'saavn';
        }
      }

      if ((!streamUrl || isPreviewAudioUrl(streamUrl)) && navigator.onLine) {
        const { resolveYouTubeFullAudioStream } = await import('../../data/api/youtubeMusicApi');
        const ytStream = await resolveYouTubeFullAudioStream(targetSong.title, targetSong.artist, targetSong.duration);
        if (ytStream?.streamUrl && !isPreviewAudioUrl(ytStream.streamUrl)) {
          streamUrl = ytStream.streamUrl;
          targetSong.previewUrl = ytStream.streamUrl;
          if (ytStream.duration > 0) targetSong.duration = ytStream.duration;
          targetSong.provider = 'youtube';
        }
      }

      this.isResolvingCrossfade = false;

      const stillPlaying = this.activeEngine === 'youtube'
        ? youtubeAudioEngine.isPlaying()
        : (!this.audio.paused && !this.audio.ended);

      if (!this._ridingMode || !stillPlaying || !streamUrl || isPreviewAudioUrl(streamUrl)) {
        return;
      }

      // Check cache or format URL
      if (!streamUrl.startsWith('blob:') && navigator.onLine) {
        const cached = await adaptiveStreaming.getCachedUrl(targetSong.id, streamUrl);
        if (cached) {
          streamUrl = cached;
        } else {
          streamUrl = formatMediaUrlWithQuality(streamUrl, this._audioQuality);
        }
      }

      if (!this._ridingMode || (!this.activeEngine && this.audio.paused)) return;

      this.isCrossfading = true;
      this.isCrossfadePaused = false;
      this.crossfadeProgress = 0;
      this.crossfadeTargetSong = targetSong;
      this.crossfadeTargetIndex = targetIndex;

      this.crossfadeAudio.src = streamUrl;
      this.crossfadeAudio.currentTime = 0;
      this.crossfadeAudio.volume = 0;

      // Start playing next song at 0% volume while current song continues playing
      const playPromise = this.crossfadeAudio.play();
      if (playPromise !== undefined) {
        await playPromise;
      }

      if (!this.isCrossfading || !this._ridingMode) {
        this.crossfadeAudio.pause();
        return;
      }

      this.runCrossfadeTransition();
    } catch (e) {
      console.warn('Crossfade execution error:', e);
      this.isResolvingCrossfade = false;
      this.cancelCrossfade();
    }
  }

  private runCrossfadeTransition() {
    if (this.crossfadeTimer) {
      clearInterval(this.crossfadeTimer);
      this.crossfadeTimer = null;
    }

    const currentSong = this.currentSong;
    const targetSong = this.crossfadeTargetSong;
    const crossfadeDurationMs = (currentSong && targetSong)
      ? BeatAnalyzer.calculateOptimalCrossfadeDuration(currentSong, targetSong, 8000)
      : 8000;
    const stepInterval = 40; // 25 fps buttery-smooth volume increments

    this.crossfadeTimer = setInterval(() => {
      if (this.isCrossfadePaused) return;

      this.crossfadeProgress += stepInterval / crossfadeDurationMs;
      const p = Math.min(1, Math.max(0, this.crossfadeProgress));

      // DJ Equal-Power Acoustic Crossfade Law (cos/sin constant energy, 0dB center drop)
      const { gainOut, gainIn } = BeatAnalyzer.getEqualPowerGains(p);
      const fadeOutVol = Math.max(0, Math.min(1, this._volume * gainOut));
      const fadeInVol = Math.max(0, Math.min(1, this._volume * gainIn));

      if (this.activeEngine === 'youtube') {
        youtubeAudioEngine.setVolume(fadeOutVol);
      } else if (this.audio) {
        this.audio.volume = fadeOutVol;
      }
      if (this.crossfadeAudio) this.crossfadeAudio.volume = fadeInVol;

      if (p >= 1) {
        if (this.crossfadeTimer) {
          clearInterval(this.crossfadeTimer);
          this.crossfadeTimer = null;
        }
        if (this.crossfadeTargetSong) {
          this.completeCrossfade(this.crossfadeTargetSong, this.crossfadeTargetIndex);
        }
      }
    }, stepInterval);
  }

  private completeCrossfade(nextSong: Song, newIndex: number): void {
    if (!this.isCrossfading) return;

    if (this.crossfadeTimer) {
      clearInterval(this.crossfadeTimer);
      this.crossfadeTimer = null;
    }

    // Stop and reset the outgoing primary audio element
    this.primaryAudio.pause();
    this.primaryAudio.removeAttribute('src');
    this.primaryAudio.load();
    this.primaryAudio.volume = 0;

    // Stop YouTube engine if outgoing track was YouTube
    if (this.activeEngine === 'youtube') {
      youtubeAudioEngine.stop();
    }
    this.activeEngine = 'html5';

    // Seamlessly swap pointers: secondaryAudio (which is ALREADY playing the next song smoothly at ~8s at full volume) becomes primaryAudio!
    const previousPrimary = this.primaryAudio;
    this.primaryAudio = this.secondaryAudio;
    this.secondaryAudio = previousPrimary;

    // Ensure active primary audio volume is locked at target user volume
    this.primaryAudio.volume = this._volume;

    this._queueIndex = newIndex;
    this.isCrossfading = false;
    this.isCrossfadePaused = false;
    this.crossfadeTargetSong = null;
    this.crossfadeProgress = 0;
    this.crossfadeSongId = null;

    this.emit({ type: 'songchange', song: nextSong });
    this.emit({ type: 'play' });
    this.updateMediaSession(nextSong);
    this.saveCurrentSession();
    this.scheduleNextSongPreBuffer();
  }

  private cancelCrossfade(): void {
    if (this.crossfadeTimer) {
      clearInterval(this.crossfadeTimer);
      this.crossfadeTimer = null;
    }
    if (this.secondaryAudio) {
      this.secondaryAudio.pause();
      this.secondaryAudio.removeAttribute('src');
      this.secondaryAudio.load();
      this.secondaryAudio.volume = 0;
    }
    if (this.activeEngine === 'youtube') {
      youtubeAudioEngine.setVolume(this._volume);
    } else if (this.primaryAudio) {
      this.primaryAudio.volume = this._volume;
    }
    this.isCrossfading = false;
    this.isCrossfadePaused = false;
    this.crossfadeTargetSong = null;
    this.crossfadeProgress = 0;
    this.isResolvingCrossfade = false;
  }

  togglePlay() {
    this.isUserInteracted = true;
    const current = this.currentSong;
    if (!current) return;

    const isYouTubeTrack = current.provider === 'youtube' || current.id.startsWith('yt_');
    if (isYouTubeTrack || this.activeEngine === 'youtube') {
      this.cancelCrossfade();
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.activeEngine = 'youtube';
      if (youtubeAudioEngine.isPlaying()) {
        this.pause();
      } else {
        this.resume();
      }
      return;
    }

    youtubeAudioEngine.stop();
    this.activeEngine = 'html5';
    if (this.audio.paused) {
      this.resume();
    } else {
      this.audio.pause();
    }
  }

  pause() {
    const current = this.currentSong;
    const isYouTubeTrack = current?.provider === 'youtube' || current?.id.startsWith('yt_');
    if (isYouTubeTrack || this.activeEngine === 'youtube') {
      youtubeAudioEngine.pause();
      this.emit({ type: 'pause' });
      this.saveCurrentSession();
      return;
    }

    this.cancelCrossfade();
    this.audio.pause();
  }

  resume() {
    this.isUserInteracted = true;
    studioAudioEngine.resume();
    const current = this.currentSong;
    if (!current) return;

    const isYouTubeTrack = current.provider === 'youtube' || current.id.startsWith('yt_');
    if (isYouTubeTrack || this.activeEngine === 'youtube') {
      this.cancelCrossfade();
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.activeEngine = 'youtube';
      if (this.savedResumeTrackId === current.id || !youtubeAudioEngine.getCurrentVideoId()) {
        const resumePos = this.savedResumePosition || 0;
        this.savedResumePosition = 0;
        this.savedResumeTrackId = null;
        this.play(current, this._queue, this._queueIndex, resumePos);
        return;
      }
      youtubeAudioEngine.resume();
      return;
    }

    youtubeAudioEngine.stop();
    this.activeEngine = 'html5';

    if (this.audio.paused) {
      // If user explicitly resumes the restored session from previous app launch
      if (this.savedResumeTrackId === current.id) {
        const resumePos = this.savedResumePosition || 0;
        this.savedResumePosition = 0;
        this.savedResumeTrackId = null;
        if (!current.isDownloaded && !current.previewUrl?.startsWith('blob:')) {
          current.previewUrl = null;
        }
        this.play(current, this._queue, this._queueIndex, resumePos);
        return;
      }

      // If no valid audio src is loaded
      if (!this.audio.src || this.audio.src === '' || this.audio.src === window.location.href) {
        const curTime = this.audio.currentTime || this.savedResumePosition || 0;
        this.play(current, this._queue, this._queueIndex, curTime);
        return;
      }

      // Attempt to play existing src, and if play rejects (e.g. expired link), re-resolve stream cleanly
      this.audio.play().catch(() => {
        const curTime = this.audio.currentTime || this.savedResumePosition || 0;
        this.play(current, this._queue, this._queueIndex, curTime);
      });
    }
  }

  seek(progress: number) {
    this.cancelCrossfade();
    const p = Math.max(0, Math.min(1, progress));
    if (this.activeEngine === 'youtube') {
      const dur = youtubeAudioEngine.getDuration() || this.currentSong?.duration || 0;
      youtubeAudioEngine.seekTo(p * dur);
      this.pendingSeekPosition = 0;
      this.savedResumePosition = 0;
      this.savedResumeTrackId = null;
      this.saveCurrentSession();
      return;
    }

    const dur = this.audio.duration;
    if (!isNaN(dur) && dur > 0) {
      this.audio.currentTime = p * dur;
      this.pendingSeekPosition = 0;
      this.savedResumePosition = 0;
      this.savedResumeTrackId = null;
      this.saveCurrentSession();
    }
  }

  seekToTime(seconds: number) {
    this.cancelCrossfade();
    const s = Math.max(0, seconds);
    if (this.activeEngine === 'youtube') {
      youtubeAudioEngine.seekTo(s);
      this.pendingSeekPosition = 0;
      this.savedResumePosition = 0;
      this.savedResumeTrackId = null;
      this.saveCurrentSession();
      return;
    }

    this.audio.currentTime = s;
    this.pendingSeekPosition = 0;
    this.savedResumePosition = 0;
    this.savedResumeTrackId = null;
    this.saveCurrentSession();
  }

  // ─── Queue Navigation & Smart AutoPlay ────────────────────────────────────

  private handleEnded() {
    if (!this.isUserInteracted) return;

    // ── Premature short-preview cutoff detector for HTML5:
    // If playback ends in less than 35s on a track that is supposed to be full-length (>45s),
    // automatically re-resolve full stream via YouTube and continue uninterrupted.
    if (
      this.activeEngine === 'html5' &&
      this.audio.currentTime > 0 &&
      this.audio.currentTime < 35 &&
      this.currentSong &&
      this.currentSong.duration > 45 &&
      navigator.onLine
    ) {
      console.warn('Playback ended prematurely (<35s). Re-resolving via YouTube fallback...');
      const target = this.currentSong;
      const currentEndPos = Math.floor(this.audio.currentTime || 0);
      this.playViaYouTubeFallback(target, currentEndPos)
        .then((handled) => {
          if (!handled) this.proceedAfterEnded();
        })
        .catch(() => this.proceedAfterEnded());
      return;
    }

    this.proceedAfterEnded();
  }

  private proceedAfterEnded() {
    this.emit({ type: 'ended' });

    // Record track completion & automatically cache for Offline Backup
    if (this.currentSong) {
      const completedSong = this.currentSong;
      userProfileTracker.recordCompletion(completedSong);
      aiTasteProfileEngine.recordSongCompletion(completedSong);

      // Add to Offline Backup ONLY after the user has completely played that song
      const currentStream = this.activeEngine === 'html5' && this.audio.src && !this.audio.src.startsWith('blob:') ? this.audio.src : undefined;
      cacheSongForOfflineBackup(completedSong, currentStream).catch(() => {});
    }

    if (this._repeat === 'one') {
      if (this.activeEngine === 'youtube') {
        youtubeAudioEngine.seekTo(0);
        youtubeAudioEngine.resume();
      } else {
        this.audio.currentTime = 0;
        this.audio.play().catch(() => {});
      }
    } else if (this._repeat === 'all' || this._queueIndex < this._queue.length - 1) {
      this.next();
    } else if (this._autoPlay) {
      // End of queue reached -> Smart AutoPlay automatically generates and plays the next song!
      this.autoPlayNext();
    }
  }

  /**
   * Seamlessly fetches smart recommendations and plays the next best song.
   */
  async autoPlayNext() {
    if (this.isAutoPlayFetching) return;
    this.isAutoPlayFetching = true;

    try {
      let nextTrack = this.injectNextAutomixTrack();

      if (!nextTrack) {
        // If buffer is currently empty, fetch on-the-fly via YouTubeQueue 3-tier pipeline
        const current = this.currentSong;
        const existingIds = new Set<string>(this._queue.map((s) => s.id));
        const freshTracks = await YouTubeQueueService.generateSeedRadio(
          current,
          undefined,
          existingIds,
          this._queue
        );
        if (freshTracks && freshTracks.length > 0) {
          nextTrack = freshTracks[0];
          this._queue.push(...freshTracks);
          this._originalQueue.push(...freshTracks);
          this.emit({ type: 'queuechange' });
          this.saveCurrentSession();
        }
      }

      if (nextTrack) {
        this._queueIndex = this._queue.findIndex((s) => s.id === nextTrack!.id);
        if (this._queueIndex === -1) this._queueIndex = this._queue.length - 1;
        showToast(`AutoMix · Playing "${nextTrack.title}"`, 'info', 2200);
        await this.play(this._queue[this._queueIndex]);
      } else {
        // If no recommendation found, stop or notify
        this.emit({ type: 'ended' });
      }
    } catch (e) {
      console.warn('Smart AutoPlay error:', e);
      this.emit({ type: 'ended' });
    } finally {
      this.isAutoPlayFetching = false;
    }
  }

  next() {
    if (this._queue.length === 0) return;

    // Check if skipped early (< 25s or < 25% duration)
    const current = this.currentSong;
    if (current && this.audio.currentTime < 25 && (this.audio.duration > 40 || this.audio.currentTime < (this.audio.duration * 0.25))) {
      userProfileTracker.recordSkip(current, this.audio.currentTime);
      aiTasteProfileEngine.recordSongSkip(current);
    }

    if (this._queueIndex < this._queue.length - 1) {
      this._queueIndex++;
      this.play(this._queue[this._queueIndex]);
    } else if (this._repeat === 'all') {
      this._queueIndex = 0;
      this.play(this._queue[this._queueIndex]);
    } else if (this._autoPlay) {
      // AutoPlay next song when user hits next at the end of queue
      this.autoPlayNext();
    }
  }

  previous(forceTrackChange = false) {
    if (this._queue.length === 0) return;

    if (!forceTrackChange && this.audio.currentTime > 3 && this._queueIndex > 0) {
      this.audio.currentTime = 0;
      return;
    }

    if (this._queueIndex > 0) {
      this._queueIndex--;
      this.play(this._queue[this._queueIndex]);
    } else if (this._repeat === 'all') {
      this._queueIndex = this._queue.length - 1;
      this.play(this._queue[this._queueIndex]);
    } else {
      this.audio.currentTime = 0;
    }
  }

  addToQueue(song: Song) {
    // Prevent duplicate entries of the same track ID in queue
    if (this._queue.some((s) => s.id === song.id)) {
      showToast(`"${song.title}" is already in queue`, 'info', 2000);
      return;
    }
    this._queue.push(song);
    this._originalQueue.push(song);
    this.emit({ type: 'queuechange' });
    this.saveCurrentSession();
    showToast(`Added "${song.title}" to queue`, 'success', 2000);
  }

  removeFromQueue(index: number) {
    if (index === this._queueIndex) return; // cannot remove currently playing
    this._queue.splice(index, 1);
    if (index < this._queueIndex) this._queueIndex--;
    this.emit({ type: 'queuechange' });
    this.saveCurrentSession();
  }

  clearQueue() {
    const current = this.currentSong;
    this._queue = current ? [current] : [];
    this._originalQueue = current ? [current] : [];
    this._queueIndex = 0;
    this.emit({ type: 'queuechange' });
    this.saveCurrentSession();
  }

  reorderQueue(fromIndex: number, toIndex: number) {
    const [moved] = this._queue.splice(fromIndex, 1);
    this._queue.splice(toIndex, 0, moved);
    if (this._queueIndex === fromIndex) {
      this._queueIndex = toIndex;
    } else if (fromIndex < this._queueIndex && toIndex >= this._queueIndex) {
      this._queueIndex--;
    } else if (fromIndex > this._queueIndex && toIndex <= this._queueIndex) {
      this._queueIndex++;
    }
    this.emit({ type: 'queuechange' });
    this.saveCurrentSession();
  }

  // ─── MediaSession API (Lock screen / Notification controls) ───────────────

  private updateMediaSession(song: Song) {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: song.title,
      artist: song.artist,
      album: song.album,
      artwork: [
        { src: song.artwork, sizes: '96x96', type: 'image/jpeg' },
        { src: song.artwork, sizes: '128x128', type: 'image/jpeg' },
        { src: song.artwork, sizes: '256x256', type: 'image/jpeg' },
        { src: song.artworkLg || song.artwork, sizes: '512x512', type: 'image/jpeg' },
      ],
    });

    navigator.mediaSession.setActionHandler('play', () => {
      if (this.currentSong && (this.audio.src || this.activeEngine === 'youtube')) {
        this.resume();
      }
    });
    navigator.mediaSession.setActionHandler('pause', () => this.pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => {
      this.previous();
    });
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      this.next();
    });
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined && details.seekTime !== null) {
        this.seekToTime(details.seekTime);
      }
    });
  }

  private updateMediaSessionPosition() {
    if (!('mediaSession' in navigator)) return;
    if ('setPositionState' in navigator.mediaSession) {
      const dur = this.audio.duration;
      if (!isNaN(dur) && dur > 0) {
        try {
          navigator.mediaSession.setPositionState({
            duration: dur,
            playbackRate: this.audio.playbackRate,
            position: Math.min(this.audio.currentTime, dur),
          });
        } catch {
          // ignore transient errors
        }
      }
    }
  }

  // ─── Event Subscription ───────────────────────────────────────────────────

  subscribe(cb: AudioPlayerCallback): () => void {
    this.callbacks.add(cb);
    return () => this.callbacks.delete(cb);
  }

  private emit(event: AudioPlayerEvent) {
    this.callbacks.forEach((cb) => {
      try {
        cb(event);
      } catch (e) {
        console.error('AudioPlayer event error:', e);
      }
    });
  }

  destroy() {
    this.audio.pause();
    this.audio.src = '';
    this.callbacks.clear();
  }
}

export const audioPlayer = new AudioPlayer();
