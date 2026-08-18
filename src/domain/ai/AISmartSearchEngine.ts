// ═══════════════════════════════════════════
//  AISmartSearchEngine
//  Natural Language Search Intent Understanding & Vector Expansion
//  Examples:
//  - "Chill songs for studying"
//  - "Energetic songs for workout"
//  - "Songs like Arijit Singh"
//  - "Sad Hindi songs"
//  - "Popular songs from the 2000s"
//  - "Relaxing instrumental music"
//  Falls back automatically to high-precision keyword search.
// ═══════════════════════════════════════════

import type { SearchResult } from '../../data/models';
import { onlineSearchViewModel } from '../../services/OnlineSearchViewModel';

export interface AISmartSearchIntent {
  isNaturalLanguage: boolean;
  intentType: 'mood' | 'activity' | 'era' | 'similarity' | 'genre' | 'direct';
  expandedQuery: string;
  smartTag?: string;
  categoryHint?: string;
}

export function parseSearchIntent(rawQuery: string): AISmartSearchIntent {
  const q = rawQuery.trim().toLowerCase();

  // 1. Activity & Mood based queries
  if (q.includes('study') || q.includes('studying') || q.includes('homework') || q.includes('exam')) {
    return {
      isNaturalLanguage: true,
      intentType: 'activity',
      expandedQuery: 'Lofi study beats instrumental focus relaxing',
      smartTag: 'Study & Focus',
      categoryHint: 'Deep Focus & Concentration',
    };
  }

  if (q.includes('workout') || q.includes('gym') || q.includes('fitness') || q.includes('running') || q.includes('energetic') || q.includes('motivation')) {
    return {
      isNaturalLanguage: true,
      intentType: 'activity',
      expandedQuery: 'Gym workout motivation energetic hype pump hits',
      smartTag: 'Workout Energy',
      categoryHint: 'High-Energy Workout',
    };
  }

  if (q.includes('chill') || q.includes('relax') || q.includes('peaceful') || q.includes('calm') || q.includes('sleep') || q.includes('meditation')) {
    return {
      isNaturalLanguage: true,
      intentType: 'mood',
      expandedQuery: 'Chill acoustic relaxing peaceful lofi calm songs',
      smartTag: 'Chill & Relax',
      categoryHint: 'Peaceful & Unwind',
    };
  }

  if (q.includes('late night') || q.includes('night drive') || q.includes('midnight') || q.includes('driving')) {
    return {
      isNaturalLanguage: true,
      intentType: 'mood',
      expandedQuery: 'Late night drive synthwave lofi chill vibes',
      smartTag: 'Night Drive',
      categoryHint: 'Late Night Atmosphere',
    };
  }

  if (q.includes('party') || q.includes('dance') || q.includes('club') || q.includes('banger')) {
    return {
      isNaturalLanguage: true,
      intentType: 'activity',
      expandedQuery: 'Bollywood punjabi party dance club mashup superhits',
      smartTag: 'Party Hits',
      categoryHint: 'Party & Dancefloor',
    };
  }

  if (q.includes('sad') || q.includes('heartbreak') || q.includes('emotional') || q.includes('crying') || q.includes('dard')) {
    return {
      isNaturalLanguage: true,
      intentType: 'mood',
      expandedQuery: 'Emotional sad hindi songs heartbreak arijit pritam',
      smartTag: 'Heartbreak & Sad',
      categoryHint: 'Deep Emotions & Melancholy',
    };
  }

  if (q.includes('romantic') || q.includes('love songs') || q.includes('romance') || q.includes('couple') || q.includes('ishq') || q.includes('pyaar')) {
    return {
      isNaturalLanguage: true,
      intentType: 'mood',
      expandedQuery: 'Romantic love songs melodies evergreen bollywood',
      smartTag: 'Romantic Melodies',
      categoryHint: 'Love & Romance',
    };
  }

  if (q.includes('instrumental') || q.includes('piano') || q.includes('guitar') || q.includes('flute') || q.includes('acoustic')) {
    return {
      isNaturalLanguage: true,
      intentType: 'genre',
      expandedQuery: 'Calm acoustic guitar piano instrumental melodies',
      smartTag: 'Instrumental',
      categoryHint: 'Acoustic & Instrumental',
    };
  }

  // 2. Era & Decades queries
  if (q.includes('2000s') || q.includes('2000') || q.includes('early 2000s') || q.includes('y2k')) {
    return {
      isNaturalLanguage: true,
      intentType: 'era',
      expandedQuery: '2000s bollywood pop greatest superhits evergreen',
      smartTag: '2000s Classics',
      categoryHint: 'Golden 2000s Hits',
    };
  }

  if (q.includes('90s') || q.includes('1990') || q.includes('90s bollywood')) {
    return {
      isNaturalLanguage: true,
      intentType: 'era',
      expandedQuery: '90s bollywood evergreen classic romantic superhits',
      smartTag: '90s Nostalgia',
      categoryHint: '90s Evergreen Era',
    };
  }

  if (q.includes('80s') || q.includes('1980') || q.includes('retro')) {
    return {
      isNaturalLanguage: true,
      intentType: 'era',
      expandedQuery: '80s retro synthpop classic evergreen hits',
      smartTag: '80s Retro',
      categoryHint: 'Retro Classics',
    };
  }

  // 3. Similarity queries ("Songs like X", "Songs similar to Y")
  const likeMatch = q.match(/songs\s+(?:like|similar\s+to)\s+(.+)/i) || q.match(/music\s+(?:like|similar\s+to)\s+(.+)/i);
  if (likeMatch && likeMatch[1]) {
    const target = likeMatch[1].trim();
    return {
      isNaturalLanguage: true,
      intentType: 'similarity',
      expandedQuery: `${target} top hits radio playlist`,
      smartTag: `Similar to ${target}`,
      categoryHint: `Inspired by ${target}`,
    };
  }

  // 4. Default: direct keyword search
  return {
    isNaturalLanguage: false,
    intentType: 'direct',
    expandedQuery: rawQuery.trim(),
  };
}

class AISmartSearchEngineService {
  /**
   * Executes AI-Powered natural language or keyword music search with Spotify-grade exact matching.
   */
  async executeSearch(query: string, limit = 25): Promise<{ result: SearchResult; intent: AISmartSearchIntent }> {
    const cleanQuery = query.trim();
    const intent = parseSearchIntent(cleanQuery);
    const searchQuery = intent.isNaturalLanguage ? intent.expandedQuery : cleanQuery;

    try {
      const searchResult = await onlineSearchViewModel.search(searchQuery, limit);
      return {
        result: {
          ...searchResult,
          query: cleanQuery,
        },
        intent,
      };
    } catch {
      return {
        result: {
          songs: [],
          artists: [],
          albums: [],
          query: cleanQuery,
          total: 0,
        },
        intent,
      };
    }
  }
}

export const aiSmartSearchEngine = new AISmartSearchEngineService();
