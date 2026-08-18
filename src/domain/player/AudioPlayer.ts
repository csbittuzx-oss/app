// ═══════════════════════════════════════════
//  AudioPlayer — HTML5 Audio singleton with Web Audio DSP
//  Handles playback, queue, MediaSession API, Full-Track Resolver,
//  Smart AutoPlay & Continuous Next Song Recommendation,
//  "Continue Listening" Persistence, and Real-time Audio Quality Switching
//  Adaptive Streaming — network-aware buffering, smart cache, pre-buffer
// ═══════════════════════════════════════════

import type { Song, RepeatMode, AudioQuality, ActiveAudioStreamInfo } from '../../data/models';
import { shuffle } from '../../core/utils';
import { resolveFullTrack, formatMediaUrlWithQuality, isPreviewAudioUrl } from '../../data/api/saavnApi';
import { cacheCompletedSongForOfflineBackup, getOfflineSongStream } from '../../services/OfflineBackupService';
import { showToast } from '../../core/utils/toast';
import { MediaNotificationService } from '../../services/MediaNotificationService';
import { detectAudioStreamQuality } from '../../core/utils/audioQualityDetector';
import {
  smartRecommendationEngine,
  getCoreTitle,
  isSameOrSimilarTitle,
} from '../recommendation/SmartRecommendationEngine';
import { userProfileTracker } from '../recommendation/UserProfileTracker';
import { aiTasteProfileEngine } from '../ai/AITasteProfileEngine';
import { adaptiveStreaming } from '../../services/AdaptiveStreamingService';
import { studioAudioEngine } from './StudioAudioEngine';
import { YouTubeQueueService } from '../../services/YouTubeQueue';
import { BeatAnalyzer } from './BeatAnalyzer';

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
  | { type: 'streaminfochange'; info: ActiveAudioStreamInfo }
  | { type: 'ridingmodechange'; ridingMode: boolean };

class AudioPlayer {
  private audio: HTMLAudioElement;
  private crossfadeAudio: HTMLAudioElement;
  private _queue: Song[] = [];
  private _originalQueue: Song[] = [];
  private _queueIndex = 0;
  private _shuffle = false;
  private _repeat: RepeatMode = 'off';
  private _volume = 1;
  private _autoPlay = true;
  private _ridingMode = false;
  private _audioQuality: AudioQuality = 'aac_256';
  private callbacks: Set<AudioPlayerCallback> = new Set();

  // Endless Seed Radio & Automix state
  private _automixQueue: Song[] = [];
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
  // Generation counter: incremented on every play() call to cancel stale async requests
  private _playGeneration = 0;

  // Continue Listening & Resume state (Restored from previous session exclusively for resume)
  private savedResumeTrackId: string | null = null;
  private savedResumePosition = 0;
  private pendingSeekPosition = 0;
  private lastSavedPositionTime = 0;

  // Real listening & full completion tracking for Offline Backup
  private currentSongAccumulatedPlaybackSec = 0;
  private lastPlaybackTimestamp = 0;
  private currentSongCachedForOffline = false;
  private currentPlayingStreamUrl: string | null = null;

