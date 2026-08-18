// ═══════════════════════════════════════════
//  SearchNoiseFilter
//  Filters out YouTube Shorts, non-musical video clips, vlogs, and duplicates
// ═══════════════════════════════════════════

import type { Song } from '../data/models';

const NON_MUSIC_REGEX = /\b(reaction|reacting|interview|behind the scenes|making of|vlog|official trailer|teaser|unboxing|episode \d+|podcast|movie clip|full movie|gameplay|walkthrough|tutorial|review|parody|audio\s+teaser)\b/i;
const SHORTS_REGEX = /\b(#shorts|shorts|tiktok|reels?|ytshorts)\b/i;

/**
 * Filter explicit songs when HideExplicit preference is enabled.
 */
export function filterExplicit(songs: Song[], hideExplicit: boolean): Song[] {
  if (!hideExplicit) return songs;
  return songs.filter(s => !s.explicit);
}


/**
 * Filter out YouTube Shorts and ultra-short clips (< 40s) unless explicitly a ringtone or intro.
 */
export function filterYoutubeShorts(songs: Song[]): Song[] {
  if (!Array.isArray(songs)) return [];
  return songs.filter((s) => {
    if (!s) return false;
    const title = s.title || '';
    const id = s.id || '';

    // Check title or id for shorts flags
    if (SHORTS_REGEX.test(title) || id.includes('/shorts/')) {
      return false;
    }

    // Filter short vertical clips (duration > 0 and < 40 seconds)
    // Keep only if title explicitly mentions ringtone or intro/outro
    if (s.duration > 0 && s.duration < 40) {
      const isRingtoneOrIntro = /\b(ringtone|intro|outro|theme)\b/i.test(title);
      if (!isRingtoneOrIntro) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Exclude non-musical video clips, fan vlogs, interviews, gameplay, and movie clips.
 */
export function filterVideoSongs(songs: Song[]): Song[] {
  if (!Array.isArray(songs)) return [];
  return songs.filter((s) => {
    if (!s) return false;
    const title = s.title || '';
    const artist = s.artist || '';

    // If title or artist contains non-music keywords
    if (NON_MUSIC_REGEX.test(title)) {
      return false;
    }

    // Exclude generic non-music video titles like "Full Episode", "Live Stream"
    if (/\b(full episode|live stream|podcast episode|livestream)\b/i.test(title) || /\b(podcast)\b/i.test(artist)) {
      return false;
    }

    return true;
  });
}

/**
 * Deduplicate items by a unique key while preserving original ranking order.
 */
export function distinctBy<T>(items: T[], keyFn: (item: T) => string): T[] {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const result: T[] = [];

  for (const item of items) {
    if (!item) continue;
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }

  return result;
}

/**
 * Apply full noise, shorts, and deduplication filter suite on search results.
 */
export function sanitizeSearchSongs(songs: Song[]): Song[] {
  const withoutShorts = filterYoutubeShorts(songs);
  const musicOnly = filterVideoSongs(withoutShorts);
  return distinctBy(musicOnly, (s) => {
    const cleanTitle = (s.title || '').trim().toLowerCase().replace(/\(.*?\)|\[.*?\]/g, '').replace(/[^\p{L}\p{N}]/gu, '');
    const cleanArtist = (s.artist || '').trim().toLowerCase().split(/[,&/|+]|\bfeat\b|\bft\b/i)[0]?.trim().replace(/[^\p{L}\p{N}]/gu, '') || '';
    return cleanTitle && cleanArtist ? `${cleanArtist}_${cleanTitle}` : s.id;
  });
}
