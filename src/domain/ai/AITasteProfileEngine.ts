// ═══════════════════════════════════════════
//  AITasteProfileEngine
//  Learns multi-dimensional user taste patterns:
//  - Top genres & weighted affinities
//  - Mood preferences (Chill, Focus, Energetic, Romantic, Melancholic, Party)
//  - Time-of-day listening habits (Morning, Afternoon, Evening, Night)
//  - Positive/Negative feedback reinforcement
//  - Privacy-first local persistence & 1-tap reset
// ═══════════════════════════════════════════

import type { Song } from '../../data/models';

export type MoodType = 'chill' | 'focus' | 'energetic' | 'romantic' | 'melancholic' | 'party' | 'neutral';
export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

export interface MoodAffinity {
  score: number; // 0 - 100
  lastUpdated: number;
}

export interface GenreAffinity {
  score: number;
  playCount: number;
  completionCount: number;
  skipCount: number;
}

export interface ArtistTasteAffinity {
  score: number;
  playCount: number;
  completionCount: number;
  skipCount: number;
  liked: boolean;
  lastPlayedAt: number;
}

export interface AITasteProfile {
  topGenres: Record<string, GenreAffinity>;
  topArtists: Record<string, ArtistTasteAffinity>;
  moods: Record<MoodType, number>;
  timeOfDayPatterns: Record<TimeOfDay, Record<MoodType, number>>;
  discoveryPreference: number; // 0 (familiar only) to 1.0 (adventurous discovery)
  completedSongsCount: number;
  skippedSongsCount: number;
  likedSongsCount: number;
  totalListeningTimeSec: number;
  lastActiveAt: number;
}

const STORAGE_KEY = 'sw_ai_taste_profile';

function getInitialProfile(): AITasteProfile {
  return {
    topGenres: {},
    topArtists: {},
    moods: {
      chill: 10,
      focus: 10,
      energetic: 10,
      romantic: 10,
      melancholic: 10,
      party: 10,
      neutral: 10,
    },
    timeOfDayPatterns: {
      morning: { chill: 5, focus: 5, energetic: 4, romantic: 2, melancholic: 1, party: 1, neutral: 3 },
      afternoon: { chill: 3, focus: 6, energetic: 4, romantic: 2, melancholic: 1, party: 2, neutral: 3 },
      evening: { chill: 5, focus: 3, energetic: 5, romantic: 6, melancholic: 4, party: 5, neutral: 3 },
      night: { chill: 8, focus: 4, energetic: 2, romantic: 7, melancholic: 6, party: 2, neutral: 3 },
    },
    discoveryPreference: 0.5,
    completedSongsCount: 0,
    skippedSongsCount: 0,
    likedSongsCount: 0,
    totalListeningTimeSec: 0,
    lastActiveAt: Date.now(),
  };
}

function loadProfile(): AITasteProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        topGenres: parsed.topGenres || {},
        topArtists: parsed.topArtists || {},
        moods: { ...getInitialProfile().moods, ...(parsed.moods || {}) },
        timeOfDayPatterns: { ...getInitialProfile().timeOfDayPatterns, ...(parsed.timeOfDayPatterns || {}) },
        discoveryPreference: typeof parsed.discoveryPreference === 'number' ? parsed.discoveryPreference : 0.5,
        completedSongsCount: parsed.completedSongsCount || 0,
        skippedSongsCount: parsed.skippedSongsCount || 0,
        likedSongsCount: parsed.likedSongsCount || 0,
        totalListeningTimeSec: parsed.totalListeningTimeSec || 0,
        lastActiveAt: parsed.lastActiveAt || Date.now(),
      };
    }
  } catch {}
  return getInitialProfile();
}

/**
 * Infers likely mood from song text and metadata.
 */
