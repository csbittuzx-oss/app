// ═══════════════════════════════════════════
//  UserProfileTracker — Continuous Listening Intelligence
//  Learns from plays, completions, skips, replays, likes,
//  searches, and listening duration in real time.
// ═══════════════════════════════════════════

import type { Song } from '../../data/models';

export interface TrackAffinity {
  playCount: number;
  completionCount: number;
  skipCount: number;
  replayCount: number;
  totalDurationSec: number;
  lastPlayedAt: number;
}

export interface ArtistAffinity {
  playCount: number;
  completionCount: number;
  skipCount: number;
  lastPlayedAt: number;
}

export interface UserListeningProfile {
  trackAffinities: Record<string, TrackAffinity>;
  artistAffinities: Record<string, ArtistAffinity>;
  genreAffinities: Record<string, number>;
  recentSongIds: string[]; // up to 50 song IDs (newest first)
  recentArtists: string[]; // up to 30 artist names (newest first)
  recentSearches: string[]; // up to 25 search queries
  totalListeningSeconds: number;
  totalPlays: number;
  totalCompletions: number;
  totalSkips: number;
}

const STORAGE_KEY = 'sw_user_profile';

function normalizeArtist(str: string): string {
  return (str || '')
    .toLowerCase()
    .split(/[,&/]|feat\.|ft\.|with|\s+x\s+/i)[0]
    ?.trim() || '';
}

function loadProfile(): UserListeningProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        trackAffinities: parsed.trackAffinities || {},
        artistAffinities: parsed.artistAffinities || {},
        genreAffinities: parsed.genreAffinities || {},
        recentSongIds: Array.isArray(parsed.recentSongIds) ? parsed.recentSongIds : [],
        recentArtists: Array.isArray(parsed.recentArtists) ? parsed.recentArtists : [],
        recentSearches: Array.isArray(parsed.recentSearches) ? parsed.recentSearches : [],
        totalListeningSeconds: parsed.totalListeningSeconds || 0,
        totalPlays: parsed.totalPlays || 0,
        totalCompletions: parsed.totalCompletions || 0,
        totalSkips: parsed.totalSkips || 0,
      };
    }
  } catch {
    // fallback
  }

  return {
    trackAffinities: {},
    artistAffinities: {},
    genreAffinities: {},
    recentSongIds: [],
    recentArtists: [],
    recentSearches: [],
    totalListeningSeconds: 0,
    totalPlays: 0,
    totalCompletions: 0,
    totalSkips: 0,
  };
}

class UserProfileTrackerService {
  private profile: UserListeningProfile;
  private saveTimeout: any = null;
  private currentTrackId: string | null = null;

  constructor() {
    this.profile = loadProfile();
  }

