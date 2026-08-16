// ═══════════════════════════════════════════
//  AudioPlayer — HTML5 Audio singleton with Web Audio DSP
//  Handles playback, queue, MediaSession API, Full-Track Resolver,
//  Smart AutoPlay & Continuous Next Song Recommendation,
//  "Continue Listening" Persistence, and Real-time Audio Quality Switching
// ═══════════════════════════════════════════

import type { Song, RepeatMode, AudioQuality } from '../../data/models';
import { shuffle } from '../../core/utils';
import { resolveFullTrack, formatMediaUrlWithQuality } from '../../data/api/saavnApi';
import { cacheSongForOfflineBackup, getOfflineSongStream } from '../../services/OfflineBackupService';
import { showToast } from '../../core/utils/toast';
import { MediaNotificationService } from '../../services/MediaNotificationService';
import { smartRecommendationEngine } from '../recommendation/SmartRecommendationEngine';
import { userProfileTracker } from '../recommendation/UserProfileTracker';

export interface PlaybackSession {
  song: Song;
  playbackPosition: number;
  duration: number;
  progress: number;
  queue: Song[];
  queueIndex: number;
  updatedAt: number;
}

export const CONTINUE_LISTENING_KEY = 'sw_continue_listening_session';

type AudioPlayerCallback = (event: AudioPlayerEvent) => void;

export type AudioPlayerEvent =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'ended' }
  | { type: 'timeupdate'; currentTime: number; duration: number; progress: number }
  | { type: 'loading'; isLoading: boolean }
  | { type: 'error'; error: string }
  | { type: 'queuechange' }
  | { type: 'songchange'; song: Song | null }
  | { type: 'autoplaychange'; autoPlay: boolean }
  | { type: 'qualitychange'; quality: AudioQuality };

class AudioPlayer {
  private audio: HTMLAudioElement;
  private _queue: Song[] = [];
  private _originalQueue: Song[] = [];
  private _queueIndex = 0;
  private _shuffle = false;
  private _repeat: RepeatMode = 'off';
  private _volume = 1;
  private _autoPlay = true;
  private _audioQuality: AudioQuality = 'high';
  private callbacks: Set<AudioPlayerCallback> = new Set();



  // AutoPlay & Recommendation state
  private isAutoPlayFetching = false;
  private lastPrefetchedSongId: string | null = null;
  private lastTimeUpdateSecond = 0;