  constructor() {
    this.audio = new Audio();
    this.crossfadeAudio = new Audio();
    adaptiveStreaming.configureAudioElement(this.audio);
    adaptiveStreaming.configureAudioElement(this.crossfadeAudio);
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
    studioAudioEngine.attachAudioElement(this.audio);
    studioAudioEngine.attachAudioElement(this.crossfadeAudio);
    studioAudioEngine.setQuality(this._audioQuality);
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

      if (session.song.previewUrl) {
        this.audio.src = session.song.previewUrl;
      }
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

    const duration = this.audio.duration || song.duration || 0;
    let currentTime = this.audio.currentTime || 0;
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
      onPlay: () => this.resume(),
      onPause: () => this.pause(),
      onNext: () => this.next(),
      onPrev: () => this.previous(),
      onSeekTo: (seconds) => this.seekToTime(seconds),
    });

    this.audio.addEventListener('play', () => {
      this.emit({ type: 'play' });
      this.emit({ type: 'error', error: null });
      if (this.currentSong) {
        MediaNotificationService.update(
          this.currentSong,
          true,
          this.audio.duration,
          this.audio.currentTime
        );
      }
    });

    this.audio.addEventListener('playing', () => {
      this.emit({ type: 'loading', isLoading: false });
      this.emit({ type: 'error', error: null });
    });

    this.audio.addEventListener('pause', () => {
      this.emit({ type: 'pause' });
      this.saveCurrentSession();
      if (this.currentSong) {
        MediaNotificationService.update(
          this.currentSong,
          false,
          this.audio.duration,
          this.audio.currentTime
        );
      }
    });

    this.audio.addEventListener('ended', () => {
      this.saveCurrentSession();
      this.handleEnded();
    });

    this.audio.addEventListener('timeupdate', () => {
      const duration = this.audio.duration || 0;
      const currentTime = this.audio.currentTime;
      const progress = duration > 0 ? currentTime / duration : 0;
      this.emit({ type: 'timeupdate', currentTime, duration, progress });
      this.updateMediaSessionPosition();

      // Periodically persist playback position every 4 seconds
      const now = Date.now();
      if (now - this.lastSavedPositionTime > 4000) {
        this.lastSavedPositionTime = now;
        this.saveCurrentSession();
      }

      // Track actual playback elapsed duration
      if (this.lastPlaybackTimestamp > 0 && !this.audio.paused) {
        const deltaSec = (now - this.lastPlaybackTimestamp) / 1000;
        if (deltaSec > 0 && deltaSec < 3) {
          this.currentSongAccumulatedPlaybackSec += deltaSec;
        }
      }
      this.lastPlaybackTimestamp = now;

      // Offline Backup: Strict Completion Rule (~95%+ duration + >= 85% actual playback time)
      if (
        !this.currentSongCachedForOffline &&
        this.currentSong &&
        duration > 25 &&
        progress >= 0.95 &&
        this.currentSongAccumulatedPlaybackSec >= duration * 0.85 &&
        this.currentPlayingStreamUrl &&
        !this.currentPlayingStreamUrl.startsWith('blob:') &&
        navigator.onLine
      ) {
        this.currentSongCachedForOffline = true;
        cacheCompletedSongForOfflineBackup(this.currentSong, this.currentPlayingStreamUrl).catch(() => {});
      }

      // Track listening duration in intelligence profile
      const currentSec = Math.floor(currentTime);
      if (currentSec > this.lastTimeUpdateSecond) {
        userProfileTracker.recordListeningDuration(currentSec - this.lastTimeUpdateSecond);
        this.lastTimeUpdateSecond = currentSec;
      }

      // When Riding Mode is ON, continuously check remaining duration and trigger DJ crossfade 8-9s before track end
      if (
        this._ridingMode &&
        !this.isCrossfading &&
        !this.isResolvingCrossfade &&
        !this.audio.paused &&
        this.currentSong &&
        this.crossfadeSongId !== this.currentSong.id &&
        duration > 15 &&
        currentTime > 0
      ) {
        const remaining = duration - currentTime;
        if (remaining > 0 && remaining <= 9 && this._repeat !== 'one') {
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
    });

    this.audio.addEventListener('loadstart', () => this.emit({ type: 'loading', isLoading: true }));
    this.audio.addEventListener('canplay', () => {
      this.emit({ type: 'loading', isLoading: false });
      this.emit({ type: 'error', error: null });
    });
    this.audio.addEventListener('error', () => {
      const err = this.audio.error;
      // Filter out abort errors, empty src resets during song switching, or unmounted states
      if (!this.audio.src || !this.currentSong || err?.code === MediaError.MEDIA_ERR_ABORTED) {
        return;
      }

      this.emit({ type: 'loading', isLoading: false });
      this.emit({ type: 'error', error: 'Playback failed. Tap to retry.' });
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

      return {
        languages,
        favorites,
        userPlaylists,
        searchHistory,
        recentlyPlayed,
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
    this.emit({ type: 'qualitychange', quality });
    this.emit({ type: 'streaminfochange', info: this.getActiveAudioInfo() });

    // Save preference
    try {
      const cfg = JSON.parse(localStorage.getItem('sw_config') || '{}');
      cfg.audioQuality = quality;
      localStorage.setItem('sw_config', JSON.stringify(cfg));
    } catch {}

    // If currently playing a track with dynamic streaming, refresh audio source without losing position
    const current = this.currentSong;
    if (current && current.previewUrl && !current.previewUrl.startsWith('blob:')) {
      const currentTime = this.audio.currentTime;
      const wasPlaying = !this.audio.paused;

      const formattedUrl = formatMediaUrlWithQuality(current.previewUrl, quality);
      if (formattedUrl && formattedUrl !== this.audio.src) {
        current.previewUrl = formattedUrl;
        this.audio.src = formattedUrl;
        this.audio.currentTime = currentTime;
        if (wasPlaying) {
          this.audio.play().catch(() => {});
        }
      }
    }
  }

  /**
   * Returns verified real-time stream quality and codec specifications.
   */
  public getActiveAudioInfo(): ActiveAudioStreamInfo {
    return detectAudioStreamQuality(this.currentSong, this.audio.src, this._audioQuality);
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
    return !this.audio.paused;
  }

  get volume(): number {
    return this._volume;
  }

  set volume(v: number) {
    this._volume = Math.max(0, Math.min(1, v));
    this.audio.volume = this._volume;
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
    const existingCores = new Set<string>(this._queue.map((s) => getCoreTitle(s.title)).filter(Boolean));
    if (currentCore) existingCores.add(currentCore);

    let nextSong: Song | null = null;

    while (this._automixQueue.length > 0) {
      const candidate = this._automixQueue.shift()!;
      const candCore = getCoreTitle(candidate.title);

      // Enforce ID and title uniqueness
      if (
        !existingIds.has(candidate.id) &&
        (!candCore || !existingCores.has(candCore)) &&
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

    // Replenish buffer if low (< 5 items)
    if (this._automixQueue.length < 5) {
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

    // ── Generation counter – every play() call gets a unique ID.
    //    Any async step checks this before touching the audio element.
    //    If a newer play() arrived while we were awaiting, we bail out.
    this._playGeneration = (this._playGeneration + 1) & 0x7fffffff;
    const myGen = this._playGeneration;

    // ── Cancel all in-flight adaptive stream downloads immediately ──
    adaptiveStreaming.cancelAllExcept('');   // abort every pending download
    this.currentStreamSongId = targetSong.id;
    this.nextSongPreBuffered = null;
    this.crossfadeSongId = null;

    // ── Immediately stop the old song and clear the audio element ──
    //    This ensures the previous song stops playing RIGHT NOW, before any async work.
    this.audio.pause();
    this.audio.src = '';

    // ── Correct Playback State Rules ──
    if (seekToSeconds !== undefined) {
      this.pendingSeekPosition = seekToSeconds;
    } else {
      this.pendingSeekPosition = 0;
      this.savedResumePosition = 0;
      this.savedResumeTrackId = null;
    }

    this.lastTimeUpdateSecond = 0;
    userProfileTracker.recordPlay(targetSong);
    aiTasteProfileEngine.recordSongPlay(targetSong);

    // ── Immediately update UI with new song info (artwork, title, artist) ──
    this.emit({ type: 'songchange', song: targetSong });
    this.emit({ type: 'loading', isLoading: true });
    this.updateMediaSession(targetSong);

    // ── Offline check ──
    if (!navigator.onLine) {
      let offlineUrl: string | null = null;
      try { offlineUrl = await getOfflineSongStream(targetSong.id); } catch {}

      if (!offlineUrl && targetSong.previewUrl?.startsWith('blob:')) {
        offlineUrl = targetSong.previewUrl;
      }

      if (!offlineUrl) {
        try {
          const cached = await adaptiveStreaming.getCachedUrl(targetSong.id, targetSong.previewUrl || '');
          if (cached) offlineUrl = cached;
        } catch {}
      }

      if (myGen !== this._playGeneration) return;   // newer song selected, bail

      if (offlineUrl) {
        targetSong.previewUrl = offlineUrl;
        targetSong.isDownloaded = true;
        targetSong.provider = 'offline';
        this.audio.src = offlineUrl;
        this.audio.volume = this._volume;

        if (this.pendingSeekPosition > 0) {
          this.audio.currentTime = this.pendingSeekPosition;
          this.pendingSeekPosition = 0;
        } else {
          this.audio.currentTime = 0;
        }

        this.emit({ type: 'songchange', song: { ...targetSong } });
        this.emit({ type: 'loading', isLoading: false });
        this.updateMediaSession(targetSong);
        this.saveCurrentSession();

        try {
          const playPromise = this.audio.play();
          if (playPromise !== undefined) await playPromise;
        } catch {
          const onCanPlay = () => {
            this.audio.removeEventListener('canplay', onCanPlay);
            if (myGen === this._playGeneration) this.audio.play().catch(() => {});
          };
          this.audio.addEventListener('canplay', onCanPlay, { once: true });
        }
        return; // Direct offline play completed!
      } else {
        this.emit({ type: 'loading', isLoading: false });
        this.emit({ type: 'error', error: `Audio source unavailable for "${targetSong.title}".` });
        showToast("You're offline. This song isn't available for offline playback.", 'danger', 3200);
        return;
      }
    }

    // ── Full-track URL resolution (Spotify / iTunes / Previews → JioSaavn) ──
    const isShortPreview = (!targetSong.previewUrl && navigator.onLine)
      || targetSong.provider === 'itunes'
      || targetSong.id.startsWith('spotify_')
      || isPreviewAudioUrl(targetSong.previewUrl);

    if (isShortPreview && navigator.onLine) {
      try {
        const isSpotifyImport = targetSong.id.startsWith('spotify_');
        const fullTrack = await resolveFullTrack(
          targetSong.title,
          targetSong.artist,
          this._audioQuality,
          targetSong.duration,
          isSpotifyImport
        );
        if (myGen !== this._playGeneration) return;   // newer song selected, bail
        if (fullTrack?.streamUrl && !isPreviewAudioUrl(fullTrack.streamUrl)) {
          targetSong.previewUrl = fullTrack.streamUrl;
          if (fullTrack.duration > 0) targetSong.duration = fullTrack.duration;
          // Strictly preserve the selected track's original artwork; only fallback if artwork is completely missing
          if (!targetSong.artwork && fullTrack.artwork) {
            targetSong.artwork = fullTrack.artwork;
            targetSong.artworkLg = fullTrack.artwork;
          }
          targetSong.provider = 'saavn';
          this.emit({ type: 'songchange', song: { ...targetSong } });
        }
      } catch (e) {
        console.warn('Full track resolve fallback:', e);
      }
    }

    // ── Additional Full-Stream Guarantee: if previewUrl is STILL missing or a short preview clip
    if ((!targetSong.previewUrl || isPreviewAudioUrl(targetSong.previewUrl)) && navigator.onLine) {
      try {
        const { resolveYouTubeFullAudioStream } = await import('../../data/api/youtubeMusicApi');
        const ytStream = await resolveYouTubeFullAudioStream(targetSong.title, targetSong.artist, targetSong.duration);
        if (myGen !== this._playGeneration) return;
        if (ytStream?.streamUrl && !isPreviewAudioUrl(ytStream.streamUrl)) {
          targetSong.previewUrl = ytStream.streamUrl;
          if (ytStream.duration > 0) targetSong.duration = ytStream.duration;
          // Strictly preserve the selected track's original artwork; only fallback if artwork is completely missing
          if (!targetSong.artwork && ytStream.artwork) {
            targetSong.artwork = ytStream.artwork;
            targetSong.artworkLg = ytStream.artwork;
          }
          targetSong.provider = 'youtube';
          this.emit({ type: 'songchange', song: { ...targetSong } });
        }
      } catch (e) {
        console.warn('YouTube full stream resolve fallback:', e);
      }
    }

    if (myGen !== this._playGeneration) return;   // newer song selected, bail

    if (!targetSong.previewUrl || isPreviewAudioUrl(targetSong.previewUrl)) {
      this.emit({ type: 'loading', isLoading: false });
      this.emit({ type: 'error', error: `Audio source unavailable for "${targetSong.title}".` });
      showToast(`Audio unavailable for "${targetSong.title}". Skipping...`, 'info', 2000);
      if (this._queue.length > 1 && this._queueIndex < this._queue.length - 1) {
        setTimeout(() => { if (myGen === this._playGeneration && !this.isPlaying) this.next(); }, 1200);
      }
      return;
    }

    // ── Resolve stream URL ──
    // Strategy: check cache first for instant play, then fall back to native streaming.
    let resolvedUrl = formatMediaUrlWithQuality(targetSong.previewUrl, this._audioQuality);

    if (!targetSong.previewUrl.startsWith('blob:') && navigator.onLine) {
      try {
        const cachedUrl = await adaptiveStreaming.getCachedUrl(targetSong.id, resolvedUrl);
        if (myGen !== this._playGeneration) return;
        if (cachedUrl) {
          resolvedUrl = cachedUrl;
        }
      } catch {
        // cache lookup fallback
      }
    }

    if (myGen !== this._playGeneration) return;   // newer song selected, bail

    // ── Set audio source and start playback ──
    targetSong.previewUrl = resolvedUrl;
    this.audio.src = resolvedUrl;
    this.audio.volume = this._volume;

    // Reset tracking state for full playback completion
    this.currentSongAccumulatedPlaybackSec = 0;
    this.lastPlaybackTimestamp = Date.now();
    this.currentSongCachedForOffline = false;
    this.currentPlayingStreamUrl = resolvedUrl;

    if (this.pendingSeekPosition > 0) {
      this.audio.currentTime = this.pendingSeekPosition;
      this.pendingSeekPosition = 0;
    } else {
      this.audio.currentTime = 0;
    }

    this.saveCurrentSession();

    // Background-download into the adaptive streaming cache for future instant-play
    if (!resolvedUrl.startsWith('blob:') && navigator.onLine) {
      adaptiveStreaming.preBufferSong(targetSong.id, resolvedUrl, this._audioQuality);
    }

    try {
      const playPromise = this.audio.play();
      if (playPromise !== undefined) await playPromise;
    } catch {
      // Retry once the browser has buffered enough data
      const onCanPlay = () => {
        this.audio.removeEventListener('canplay', onCanPlay);
        if (myGen === this._playGeneration) this.audio.play().catch(() => {});
      };
      this.audio.addEventListener('canplay', onCanPlay, { once: true });
    }

    if (myGen !== this._playGeneration) return;

    // ── Schedule pre-buffer of the next song in queue ──
    this.scheduleNextSongPreBuffer();
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

  // ─── Riding Mode DJ Crossfade Engine ───────────────────────────────────────

  private async startCrossfade(): Promise<void> {
    if (this.isCrossfading || this.isResolvingCrossfade || !this._ridingMode || this.audio.paused) return;

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

      if (!this._ridingMode || this.audio.paused || !streamUrl || isPreviewAudioUrl(streamUrl)) {
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

      if (!this._ridingMode || this.audio.paused) return;

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

      if (this.audio) this.audio.volume = fadeOutVol;
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

    // Stop and completely clean up old audio instance
    this.audio.pause();
    this.audio.src = '';
    this.audio.volume = this._volume;

    // Swap audio element instances
    const oldPrimary = this.audio;
    this.audio = this.crossfadeAudio;
    this.crossfadeAudio = oldPrimary;
    this.crossfadeAudio.volume = 0;
    this.crossfadeAudio.src = '';
    this.audio.volume = this._volume;

    this._queueIndex = newIndex;
    this.isCrossfading = false;
    this.isCrossfadePaused = false;
    this.crossfadeTargetSong = null;
    this.crossfadeProgress = 0;
    this.crossfadeSongId = null;

    // Reattach event listeners to new primary audio element
    this.bindEvents();

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
    if (this.crossfadeAudio) {
      this.crossfadeAudio.pause();
      this.crossfadeAudio.src = '';
      this.crossfadeAudio.volume = 0;
    }
    if (this.audio) {
      this.audio.volume = this._volume;
    }
    this.isCrossfading = false;
    this.isCrossfadePaused = false;
    this.crossfadeTargetSong = null;
    this.crossfadeProgress = 0;
    this.isResolvingCrossfade = false;
  }

  togglePlay() {
    if (this.isCrossfading) {
      if (this.isCrossfadePaused || this.audio.paused) {
        this.resume();
      } else {
        this.pause();
      }
      return;
    }

    if (this.audio.paused) {
      this.resume();
    } else {
      this.audio.pause();
    }
  }

  pause() {
    if (this.isCrossfading) {
      this.isCrossfadePaused = true;
      this.audio.pause();
      if (this.crossfadeAudio && !this.crossfadeAudio.paused) {
        this.crossfadeAudio.pause();
      }
      this.emit({ type: 'pause' });
      return;
    }
    this.cancelCrossfade();
    this.audio.pause();
  }

  resume() {
    studioAudioEngine.resume();
    if (this.isCrossfading && this.isCrossfadePaused) {
      this.isCrossfadePaused = false;
      this.audio.play().catch(() => {});
      if (this.crossfadeAudio && this.crossfadeAudio.src) {
        this.crossfadeAudio.play().catch(() => {});
      }
      this.emit({ type: 'play' });
      return;
    }

    if (this.audio.paused) {
      const current = this.currentSong;
      // If user explicitly resumes the restored session from previous app launch
      if (current && this.savedResumeTrackId === current.id && this.savedResumePosition > 0) {
        const resumePos = this.savedResumePosition;
        this.savedResumePosition = 0;
        this.savedResumeTrackId = null;
        if (!this.audio.src) {
          this.play(current, this._queue, this._queueIndex, resumePos);
          return;
        } else {
          this.audio.currentTime = resumePos;
          this.audio.play().catch(() => {});
        }
      } else if (!this.audio.src && this.currentSong) {
        this.play(this.currentSong, this._queue, this._queueIndex);
      } else {
        this.audio.play().catch(() => {});
      }
    }
  }

  seek(progress: number) {
    this.cancelCrossfade();
    const dur = this.audio.duration;
    if (!isNaN(dur) && dur > 0) {
      this.audio.currentTime = progress * dur;
      this.pendingSeekPosition = 0;
      this.savedResumePosition = 0;
      this.savedResumeTrackId = null;
      this.saveCurrentSession();
    }
  }

  seekToTime(seconds: number) {
    this.cancelCrossfade();
    this.audio.currentTime = seconds;
    this.pendingSeekPosition = 0;
    this.savedResumePosition = 0;
    this.savedResumeTrackId = null;
    this.saveCurrentSession();
  }

  // ─── Queue Navigation & Smart AutoPlay ────────────────────────────────────

  private handleEnded() {
    // ── Premature short-preview cutoff detector:
    // If playback ends in less than 35s on a track that is supposed to be full-length (>45s),
    // automatically re-resolve full stream via YouTube and continue uninterrupted.
    if (
      this.audio.currentTime > 0 &&
      this.audio.currentTime < 35 &&
      this.currentSong &&
      this.currentSong.duration > 45 &&
      navigator.onLine
    ) {
      console.warn('Playback ended prematurely (<35s). Re-resolving full stream...');
      const target = this.currentSong;
      import('../../data/api/youtubeMusicApi')
        .then(({ resolveYouTubeFullAudioStream }) => {
          return resolveYouTubeFullAudioStream(target.title, target.artist, target.duration);
        })
        .then((res) => {
          if (res?.streamUrl && this.currentSong?.id === target.id) {
            target.previewUrl = res.streamUrl;
            this.audio.src = res.streamUrl;
            this.audio.currentTime = 0;
            this.audio.play().catch(() => {});
            return;
          }
          this.proceedAfterEnded();
        })
        .catch(() => this.proceedAfterEnded());
      return;
    }

    this.proceedAfterEnded();
  }

  private proceedAfterEnded() {
    this.emit({ type: 'ended' });

    // Record track completion
    if (this.currentSong) {
      userProfileTracker.recordCompletion(this.currentSong);
      aiTasteProfileEngine.recordSongCompletion(this.currentSong);

      // Offline Backup: Cache track if naturally completed and not cached yet
      if (
        !this.currentSongCachedForOffline &&
        this.currentPlayingStreamUrl &&
        !this.currentPlayingStreamUrl.startsWith('blob:') &&
        navigator.onLine
      ) {
        this.currentSongCachedForOffline = true;
        cacheCompletedSongForOfflineBackup(this.currentSong, this.currentPlayingStreamUrl).catch(() => {});
      }
    }

    if (this._repeat === 'one') {
      this.audio.currentTime = 0;
      this.audio.play().catch(() => {});
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

    navigator.mediaSession.setActionHandler('play', () => this.resume());
    navigator.mediaSession.setActionHandler('pause', () => this.pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => this.previous());
    navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
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
