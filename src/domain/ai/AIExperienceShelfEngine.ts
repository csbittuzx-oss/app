// ═══════════════════════════════════════════════════════════════════════════════
//  AIExperienceShelfEngine
//  Learns from user's live listening history, eras (90s, 2000s, Retro), genres,
//  artists, and mood patterns to auto-generate personalized content sections.
// ═══════════════════════════════════════════════════════════════════════════════

import type { Song } from '../../data/models';
import { searchJioSaavn } from '../../data/api/saavnApi';
import { deduplicateSongs } from '../../data/repository/musicRepository';
import { aiTasteProfileEngine, type MoodType } from './AITasteProfileEngine';
import { userProfileTracker } from '../recommendation/UserProfileTracker';

export interface AIExperienceShelf {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  themeKey: string;
  songs: Song[];
}

interface ThemeDefinition {
  themeKey: string;
  title: string;
  subtitle: string;
  badge: string;
  searchQueries: (userLanguages: string[], topArtists: string[]) => string[];
  calculateAffinity: (context: ListeningAnalysisContext) => number;
}

interface ListeningAnalysisContext {
  allTracks: Song[];
  languages: string[];
  topArtists: string[];
  dominantMood: MoodType;
  eraDistribution: {
    nineties: number;   // 1990-1999
    twoThousands: number; // 2000-2009
    retro: number;       // 1970-1989
    modern: number;      // 2010-2026
  };
  genreKeywords: Record<string, number>;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
}

const AI_SHELVES_CACHE_KEY = 'sw_ai_experience_shelves_cache';

// ── Catalogue of AI Themed Sections ──────────────────────────────────────────

