// ══════════════════════════════════════════════════════════════════════════════
//  Soundwave Headless YouTube Audio Engine
//  Ultra-fast, high-definition background YouTube audio playback engine
// ══════════════════════════════════════════════════════════════════════════════

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export type YouTubeEngineEvent =
  | { type: 'play' }
  | { type: 'playing' }
  | { type: 'pause' }
  | { type: 'loading'; isLoading: boolean }
  | { type: 'timeupdate'; currentTime: number; duration: number; progress: number }
  | { type: 'ended' }
  | { type: 'error'; error: string | null };

export type YouTubeEngineCallback = (event: YouTubeEngineEvent) => void;

class YouTubeAudioEngine {
  private player: any = null;
  private isApiReady = false;
  private isPlayerReady = false;
  private currentVideoId: string | null = null;
  private pendingVideoId: string | null = null;
  private pendingStartTime = 0;
  private pendingPlay = false;
  private volume = 1;
  private timeUpdateTimer: ReturnType<typeof setInterval> | null = null;
  private callbacks: Set<YouTubeEngineCallback> = new Set();
  private isEndedEmitted = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.initIframeApi();
    }
  }

  getCurrentVideoId(): string | null {
    return this.currentVideoId;
  }

  /**
   * Loads the official YouTube Iframe Player API script.
   */
  private initIframeApi() {
    if (typeof window === 'undefined') return;

    if (window.YT && window.YT.Player) {
      this.isApiReady = true;
      this.createPlayer();
      return;
    }

    const prevCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (prevCallback) prevCallback();
      this.isApiReady = true;
      this.createPlayer();
    };

    if (!document.getElementById('youtube-iframe-api-script')) {
      const tag = document.createElement('script');
      tag.id = 'youtube-iframe-api-script';
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.async = true;
      const firstScriptTag = document.getElementsByTagName('script')[0];
      if (firstScriptTag && firstScriptTag.parentNode) {
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      } else {
        document.head.appendChild(tag);
      }
    }
  }

  /**
   * Initializes the hidden, headless YouTube player element.
   */
  private createPlayer() {
    if (typeof document === 'undefined' || !this.isApiReady || this.player) return;

    let container = document.getElementById('headless-yt-audio-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'headless-yt-audio-container';
      container.style.position = 'fixed';
      container.style.bottom = '0px';
      container.style.right = '0px';
      container.style.width = '200px';
      container.style.height = '200px';
      container.style.opacity = '0.001';
      container.style.pointerEvents = 'none';
      container.style.zIndex = '-1';
      document.body.appendChild(container);
    }

    const playerDiv = document.createElement('div');
    playerDiv.id = 'headless-yt-player-target';
    container.appendChild(playerDiv);

    try {
      this.player = new window.YT.Player('headless-yt-player-target', {
        height: '200',
        width: '200',
        host: 'https://www.youtube-nocookie.com',
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          enablejsapi: 1,
        },
        events: {
          onReady: () => {
            this.isPlayerReady = true;
            this.player.setVolume(Math.round(this.volume * 100));
            if (this.pendingVideoId && this.pendingPlay) {
              const vid = this.pendingVideoId;
              const start = this.pendingStartTime;
              this.pendingVideoId = null;
              this.pendingPlay = false;
              this.loadAndPlay(vid, start);
            } else {
              this.pendingVideoId = null;
              this.pendingPlay = false;
            }
          },
          onStateChange: (event: any) => {
            this.handleStateChange(event.data);
          },
          onError: (event: any) => {
            console.warn('[YouTubeAudioEngine] Player error event:', event.data);
            this.emit({ type: 'error', error: `YouTube audio stream error (${event.data})` });
            this.emit({ type: 'loading', isLoading: false });
          },
        },
      });
    } catch (e) {
      console.warn('[YouTubeAudioEngine] Failed to create player:', e);
    }
  }

  private handleStateChange(state: number) {
    // -1: unstarted, 0: ended, 1: playing, 2: paused, 3: buffering, 5: video cued
    if (state === 1) { // PLAYING
      this.isEndedEmitted = false;
      this.emit({ type: 'loading', isLoading: false });
      this.emit({ type: 'play' });
      this.emit({ type: 'playing' });
      this.startTimeUpdate();
    } else if (state === 2) { // PAUSED
      this.emit({ type: 'loading', isLoading: false });
      this.emit({ type: 'pause' });
      this.stopTimeUpdate();
    } else if (state === 3) { // BUFFERING
      this.emit({ type: 'loading', isLoading: true });
    } else if (state === 5) { // CUED
      if (this.player && typeof this.player.playVideo === 'function') {
        this.player.playVideo();
      }
    } else if (state === 0) { // ENDED
      if (!this.isEndedEmitted) {
        this.isEndedEmitted = true;
        this.stopTimeUpdate();
        this.emit({ type: 'loading', isLoading: false });
        this.emit({ type: 'ended' });
      }
    }
  }

  private startTimeUpdate() {
    this.stopTimeUpdate();
    this.timeUpdateTimer = setInterval(() => {
      if (!this.player || !this.isPlayerReady) return;
      try {
        const currentTime = this.player.getCurrentTime() || 0;
        const duration = this.player.getDuration() || 0;
        const progress = duration > 0 ? currentTime / duration : 0;
        this.emit({ type: 'timeupdate', currentTime, duration, progress });
      } catch {}
    }, 250);
  }

  private stopTimeUpdate() {
    if (this.timeUpdateTimer) {
      clearInterval(this.timeUpdateTimer);
      this.timeUpdateTimer = null;
    }
  }

  /**
   * Plays a YouTube video as audio.
   */
  async loadAndPlay(videoId: string, startSeconds = 0): Promise<void> {
    const cleanId = videoId.replace('yt_', '').replace('/watch?v=', '').trim();
    this.currentVideoId = cleanId;
    this.isEndedEmitted = false;

    if (!this.isPlayerReady || !this.player) {
      this.pendingVideoId = cleanId;
      this.pendingStartTime = startSeconds;
      this.pendingPlay = true;
      this.emit({ type: 'loading', isLoading: true });
      return;
    }

    try {
      this.emit({ type: 'loading', isLoading: true });
      if (typeof this.player.unMute === 'function') {
        try { this.player.unMute(); } catch {}
      }
      if (typeof this.player.loadVideoById === 'function') {
        this.player.loadVideoById({
          videoId: cleanId,
          startSeconds: startSeconds || 0,
        });
        this.player.setVolume(Math.round(this.volume * 100));
        this.player.playVideo();
      }
    } catch (e) {
      console.warn('[YouTubeAudioEngine] loadAndPlay error:', e);
      this.emit({ type: 'error', error: 'Failed to start YouTube audio.' });
    }
  }

  pause(): void {
    if (this.player && this.isPlayerReady && typeof this.player.pauseVideo === 'function') {
      try {
        this.player.pauseVideo();
      } catch {}
    }
    this.stopTimeUpdate();
  }

  resume(): void {
    if (this.player && this.isPlayerReady && typeof this.player.playVideo === 'function') {
      try {
        this.player.playVideo();
      } catch {}
    }
  }

  seekTo(seconds: number): void {
    if (this.player && this.isPlayerReady && typeof this.player.seekTo === 'function') {
      try {
        this.player.seekTo(seconds, true);
        const duration = this.player.getDuration() || 0;
        const progress = duration > 0 ? seconds / duration : 0;
        this.emit({ type: 'timeupdate', currentTime: seconds, duration, progress });
      } catch {}
    }
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.player && this.isPlayerReady && typeof this.player.setVolume === 'function') {
      try {
        this.player.setVolume(Math.round(this.volume * 100));
      } catch {}
    }
  }

  getCurrentTime(): number {
    if (this.player && this.isPlayerReady && typeof this.player.getCurrentTime === 'function') {
      try {
        return this.player.getCurrentTime() || 0;
      } catch {}
    }
    return 0;
  }

  getDuration(): number {
    if (this.player && this.isPlayerReady && typeof this.player.getDuration === 'function') {
      try {
        return this.player.getDuration() || 0;
      } catch {}
    }
    return 0;
  }

  isPlaying(): boolean {
    if (this.player && this.isPlayerReady && typeof this.player.getPlayerState === 'function') {
      try {
        return this.player.getPlayerState() === 1; // 1 = PLAYING
      } catch {}
    }
    return false;
  }

  stop(): void {
    this.stopTimeUpdate();
    this.currentVideoId = null;
    this.pendingVideoId = null;
    this.pendingPlay = false;
    if (this.player && this.isPlayerReady) {
      try {
        if (typeof this.player.mute === 'function') this.player.mute();
        if (typeof this.player.pauseVideo === 'function') this.player.pauseVideo();
        if (typeof this.player.stopVideo === 'function') this.player.stopVideo();
      } catch {}
    }
  }

  subscribe(callback: YouTubeEngineCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  private emit(event: YouTubeEngineEvent) {
    for (const cb of this.callbacks) {
      try {
        cb(event);
      } catch (err) {
        console.error('[YouTubeAudioEngine] callback error:', err);
      }
    }
  }
}

export const youtubeAudioEngine = new YouTubeAudioEngine();
