// ══════════════════════════════════════════════════════════════════════════════
//  Soundwave Headless YouTube Audio Engine (Session Aware)
//  Ultra-fast, high-definition background YouTube audio playback engine
// ══════════════════════════════════════════════════════════════════════════════

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export type YouTubeEngineEvent =
  | { type: 'play'; sessionId: number }
  | { type: 'playing'; sessionId: number }
  | { type: 'pause'; sessionId: number }
  | { type: 'loading'; isLoading: boolean; sessionId: number }
  | { type: 'timeupdate'; currentTime: number; duration: number; progress: number; sessionId: number }
  | { type: 'ended'; sessionId: number }
  | { type: 'error'; error: string | null; sessionId: number };

export type YouTubeEngineCallback = (event: YouTubeEngineEvent) => void;

class YouTubeAudioEngine {
  private player: any = null;
  private isApiReady = false;
  private isPlayerReady = false;
  private activeSessionId = 0;
  private currentVideoId: string | null = null;
  private pendingVideoId: string | null = null;
  private pendingStartTime = 0;
  private pendingPlay = false;
  private pendingSessionId = 0;
  private volume = 1;
  private timeUpdateTimer: ReturnType<typeof setInterval> | null = null;
  private callbacks: Set<YouTubeEngineCallback> = new Set();
  private isEndedEmitted = false;
  private _isPlaying = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.initIframeApi();
    }
  }

  getCurrentVideoId(): string | null {
    return this.currentVideoId;
  }

  getActiveSessionId(): number {
    return this.activeSessionId;
  }

  /**
   * Loads the official YouTube Iframe Player API script.
   */
  public initIframeApi() {
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

    // Polling fallback in case onYouTubeIframeAPIReady already fired
    const pollTimer = setInterval(() => {
      if (window.YT && window.YT.Player) {
        clearInterval(pollTimer);
        this.isApiReady = true;
        this.createPlayer();
      }
    }, 150);
    setTimeout(() => clearInterval(pollTimer), 10000);

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
      container.style.width = '240px';
      container.style.height = '180px';
      container.style.opacity = '0.01';
      container.style.pointerEvents = 'none';
      container.style.zIndex = '1';
      container.style.overflow = 'hidden';
      document.body.appendChild(container);
    }

    // Remove old player div if present
    const oldDiv = document.getElementById('headless-yt-player-target');
    if (oldDiv) oldDiv.remove();

    const playerDiv = document.createElement('div');
    playerDiv.id = 'headless-yt-player-target';
    container.appendChild(playerDiv);

    try {
      this.player = new window.YT.Player('headless-yt-player-target', {
        height: '180',
        width: '240',
        host: 'https://www.youtube.com',
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          enablejsapi: 1,
          widget_referrer: 'https://music.youtube.com',
        },
        events: {
          onReady: () => {
            this.isPlayerReady = true;
            try {
              const iframe = typeof this.player.getIframe === 'function' ? this.player.getIframe() : null;
              if (iframe) {
                iframe.setAttribute('allow', 'autoplay; encrypted-media; fullscreen; picture-in-picture');
              }
              this.player.unMute?.();
              this.player.setVolume(Math.round(this.volume * 100));
            } catch {}
            if (this.pendingPlay && this.pendingSessionId === this.activeSessionId && this.pendingVideoId) {
              const vid = this.pendingVideoId;
              const start = this.pendingStartTime;
              const sid = this.pendingSessionId;
              this.pendingVideoId = null;
              this.pendingPlay = false;
              this.loadAndPlay(vid, sid, start);
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
            if (this.activeSessionId !== 0) {
              this.emit({ type: 'error', error: `YouTube audio stream error (${event.data})`, sessionId: this.activeSessionId });
              this.emit({ type: 'loading', isLoading: false, sessionId: this.activeSessionId });
            }
          },
        },
      });
    } catch (e) {
      console.warn('[YouTubeAudioEngine] Failed to create player:', e);
    }
  }

  private handleStateChange(state: number) {
    // If active session is 0 or stopped, force hard stop and discard
    if (this.activeSessionId === 0) {
      if (this.player && typeof this.player.pauseVideo === 'function') {
        try {
          this.player.mute?.();
          this.player.pauseVideo();
          this.player.stopVideo?.();
        } catch {}
      }
      return;
    }

    const sid = this.activeSessionId;

    // -1: unstarted, 0: ended, 1: playing, 2: paused, 3: buffering, 5: video cued
    if (state === 1) { // PLAYING
      this.isEndedEmitted = false;
      this._isPlaying = true;
      try {
        this.player.unMute?.();
        this.player.setVolume(Math.round(this.volume * 100));
      } catch {}
      this.emit({ type: 'loading', isLoading: false, sessionId: sid });
      this.emit({ type: 'play', sessionId: sid });
      this.emit({ type: 'playing', sessionId: sid });
      this.startTimeUpdate(sid);
    } else if (state === 2) { // PAUSED
      this._isPlaying = false;
      this.emit({ type: 'loading', isLoading: false, sessionId: sid });
      this.emit({ type: 'pause', sessionId: sid });
      this.stopTimeUpdate();
    } else if (state === 3) { // BUFFERING
      this.emit({ type: 'loading', isLoading: true, sessionId: sid });
      if (this.player && typeof this.player.playVideo === 'function') {
        try {
          this.player.unMute?.();
          this.player.playVideo();
        } catch {}
      }
    } else if (state === 5 || state === -1) { // CUED or UNSTARTED
      if (this.player && typeof this.player.playVideo === 'function') {
        try {
          this.player.unMute?.();
          this.player.playVideo();
        } catch {}
      }
    } else if (state === 0) { // ENDED
      if (!this.isEndedEmitted) {
        this.isEndedEmitted = true;
        this._isPlaying = false;
        this.stopTimeUpdate();
        this.emit({ type: 'loading', isLoading: false, sessionId: sid });
        this.emit({ type: 'ended', sessionId: sid });
      }
    }
  }

  private startTimeUpdate(sessionId: number) {
    this.stopTimeUpdate();
    this.timeUpdateTimer = setInterval(() => {
      if (this.activeSessionId !== sessionId || !this.player || !this.isPlayerReady) {
        this.stopTimeUpdate();
        return;
      }
      try {
        const currentTime = this.player.getCurrentTime() || 0;
        const duration = this.player.getDuration() || 0;
        const progress = duration > 0 ? currentTime / duration : 0;
        this.emit({ type: 'timeupdate', currentTime, duration, progress, sessionId });
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
   * Plays a YouTube video as audio for a specific session.
   */
  async loadAndPlay(videoId: string, sessionId: number, startSeconds = 0): Promise<void> {
    const cleanId = videoId.replace('yt_', '').replace('/watch?v=', '').trim();
    this.activeSessionId = sessionId;
    this.currentVideoId = cleanId;
    this.isEndedEmitted = false;
    this._isPlaying = false;

    if (!this.isPlayerReady || !this.player) {
      this.pendingVideoId = cleanId;
      this.pendingSessionId = sessionId;
      this.pendingStartTime = startSeconds;
      this.pendingPlay = true;
      this.initIframeApi();
      this.emit({ type: 'loading', isLoading: true, sessionId });
      return;
    }

    try {
      this.emit({ type: 'loading', isLoading: true, sessionId });
      try {
        this.player.unMute?.();
        this.player.setVolume(Math.round(this.volume * 100));
      } catch {}

      if (typeof this.player.loadVideoById === 'function') {
        this.player.loadVideoById({
          videoId: cleanId,
          startSeconds: startSeconds || 0,
        });
        this.player.playVideo();
      } else if (typeof this.player.cueVideoById === 'function') {
        this.player.cueVideoById(cleanId, startSeconds || 0);
        this.player.playVideo();
      }

      // Pulse play & un-mute at 250ms
      setTimeout(() => {
        if (this.activeSessionId === sessionId && this.activeSessionId !== 0 && this.player && typeof this.player.playVideo === 'function') {
          try {
            this.player.unMute?.();
            this.player.setVolume(Math.round(this.volume * 100));
            this.player.playVideo();
          } catch {}
        }
      }, 250);

      // Second pulse at 600ms
      setTimeout(() => {
        if (this.activeSessionId === sessionId && this.activeSessionId !== 0 && this.player && typeof this.player.playVideo === 'function') {
          try {
            this.player.unMute?.();
            this.player.setVolume(Math.round(this.volume * 100));
            this.player.playVideo();
          } catch {}
        }
      }, 600);

      // Loading dismissal watchdog (1200ms)
      setTimeout(() => {
        if (this.activeSessionId === sessionId && this.activeSessionId !== 0) {
          this._isPlaying = true;
          this.emit({ type: 'loading', isLoading: false, sessionId });
          this.emit({ type: 'play', sessionId });
          this.emit({ type: 'playing', sessionId });
          this.startTimeUpdate(sessionId);
        }
      }, 1200);
    } catch (e) {
      console.warn('[YouTubeAudioEngine] loadAndPlay error:', e);
      if (this.activeSessionId === sessionId) {
        this.emit({ type: 'error', error: 'Failed to start YouTube audio.', sessionId });
      }
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
        this.emit({ type: 'timeupdate', currentTime: seconds, duration, progress, sessionId: this.activeSessionId });
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
    if (this.activeSessionId === 0) return false;
    if (this._isPlaying) return true;
    if (this.player && this.isPlayerReady && typeof this.player.getPlayerState === 'function') {
      try {
        return this.player.getPlayerState() === 1; // 1 = PLAYING
      } catch {}
    }
    return false;
  }

  stop(): void {
    this.activeSessionId = 0;
    this._isPlaying = false;
    this.stopTimeUpdate();
    this.currentVideoId = null;
    this.pendingVideoId = null;
    this.pendingPlay = false;
    this.pendingSessionId = 0;
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