const THEME_DEFINITIONS: ThemeDefinition[] = [
  // 1. 90s Golden Era Nostalgia
  {
    themeKey: '90s_nostalgia',
    title: '90s Golden Era Nostalgia',
    subtitle: 'Timeless melodies, iconic duets, and 90s evergreen magic',
    badge: '✨ AI Nostalgia',
    searchQueries: (langs) => {
      const primary = langs[0] || 'Hindi';
      if (primary === 'Punjabi') {
        return ['90s punjabi folk hits', 'surjit bindrakhia 90s hits', 'gurdas maan 90s'];
      }
      return ['90s bollywood romantic hits', 'kumar sanu alka yagnik hits', '90s evergreen hindi songs'];
    },
    calculateAffinity: (ctx) => {
      let score = ctx.eraDistribution.nineties * 4.0;
      const text = ctx.allTracks.map((s) => `${s.artist} ${s.title}`).join(' ').toLowerCase();
      if (text.includes('kumar sanu') || text.includes('alka yagnik') || text.includes('udit narayan') || text.includes('90s')) {
        score += 25;
      }
      return score;
    },
  },

  // 2. 2000s Bollywood Flashback
  {
    themeKey: '2000s_flashback',
    title: '2000s Bollywood Flashback',
    subtitle: 'Unforgettable romantic anthems and college memories',
    badge: '🔮 2000s Hits',
    searchQueries: () => [
      '2000s bollywood romantic hits',
      'emraan hashmi best songs',
      'kk shreya ghoshal 2000s hits',
    ],
    calculateAffinity: (ctx) => {
      let score = ctx.eraDistribution.twoThousands * 3.5;
      const text = ctx.allTracks.map((s) => `${s.artist} ${s.title}`).join(' ').toLowerCase();
      if (text.includes('kk') || text.includes('mohit chauhan') || text.includes('emraan') || text.includes('himesh') || text.includes('pritam')) {
        score += 20;
      }
      return score;
    },
  },

  // 3. Soulful Sufi & Ghazals
  {
    themeKey: 'soulful_sufi',
    title: 'Soulful Sufi & Heartfelt Melodies',
    subtitle: 'Deep poetry, acoustic strings, and soul-stirring vocals',
    badge: '🕊️ AI Soul',
    searchQueries: () => [
      'soulful sufi bollywood songs',
      'rahat fateh ali khan sufi hits',
      'nusrat fateh ali khan best sufi',
      'arijit singh soulful sufi',
    ],
    calculateAffinity: (ctx) => {
      let score = 5;
      const text = ctx.allTracks.map((s) => `${s.artist} ${s.title} ${s.album}`).join(' ').toLowerCase();
      if (text.includes('rahat') || text.includes('nusrat') || text.includes('sufi') || text.includes('ghazal') || text.includes('javed ali') || text.includes('kailash kher')) {
        score += 35;
      }
      if (ctx.dominantMood === 'melancholic' || ctx.dominantMood === 'romantic') {
        score += 15;
      }
      return score;
    },
  },

  // 4. Desi Hip-Hop & Street Energy
  {
    themeKey: 'desi_hiphop',
    title: 'Desi Hip-Hop & Rap Flow',
    subtitle: 'Hard-hitting verses, street flow, and underground rhythm',
    badge: '⚡ AI Rap',
    searchQueries: () => [
      'desi hip hop top hits',
      'seedhe maut divine krsna songs',
      'indian rap best hits',
    ],
    calculateAffinity: (ctx) => {
      let score = 0;
      const text = ctx.allTracks.map((s) => `${s.artist} ${s.title}`).join(' ').toLowerCase();
      if (text.includes('divine') || text.includes('krsna') || text.includes('seedhe maut') || text.includes('stan') || text.includes('raftaar') || text.includes('rap')) {
        score += 40;
      }
      if (ctx.dominantMood === 'energetic' || ctx.dominantMood === 'party') {
        score += 15;
      }
      return score;
    },
  },

  // 5. Late-Night Acoustic & Lo-Fi Chill
  {
    themeKey: 'midnight_acoustic',
    title: 'Midnight Acoustic & Lo-Fi Chill',
    subtitle: 'Gentle acoustic strings and ambient beats for quiet hours',
    badge: '🌙 AI Night Drive',
    searchQueries: () => [
      'hindi acoustic romantic lofi',
      'late night drive hindi songs',
      'slowed reverb romantic hindi',
      'chill hindi acoustic hits',
    ],
    calculateAffinity: (ctx) => {
      let score = ctx.timeOfDay === 'night' || ctx.timeOfDay === 'evening' ? 25 : 5;
      if (ctx.dominantMood === 'chill' || ctx.dominantMood === 'romantic') {
        score += 20;
      }
      return score;
    },
  },

  // 6. Punjabi Urban & High-Voltage Beats
  {
    themeKey: 'punjabi_urban',
    title: 'Punjabi Urban & Power Beats',
    subtitle: 'High-octane Punjabi bangers, basslines, and swag',
    badge: '🔥 Punjabi AI',
    searchQueries: () => [
      'punjabi top hits 2026',
      'diljit dosanjh karan aujla hits',
      'ap dhillon shubh punjabi hits',
    ],
    calculateAffinity: (ctx) => {
      let score = ctx.languages.includes('Punjabi') ? 25 : 0;
      const text = ctx.allTracks.map((s) => `${s.artist} ${s.title}`).join(' ').toLowerCase();
      if (text.includes('diljit') || text.includes('aujla') || text.includes('moose wala') || text.includes('ap dhillon') || text.includes('shubh')) {
        score += 35;
      }
      return score;
    },
  },

  // 7. Indie Pop & Coffeehouse Melodies
  {
    themeKey: 'indie_pop',
    title: 'Indie Pop & Coffeehouse Vibes',
    subtitle: 'Fresh independent voices, intimate guitars, and acoustic warmth',
    badge: '☕ Indie Discovery',
    searchQueries: () => [
      'indian indie pop top songs',
      'anuv jain prateek kuhad hits',
      'best hindi indie acoustic',
    ],
    calculateAffinity: (ctx) => {
      let score = 5;
      const text = ctx.allTracks.map((s) => `${s.artist} ${s.title}`).join(' ').toLowerCase();
      if (text.includes('anuv jain') || text.includes('prateek kuhad') || text.includes('zaeden') || text.includes('jasleen') || text.includes('the local train')) {
        score += 35;
      }
      if (ctx.dominantMood === 'chill' || ctx.dominantMood === 'focus') {
        score += 15;
      }
      return score;
    },
  },

  // 8. Retro 70s & 80s Legends
  {
    themeKey: 'retro_legends',
    title: 'Retro 70s & 80s Golden Classics',
    subtitle: 'Legendary voices of Kishore Kumar, Lata Mangeshkar, and RD Burman',
    badge: '📻 Vintage AI',
    searchQueries: () => [
      'kishore kumar lata mangeshkar hits',
      '70s 80s bollywood romantic classics',
      'rd burman evergreen hits',
    ],
    calculateAffinity: (ctx) => {
      let score = ctx.eraDistribution.retro * 4.0;
      const text = ctx.allTracks.map((s) => `${s.artist} ${s.title}`).join(' ').toLowerCase();
      if (text.includes('kishore') || text.includes('lata') || text.includes('mohammed rafi') || text.includes('rd burman') || text.includes('mukesh')) {
        score += 30;
      }
      return score;
    },
  },

  // 9. All-Time Hindi Superhits & Melody
  {
    themeKey: 'all_time_superhits',
    title: 'All-Time Bollywood Superhits',
    subtitle: 'Heart-touching chartbusters loved across generations',
    badge: '💎 AI Superhits',
    searchQueries: () => [
      'all time best bollywood romantic songs',
      'arijit singh atif aslam top romantic',
      'bollywood blockbuster songs',
    ],
    calculateAffinity: () => 18, // baseline general appeal
  },

  // 10. Monsoon Romance & Rainy Melodies
  {
    themeKey: 'monsoon_romance',
    title: 'Monsoon Romance & Rain Melodies',
    subtitle: 'Cozy melodies, poetic drizzle, and heartfelt love',
    badge: '🌧️ AI Mood',
    searchQueries: () => [
      'bollywood monsoon rain songs',
      'romantic rain hits hindi',
      'baarish romantic hindi songs',
    ],
    calculateAffinity: (ctx) => {
      let score = ctx.dominantMood === 'romantic' ? 20 : 8;
      const text = ctx.allTracks.map((s) => `${s.title}`).join(' ').toLowerCase();
      if (text.includes('baarish') || text.includes('rain') || text.includes('barsaat') || text.includes('rimjhim')) {
        score += 25;
      }
      return score;
    },
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
//  AI Experience Engine Service
// ═══════════════════════════════════════════════════════════════════════════════

class AIExperienceShelfEngineService {
  private inMemoryCache: AIExperienceShelf[] = [];
  private isGenerating = false;

  constructor() {
    this.restoreCache();
  }

  private restoreCache() {
    try {
      const raw = localStorage.getItem(AI_SHELVES_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.inMemoryCache = parsed;
        }
      }
    } catch {}
  }

  private saveCache(shelves: AIExperienceShelf[]) {
    try {
      this.inMemoryCache = shelves;
      localStorage.setItem(AI_SHELVES_CACHE_KEY, JSON.stringify(shelves));
    } catch {}
  }

  getCachedShelves(): AIExperienceShelf[] {
    return this.inMemoryCache;
  }

  /**
   * Analyzes the user's complete listening profile to extract multi-dimensional taste context.
   */
  private analyzeListeningContext(
    recentlyPlayed: Song[] = [],
    favorites: Song[] = [],
    languages: string[] = []
  ): ListeningAnalysisContext {
    const allTracks = deduplicateSongs([...recentlyPlayed, ...favorites]);
    const topArtists = userProfileTracker.getTopArtists(5);
    const dominantMood = aiTasteProfileEngine.getCurrentContextualMood();

    const eraDistribution = {
      nineties: 0,
      twoThousands: 0,
      retro: 0,
      modern: 0,
    };

    allTracks.forEach((song) => {
      const year = song.year || (song.album ? parseInt(song.album.match(/\b(19\d\d|20\d\d)\b/)?.[0] || '0', 10) : 0);
      if (year >= 1990 && year <= 1999) {
        eraDistribution.nineties += 1;
      } else if (year >= 2000 && year <= 2009) {
        eraDistribution.twoThousands += 1;
      } else if (year >= 1960 && year < 1990) {
        eraDistribution.retro += 1;
      } else if (year >= 2010) {
        eraDistribution.modern += 1;
      }
    });

    const hour = new Date().getHours();
    const timeOfDay: ListeningAnalysisContext['timeOfDay'] =
      hour >= 5 && hour < 12 ? 'morning' : hour >= 12 && hour < 17 ? 'afternoon' : hour >= 17 && hour < 22 ? 'evening' : 'night';

    return {
      allTracks,
      languages: languages.length > 0 ? languages : ['Hindi'],
      topArtists,
      dominantMood,
      eraDistribution,
      genreKeywords: {},
      timeOfDay,
    };
  }

  /**
   * Generates 2 to 3 dynamic, personalized AI content shelves based on user experience.
   */
  async generateAIExperienceShelves(params: {
    recentlyPlayed: Song[];
    favorites: Song[];
    languages: string[];
    shelfCount?: number;
  }): Promise<AIExperienceShelf[]> {
    if (this.isGenerating && this.inMemoryCache.length > 0) {
      return this.inMemoryCache;
    }

    this.isGenerating = true;

    try {
      const { recentlyPlayed = [], favorites = [], languages = ['Hindi'], shelfCount = 3 } = params;
      const ctx = this.analyzeListeningContext(recentlyPlayed, favorites, languages);

      // Score all themes
      const scoredThemes = THEME_DEFINITIONS.map((def) => ({
        definition: def,
        score: def.calculateAffinity(ctx),
      })).sort((a, b) => b.score - a.score);

      // Pick top N distinct themes
      const selected = scoredThemes.slice(0, shelfCount);
      const shelves: AIExperienceShelf[] = [];

      for (const item of selected) {
        const def = item.definition;
        const queries = def.searchQueries(ctx.languages, ctx.topArtists);
        const collectedSongs: Song[] = [];

        for (const query of queries) {
          try {
            const res = await searchJioSaavn(query, 16);
            if (res?.songs && res.songs.length > 0) {
              collectedSongs.push(...res.songs);
            }
          } catch {
            // try next query
          }
          if (collectedSongs.length >= 14) break;
        }

        const deduped = deduplicateSongs(collectedSongs).slice(0, 14);

        if (deduped.length >= 4) {
          shelves.push({
            id: `ai_shelf_${def.themeKey}`,
            title: def.title,
            subtitle: def.subtitle,
            badge: def.badge,
            themeKey: def.themeKey,
            songs: deduped,
          });
        }
      }

      if (shelves.length > 0) {
        this.saveCache(shelves);
        return shelves;
      }

      return this.inMemoryCache;
    } catch (e) {
      console.warn('[AIExperienceShelfEngine] Error generating shelves:', e);
      return this.inMemoryCache;
    } finally {
      this.isGenerating = false;
    }
  }
}

export const aiExperienceShelfEngine = new AIExperienceShelfEngineService();