  // Continue Listening state
  private pendingSeekPosition = 0;
  private lastSavedPositionTime = 0;

  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.crossOrigin = 'anonymous';

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
    } catch {
      // default
    }

    this.restoreSavedSession();
    this.bindEvents();
  }

  /**
   * Restores the exact previous song, queue, and playback position on launch.
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
      this.pendingSeekPosition = session.playbackPosition || 0;

      if (session.song.previewUrl) {
        this.audio.src = session.song.previewUrl;
      }
    } catch {
      // ignore
    }
  }

  /**
   * Persists current song, queue, and playback position to localStorage.
   */
  public saveCurrentSession() {
    const song = this.currentSong;
    if (!song) return;

    const duration = this.audio.duration || song.duration || 0;
    let currentTime = this.audio.currentTime || 0;
    if (this.pendingSeekPosition > 0 && currentTime === 0) {
      currentTime = this.pendingSeekPosition;
    }

    const progress = duration > 0 ? currentTime / duration : 0;
    // If completed (≥ 95%), reset saved position to 0:00
    const savedPosition = progress >= 0.95 ? 0 : currentTime;

    const session: PlaybackSession = {
      song,
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
      if (this.currentSong) {
        MediaNotificationService.update(
          this.currentSong,
          true,
          this.audio.duration,
          this.audio.currentTime
        );
      }
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

      // Track listening duration in intelligence profile
      const currentSec = Math.floor(currentTime);
      if (currentSec > this.lastTimeUpdateSecond) {
        userProfileTracker.recordListeningDuration(currentSec - this.lastTimeUpdateSecond);
        this.lastTimeUpdateSecond = currentSec;
      }

      // Proactively pre-fetch next recommendations when 60% through the song and near queue end
      if (
        this._autoPlay &&
        progress > 0.60 &&
        this.currentSong &&
        this.lastPrefetchedSongId !== this.currentSong.id &&
        this._queueIndex >= this._queue.length - 1
      ) {
        this.lastPrefetchedSongId = this.currentSong.id;
        this.triggerSmartPreload(this.currentSong);
      }
    });

    this.audio.addEventListener('loadstart', () => this.emit({ type: 'loading', isLoading: true }));
    this.audio.addEventListener('canplay', () => this.emit({ type: 'loading', isLoading: false }));
    this.audio.addEventListener('error', () => {
      const err = this.audio.error;
      this.emit({ type: 'loading', isLoading: false });
      this.emit({ type: 'error', error: err?.message || 'Playback failed' });
    });

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
      if (nextTracks && nextTracks.length > 0 && this._queueIndex >= this._queue.length - 1) {
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

  get audioQuality(): AudioQuality {
    return this._audioQuality;
  }

  // ─── Playback ─────────────────────────────────────────────────────────────

  async play(song?: Song, queue?: Song[], startIndex?: number, seekToSeconds?: number) {
    if (queue && queue.length > 0) {
      this._originalQueue = [...queue];
      this._queue = this._shuffle ? shuffle(queue) : [...queue];
      this._queueIndex = startIndex !== undefined
        ? this._shuffle
          ? this._queue.findIndex((s) => s.id === queue[startIndex].id)
          : startIndex
        : 0;
    }

    if (seekToSeconds !== undefined) {
      this.pendingSeekPosition = seekToSeconds;
    }

    const targetSong = song || this._queue[this._queueIndex];
    if (!targetSong) return;

    this.lastTimeUpdateSecond = 0;
    userProfileTracker.recordPlay(targetSong);
    this.saveCurrentSession();

    this.emit({ type: 'loading', isLoading: true });

    // ── Offline Playback Rules ──
    if (!navigator.onLine) {
      let offlineUrl: string | null = null;
      try {
        offlineUrl = await getOfflineSongStream(targetSong.id);
      } catch {
        // ignore
      }

      if (!offlineUrl && targetSong.previewUrl && targetSong.previewUrl.startsWith('blob:')) {
        offlineUrl = targetSong.previewUrl;
      }

      if (offlineUrl) {
        targetSong.previewUrl = offlineUrl;
        targetSong.isDownloaded = true;
      } else {
        this.emit({ type: 'loading', isLoading: false });
        showToast("You're offline. This song isn't available for offline playback.", 'danger', 3200);
        return;
      }
    }

    // Check if we need to resolve full track
    const isShortPreview = (!targetSong.previewUrl && navigator.onLine)
      || targetSong.provider === 'itunes'
      || targetSong.id.startsWith('spotify_')
      || (targetSong.previewUrl && (
          targetSong.previewUrl.includes('p.scdn.co')
          || targetSong.previewUrl.includes('spotify.com')
          || targetSong.previewUrl.includes('apple.com')
          || targetSong.previewUrl.includes('mzstatic.com')
          || (!targetSong.previewUrl.includes('saavncdn.com') && !targetSong.previewUrl.startsWith('blob:'))
        ));

    if (isShortPreview && navigator.onLine) {
      try {
        const fullTrack = await resolveFullTrack(
          targetSong.title,
          targetSong.artist,
          this._audioQuality,
          targetSong.duration
        );
        if (fullTrack && fullTrack.streamUrl) {
          targetSong.previewUrl = fullTrack.streamUrl;
          if (fullTrack.duration > 0) {
            targetSong.duration = fullTrack.duration;
          }
          if (fullTrack.artwork && (targetSong.id.startsWith('spotify_') || !targetSong.artwork)) {
            targetSong.artwork = fullTrack.artwork;
            targetSong.artworkLg = fullTrack.artwork;
          }
          targetSong.provider = 'saavn';
        }
      } catch (e) {
        console.warn('Full track resolve fallback:', e);
      }
    }

    // Format current stream with selected audio quality
    if (targetSong.previewUrl && !targetSong.previewUrl.startsWith('blob:')) {
      targetSong.previewUrl = formatMediaUrlWithQuality(targetSong.previewUrl, this._audioQuality);
    }

    if (!targetSong.previewUrl) {
      this.emit({ type: 'loading', isLoading: false });
      this.emit({ type: 'error', error: `Audio source unavailable for "${targetSong.title}".` });
      showToast(`Audio unavailable for "${targetSong.title}". Skipping...`, 'info', 2000);
      if (this._queue.length > 1 && this._queueIndex < this._queue.length - 1) {
        setTimeout(() => {
          if (!this.isPlaying) this.next();
        }, 1200);
      }
      return;
    }

    this.audio.src = targetSong.previewUrl;
    this.audio.volume = this._volume;

    if (this.pendingSeekPosition > 0) {
      this.audio.currentTime = this.pendingSeekPosition;
      this.pendingSeekPosition = 0;
    }

    this.emit({ type: 'songchange', song: targetSong });
    this.updateMediaSession(targetSong);
    this.saveCurrentSession();

    // Auto-cache song for Spotify-style Offline Backup in the background
    if (targetSong.previewUrl && !targetSong.previewUrl.startsWith('blob:')) {
      cacheSongForOfflineBackup(targetSong, targetSong.previewUrl).catch(() => {});
    }

    try {
      const playPromise = this.audio.play();
      if (playPromise !== undefined) {
        await playPromise;
      }
    } catch {
      // Auto-retry once media stream is buffered without failing or alerting user
      const onCanPlayThrough = () => {
        this.audio.removeEventListener('canplay', onCanPlayThrough);
        this.audio.play().catch(() => {});
      };
      this.audio.addEventListener('canplay', onCanPlayThrough, { once: true });
    }
  }

  togglePlay() {
    if (this.audio.paused) {
      if (!this.audio.src && this.currentSong) {
        this.play(this.currentSong, this._queue, this._queueIndex, this.pendingSeekPosition);
      } else {
        if (this.pendingSeekPosition > 0 && Math.abs(this.audio.currentTime - this.pendingSeekPosition) > 1) {
          this.audio.currentTime = this.pendingSeekPosition;
          this.pendingSeekPosition = 0;
        }
        this.audio.play().catch(() => {});
      }
    } else {
      this.audio.pause();
    }
  }

  pause() { this.audio.pause(); }
  resume() {
    if (this.audio.paused) {
      if (!this.audio.src && this.currentSong) {
        this.play(this.currentSong, this._queue, this._queueIndex, this.pendingSeekPosition);
      } else {
        if (this.pendingSeekPosition > 0 && Math.abs(this.audio.currentTime - this.pendingSeekPosition) > 1) {
          this.audio.currentTime = this.pendingSeekPosition;
          this.pendingSeekPosition = 0;
        }
        this.audio.play().catch(() => {});
      }
    }
  }

  seek(progress: number) {
    const dur = this.audio.duration;
    if (!isNaN(dur) && dur > 0) {
      this.audio.currentTime = progress * dur;
      this.pendingSeekPosition = 0;
      this.saveCurrentSession();
    }
  }

  seekToTime(seconds: number) {
    this.audio.currentTime = seconds;
    this.pendingSeekPosition = 0;
    this.saveCurrentSession();
  }

  // ─── Queue Navigation & Smart AutoPlay ────────────────────────────────────

  private handleEnded() {
    this.emit({ type: 'ended' });

    // Record track completion
    if (this.currentSong) {
      userProfileTracker.recordCompletion(this.currentSong);
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
      const current = this.currentSong;
      const context = this.getRecommendationContext();
      const nextTracks = await smartRecommendationEngine.getSmartNextTracks(current, 5, context);

      if (nextTracks && nextTracks.length > 0) {
        // Append recommended songs to queue seamlessly
        this._queue.push(...nextTracks);
        this._originalQueue.push(...nextTracks);
        this._queueIndex++;
        this.emit({ type: 'queuechange' });

        showToast(`AutoPlay · Playing "${nextTracks[0].title}"`, 'info', 2200);
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
