// ═══════════════════════════════════════════
//  Music Scrobbling Engine — ListenBrainz & Last.fm
//  Submits playing_now and scrobble events upon 50% playback progress
// ═══════════════════════════════════════════

import type { Song, ScrobbleConfig } from '../data/models';
import { audioPlayer } from '../domain/player/AudioPlayer';

const SCROBBLE_CONFIG_KEY = 'sw_scrobble_config';

class ScrobblingService {
  private config: ScrobbleConfig = {
    listenbrainzEnabled: false,
    listenbrainzToken: '',
    lastfmEnabled: false,
    lastfmApiKey: '',
    lastfmSessionKey: '',
  };

  private currentTrack: Song | null = null;
  private currentTrackScrobbled = false;
  private trackStartTime = 0;

  constructor() {
    this.loadConfig();
    this.initPlayerListener();
  }

  private loadConfig() {
    try {
      const raw = localStorage.getItem(SCROBBLE_CONFIG_KEY);
      if (raw) {
        this.config = { ...this.config, ...JSON.parse(raw) };
      }
    } catch {}
  }

  saveConfig(newConfig: Partial<ScrobbleConfig>) {
    this.config = { ...this.config, ...newConfig };
    try {
      localStorage.setItem(SCROBBLE_CONFIG_KEY, JSON.stringify(this.config));
    } catch {}
  }

  getConfig(): ScrobbleConfig {
    return { ...this.config };
  }

  private initPlayerListener() {
    audioPlayer.subscribe((event) => {
      switch (event.type) {
        case 'songchange':
          this.handleSongChange(event.song);
          break;
        case 'timeupdate':
          this.handleTimeUpdate(event.currentTime, event.duration, event.progress);
          break;
      }
    });
  }

  private handleSongChange(song: Song | null) {
    if (!song) {
      this.currentTrack = null;
      return;
    }
    this.currentTrack = song;
    this.currentTrackScrobbled = false;
    this.trackStartTime = Math.floor(Date.now() / 1000);

    // Send Now Playing notification
    if (this.config.listenbrainzEnabled && this.config.listenbrainzToken) {
      this.sendListenBrainzNowPlaying(song);
    }
    if (this.config.lastfmEnabled && this.config.lastfmApiKey) {
      this.sendLastfmNowPlaying(song);
    }
  }

  private handleTimeUpdate(currentTime: number, duration: number, progress: number) {
    if (!this.currentTrack || this.currentTrackScrobbled) return;

    // Scrobble condition: played for >= 50% or >= 240 seconds (standard Last.fm / ListenBrainz rule)
    const reachedHalf = progress >= 0.5;
    const reached4Minutes = currentTime >= 240;

    if (duration > 30 && (reachedHalf || reached4Minutes)) {
      this.currentTrackScrobbled = true;
      if (this.config.listenbrainzEnabled && this.config.listenbrainzToken) {
        this.scrobbleToListenBrainz(this.currentTrack, this.trackStartTime);
      }
      if (this.config.lastfmEnabled && this.config.lastfmApiKey) {
        this.scrobbleToLastfm(this.currentTrack, this.trackStartTime);
      }
    }
  }

  // ── ListenBrainz Implementation ──────────────────────────────────────────

  private async sendListenBrainzNowPlaying(song: Song) {
    try {
      await fetch('https://api.listenbrainz.org/1/submit-listens', {
        method: 'POST',
        headers: {
          'Authorization': `Token ${this.config.listenbrainzToken.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          listen_type: 'playing_now',
          payload: [
            {
              track_metadata: {
                artist_name: song.artist,
                track_name: song.title,
                release_name: song.album || song.title,
                additional_info: {
                  media_player: 'Soundwave',
                  duration: Math.round(song.duration),
                },
              },
            },
          ],
        }),
      });
    } catch {}
  }

  private async scrobbleToListenBrainz(song: Song, listenedAt: number) {
    try {
      await fetch('https://api.listenbrainz.org/1/submit-listens', {
        method: 'POST',
        headers: {
          'Authorization': `Token ${this.config.listenbrainzToken.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          listen_type: 'single',
          payload: [
            {
              listened_at: listenedAt,
              track_metadata: {
                artist_name: song.artist,
                track_name: song.title,
                release_name: song.album || song.title,
                additional_info: {
                  media_player: 'Soundwave',
                  duration_ms: Math.round(song.duration * 1000),
                },
              },
            },
          ],
        }),
      });
    } catch {}
  }

  // ── Last.fm Implementation ──────────────────────────────────────────────

  private async sendLastfmNowPlaying(song: Song) {
    if (!this.config.lastfmSessionKey) return;
    try {
      const params = new URLSearchParams({
        method: 'track.updateNowPlaying',
        artist: song.artist,
        track: song.title,
        album: song.album || '',
        duration: String(Math.round(song.duration)),
        api_key: this.config.lastfmApiKey.trim(),
        sk: this.config.lastfmSessionKey.trim(),
        format: 'json',
      });

      await fetch('https://ws.audioscrobbler.com/2.0/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
    } catch {}
  }

  private async scrobbleToLastfm(song: Song, timestamp: number) {
    if (!this.config.lastfmSessionKey) return;
    try {
      const params = new URLSearchParams({
        method: 'track.scrobble',
        artist: song.artist,
        track: song.title,
        timestamp: String(timestamp),
        album: song.album || '',
        duration: String(Math.round(song.duration)),
        api_key: this.config.lastfmApiKey.trim(),
        sk: this.config.lastfmSessionKey.trim(),
        format: 'json',
      });

      await fetch('https://ws.audioscrobbler.com/2.0/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
    } catch {}
  }

  /**
   * Validates a ListenBrainz token by querying user profile.
   */
  async validateListenBrainzToken(token: string): Promise<boolean> {
    if (!token.trim()) return false;
    try {
      const res = await fetch('https://api.listenbrainz.org/1/validate-token', {
        headers: { 'Authorization': `Token ${token.trim()}` },
      });
      const data = await res.json();
      return data?.valid === true;
    } catch {
      return false;
    }
  }
}

export const scrobblingService = new ScrobblingService();