export function inferSongMood(song: Song): MoodType {
  const text = `${song.title} ${song.artist} ${song.album || ''} ${song.genre || ''}`.toLowerCase();

  if (text.includes('workout') || text.includes('gym') || text.includes('energetic') || text.includes('phonk') || text.includes('power') || text.includes('bhangra') || text.includes('rock')) {
    return 'energetic';
  }
  if (text.includes('party') || text.includes('dance') || text.includes('club') || text.includes('dj') || text.includes('remix') || text.includes('dhamaka')) {
    return 'party';
  }
  if (text.includes('sad') || text.includes('heartbreak') || text.includes('pain') || text.includes('alone') || text.includes('judaai') || text.includes('bewafa') || text.includes('tujhe kitna chahein')) {
    return 'melancholic';
  }
  if (text.includes('love') || text.includes('romantic') || text.includes('ishq') || text.includes('pyaar') || text.includes('tum hi ho') || text.includes('kesariya') || text.includes('peelings') || text.includes('acoustic')) {
    return 'romantic';
  }
  if (text.includes('study') || text.includes('focus') || text.includes('instrumental') || text.includes('piano') || text.includes('lofi') || text.includes('lo-fi') || text.includes('ambient') || text.includes('relax')) {
    return 'focus';
  }
  if (text.includes('chill') || text.includes('coffee') || text.includes('peace') || text.includes('calm') || text.includes('slowed') || text.includes('reverb')) {
    return 'chill';
  }

  return 'neutral';
}

/**
 * Determines current time of day bucket.
 */