  private persist() {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.profile));
      } catch {
        // quota exceeded fallback
      }
    }, 400);
  }

  /**
   * Called when a song starts playing.
   */
  recordPlay(song: Song) {
    if (!song || !song.id) return;
    const now = Date.now();
    const trackKey = song.id;
    const artistKey = normalizeArtist(song.artist);

    this.currentTrackId = trackKey;

    // 1. Track affinity
    if (!this.profile.trackAffinities[trackKey]) {
      this.profile.trackAffinities[trackKey] = {
        playCount: 1,
        completionCount: 0,
        skipCount: 0,
        replayCount: 0,
        totalDurationSec: 0,
        lastPlayedAt: now,
      };
    } else {
      const entry = this.profile.trackAffinities[trackKey];
      // Check if replayed within 10 minutes
      if (now - entry.lastPlayedAt < 10 * 60 * 1000) {
        entry.replayCount += 1;
      }
      entry.playCount += 1;
      entry.lastPlayedAt = now;
    }

    // 2. Artist affinity
    if (artistKey) {
      if (!this.profile.artistAffinities[artistKey]) {
        this.profile.artistAffinities[artistKey] = {
          playCount: 1,
          completionCount: 0,
          skipCount: 0,
          lastPlayedAt: now,
        };
      } else {
        this.profile.artistAffinities[artistKey].playCount += 1;
        this.profile.artistAffinities[artistKey].lastPlayedAt = now;
      }
    }

    // 3. Genre affinity
    if (song.genre) {
      const genreKey = song.genre.toLowerCase();
      this.profile.genreAffinities[genreKey] = (this.profile.genreAffinities[genreKey] || 0) + 1;
    }

    // 4. Update recent lists (LRU)
    this.profile.recentSongIds = [trackKey, ...this.profile.recentSongIds.filter((id) => id !== trackKey)].slice(0, 50);
    if (song.artist) {
      this.profile.recentArtists = [song.artist, ...this.profile.recentArtists.filter((a) => a !== song.artist)].slice(0, 30);
    }
    this.profile.totalPlays += 1;

    this.persist();
  }

  /**
   * Called on playback time update to track total listening time.
   */
  recordListeningDuration(seconds: number) {
    if (seconds <= 0) return;
    this.profile.totalListeningSeconds += Math.round(seconds);
    if (this.currentTrackId && this.profile.trackAffinities[this.currentTrackId]) {
      this.profile.trackAffinities[this.currentTrackId].totalDurationSec += Math.round(seconds);
    }
    this.persist();
  }

  /**
   * Called when a track is completed (> 80% duration or ended event).
   */
  recordCompletion(song: Song) {
    if (!song || !song.id) return;
    const trackKey = song.id;
    const artistKey = normalizeArtist(song.artist);

    if (this.profile.trackAffinities[trackKey]) {
      this.profile.trackAffinities[trackKey].completionCount += 1;
    }
    if (artistKey && this.profile.artistAffinities[artistKey]) {
      this.profile.artistAffinities[artistKey].completionCount += 1;
    }
    this.profile.totalCompletions += 1;
    this.persist();
  }

  /**
   * Called when a user skips a song early (< 25s or < 25% duration).
   */
  recordSkip(song: Song, _durationListenedSec?: number) {
    if (!song || !song.id) return;
    const trackKey = song.id;
    const artistKey = normalizeArtist(song.artist);

    if (this.profile.trackAffinities[trackKey]) {
      this.profile.trackAffinities[trackKey].skipCount += 1;
    }
    if (artistKey && this.profile.artistAffinities[artistKey]) {
      this.profile.artistAffinities[artistKey].skipCount += 1;
    }
    this.profile.totalSkips += 1;
    this.persist();
  }

  /**
   * Tracks search queries for contextual relevance.
   */
  recordSearch(query: string) {
    const q = (query || '').trim();
    if (!q || q.length < 2) return;
    this.profile.recentSearches = [q, ...this.profile.recentSearches.filter((s) => s.toLowerCase() !== q.toLowerCase())].slice(0, 25);
    this.persist();
  }

  getProfile(): UserListeningProfile {
    return this.profile;
  }

  /**
   * Returns top artists by completion rate and play count.
   */
  getTopArtists(limit = 10): string[] {
    return Object.entries(this.profile.artistAffinities)
      .sort(([, a], [, b]) => {
        const scoreA = a.completionCount * 2 + a.playCount - a.skipCount * 1.5;
        const scoreB = b.completionCount * 2 + b.playCount - b.skipCount * 1.5;
        return scoreB - scoreA;
      })
      .slice(0, limit)
      .map(([artist]) => artist);
  }

  /**
   * Returns whether a track has been repeatedly skipped by the user.
   */
  isFrequentlySkipped(song: Song): boolean {
    const entry = this.profile.trackAffinities[song.id];
    if (!entry) return false;
    return entry.skipCount >= 2 && entry.skipCount > entry.completionCount;
  }

  /**
   * Collects all song IDs that the user has played, liked, downloaded, or saved in playlists.
   */
  getAllKnownPlayedSongIds(): Set<string> {
    const ids = new Set<string>();

    // 1. Profile recent songs & affinity tracks with plays
    this.profile.recentSongIds.forEach((id) => ids.add(id));
    Object.entries(this.profile.trackAffinities).forEach(([id, aff]) => {
      if (aff.playCount > 0) ids.add(id);
    });

    // 2. LocalStorage library collections
    try {
      const rec = JSON.parse(localStorage.getItem('sw_recently_played') || '[]');
      if (Array.isArray(rec)) rec.forEach((s: any) => s?.id && ids.add(s.id));

      const sRec = JSON.parse(localStorage.getItem('sw_search_recently_played') || '[]');
      if (Array.isArray(sRec)) sRec.forEach((s: any) => s?.id && ids.add(s.id));

      const fav = JSON.parse(localStorage.getItem('sw_favorites') || '[]');
      if (Array.isArray(fav)) fav.forEach((s: any) => s?.id && ids.add(s.id));

      const pl = JSON.parse(localStorage.getItem('sw_playlists') || '[]');
      if (Array.isArray(pl)) {
        pl.forEach((p: any) => {
          if (Array.isArray(p?.songs)) {
            p.songs.forEach((s: any) => s?.id && ids.add(s.id));
          }
        });
      }

      const dl = JSON.parse(localStorage.getItem('sw_downloads') || '[]');
      if (Array.isArray(dl)) dl.forEach((s: any) => s?.id && ids.add(s.id));
    } catch {}

    return ids;
  }

  /**
   * Returns user taste score for an artist (0 to 50) based on listening patterns.
   */
  getArtistTasteScore(artist: string): number {
    const artistKey = normalizeArtist(artist);
    if (!artistKey) return 0;
    const aff = this.profile.artistAffinities[artistKey];
    if (!aff) return 0;

    let score = 0;
    score += Math.min(aff.completionCount * 8, 30);
    score += Math.min(aff.playCount * 3, 15);
    score -= aff.skipCount * 12;
    return Math.max(0, Math.min(50, score));
  }

  /**
   * Returns user affinity score for a track/artist (-100 to +100).
   */
  calculateAffinityScore(song: Song): number {
    let score = 0;
    const trackKey = song.id;
    const artistKey = normalizeArtist(song.artist);

    // Track affinity
    const trackAff = this.profile.trackAffinities[trackKey];
    if (trackAff) {
      score += trackAff.completionCount * 15;
      score += trackAff.replayCount * 20;
      score += Math.min(trackAff.playCount * 5, 25);
      score -= trackAff.skipCount * 25;
    }

    // Artist affinity
    const artistAff = this.profile.artistAffinities[artistKey];
    if (artistAff) {
      score += Math.min(artistAff.completionCount * 8, 30);
      score += Math.min(artistAff.playCount * 3, 15);
      score -= artistAff.skipCount * 12;
    }

    // Recent search relevance
    const normTitle = song.title.toLowerCase();
    const normArt = song.artist.toLowerCase();
    for (const search of this.profile.recentSearches.slice(0, 5)) {
      const s = search.toLowerCase();
      if (normTitle.includes(s) || normArt.includes(s) || s.includes(normArt)) {
        score += 15;
        break;
      }
    }

    return Math.max(-100, Math.min(100, score));
  }
}

export const userProfileTracker = new UserProfileTrackerService();