export function getCurrentTimeOfDay(): TimeOfDay {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

function normalizeArtist(str: string): string {
  return (str || '')
    .toLowerCase()
    .split(/[,&/]|feat\.|ft\.|with|\s+x\s+/i)[0]
    ?.trim() || '';
}

class AITasteProfileEngineService {
  private profile: AITasteProfile;
  private saveTimeout: any = null;

  constructor() {
    this.profile = loadProfile();
  }

  private persist() {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.profile));
      } catch {}
    }, 400);
  }

  /**
   * Records a song start play event.
   */
  recordSongPlay(song: Song) {
    if (!song || !song.id) return;
    const mood = inferSongMood(song);
    const timeOfDay = getCurrentTimeOfDay();
    const artistKey = normalizeArtist(song.artist);
    const genreKey = (song.genre || 'general').toLowerCase();

    // 1. Update Mood & Time-of-day affinities
    if (mood !== 'neutral') {
      this.profile.moods[mood] = (this.profile.moods[mood] || 0) + 1;
      this.profile.timeOfDayPatterns[timeOfDay][mood] = (this.profile.timeOfDayPatterns[timeOfDay][mood] || 0) + 1;
    }

    // 2. Update Artist Affinity
    if (artistKey) {
      if (!this.profile.topArtists[artistKey]) {
        this.profile.topArtists[artistKey] = {
          score: 1.0,
          playCount: 1,
          completionCount: 0,
          skipCount: 0,
          liked: false,
          lastPlayedAt: Date.now(),
        };
      } else {
        const a = this.profile.topArtists[artistKey];
        a.playCount += 1;
        a.score = Math.min(100, a.score + 0.5);
        a.lastPlayedAt = Date.now();
      }
    }

    // 3. Update Genre Affinity
    if (!this.profile.topGenres[genreKey]) {
      this.profile.topGenres[genreKey] = {
        score: 1.0,
        playCount: 1,
        completionCount: 0,
        skipCount: 0,
      };
    } else {
      const g = this.profile.topGenres[genreKey];
      g.playCount += 1;
      g.score = Math.min(100, g.score + 0.4);
    }

    this.profile.lastActiveAt = Date.now();
    this.persist();
  }

  /**
   * Positive reinforcement: Full track completion (+2.0 points).
   */
  recordSongCompletion(song: Song) {
    if (!song) return;
    const artistKey = normalizeArtist(song.artist);
    const genreKey = (song.genre || 'general').toLowerCase();
    const mood = inferSongMood(song);

    this.profile.completedSongsCount += 1;

    if (artistKey && this.profile.topArtists[artistKey]) {
      const a = this.profile.topArtists[artistKey];
      a.completionCount += 1;
      a.score = Math.min(100, a.score + 2.0);
    }

    if (this.profile.topGenres[genreKey]) {
      const g = this.profile.topGenres[genreKey];
      g.completionCount += 1;
      g.score = Math.min(100, g.score + 1.5);
    }

    if (mood !== 'neutral') {
      this.profile.moods[mood] = (this.profile.moods[mood] || 0) + 1.5;
    }

    this.persist();
  }

  /**
   * Positive reinforcement: Liked / Favorited (+3.0 points).
   */
  recordSongLiked(song: Song, liked: boolean) {
    if (!song) return;
    const artistKey = normalizeArtist(song.artist);
    const genreKey = (song.genre || 'general').toLowerCase();

    if (liked) {
      this.profile.likedSongsCount += 1;
      if (artistKey) {
        if (!this.profile.topArtists[artistKey]) {
          this.profile.topArtists[artistKey] = {
            score: 3.0,
            playCount: 1,
            completionCount: 0,
            skipCount: 0,
            liked: true,
            lastPlayedAt: Date.now(),
          };
        } else {
          this.profile.topArtists[artistKey].liked = true;
          this.profile.topArtists[artistKey].score = Math.min(100, this.profile.topArtists[artistKey].score + 3.0);
        }
      }
      if (this.profile.topGenres[genreKey]) {
        this.profile.topGenres[genreKey].score = Math.min(100, this.profile.topGenres[genreKey].score + 2.0);
      }
    } else {
      if (artistKey && this.profile.topArtists[artistKey]) {
        this.profile.topArtists[artistKey].liked = false;
        this.profile.topArtists[artistKey].score = Math.max(0, this.profile.topArtists[artistKey].score - 1.5);
      }
    }

    this.persist();
  }

  /**
   * Negative reinforcement: Early skip (<25s) (-2.5 points).
   */
  recordSongSkip(song: Song) {
    if (!song) return;
    const artistKey = normalizeArtist(song.artist);
    const genreKey = (song.genre || 'general').toLowerCase();

    this.profile.skippedSongsCount += 1;

    if (artistKey && this.profile.topArtists[artistKey]) {
      const a = this.profile.topArtists[artistKey];
      a.skipCount += 1;
      a.score = Math.max(0, a.score - 2.5);
    }

    if (this.profile.topGenres[genreKey]) {
      const g = this.profile.topGenres[genreKey];
      g.skipCount += 1;
      g.score = Math.max(0, g.score - 1.5);
    }

    this.persist();
  }

  /**
   * Records a user search query to dynamically adapt mood/genre taste signals.
   */
  recordSearch(query: string) {
    if (!query || query.trim().length < 2) return;
    const q = query.toLowerCase();
    if (q.includes('workout') || q.includes('gym')) {
      this.profile.moods.energetic = (this.profile.moods.energetic || 0) + 1;
    } else if (q.includes('study') || q.includes('focus') || q.includes('instrumental')) {
      this.profile.moods.focus = (this.profile.moods.focus || 0) + 1;
    } else if (q.includes('chill') || q.includes('relax')) {
      this.profile.moods.chill = (this.profile.moods.chill || 0) + 1;
    } else if (q.includes('party') || q.includes('dance')) {
      this.profile.moods.party = (this.profile.moods.party || 0) + 1;
    } else if (q.includes('sad') || q.includes('heartbreak')) {
      this.profile.moods.melancholic = (this.profile.moods.melancholic || 0) + 1;
    } else if (q.includes('romantic') || q.includes('love')) {
      this.profile.moods.romantic = (this.profile.moods.romantic || 0) + 1;
    }
    this.persist();
  }

  /**
   * Returns top preferred artists ordered by AI taste affinity score.
   */
  getTopTasteArtists(limit = 8): string[] {
    return Object.entries(this.profile.topArtists)
      .sort(([, a], [, b]) => b.score - a.score)
      .slice(0, limit)
      .map(([artist]) => artist);
  }

  /**
   * Returns current dominant mood based on time of day and user history.
   */
  getCurrentContextualMood(): MoodType {
    const timeOfDay = getCurrentTimeOfDay();
    const timePatterns = this.profile.timeOfDayPatterns[timeOfDay];
    let topMood: MoodType = 'chill';
    let maxScore = -1;

    for (const [m, score] of Object.entries(timePatterns)) {
      const mood = m as MoodType;
      const combinedScore = score * 1.5 + (this.profile.moods[mood] || 0);
      if (combinedScore > maxScore && mood !== 'neutral') {
        maxScore = combinedScore;
        topMood = mood;
      }
    }

    return topMood;
  }

  /**
   * Returns complete profile data.
   */
  getProfile(): AITasteProfile {
    return this.profile;
  }

  /**
   * Privacy feature: Resets all taste and recommendation profiling data completely.
   */
  resetPersonalizationProfile() {
    this.profile = getInitialProfile();
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem('sw_user_profile');
      localStorage.removeItem('sw_home_sections_cache');
      localStorage.removeItem('sw_curated_shelves_cache');
    } catch {}
  }
}

export const aiTasteProfileEngine = new AITasteProfileEngineService();
