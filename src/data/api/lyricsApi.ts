// ═══════════════════════════════════════════
//  Lyrics Engine — Multi-Tier Synced LRC & Plain Lyrics Resolver
//  Tiers: 1. LRCLIB Synced API -> 2. JioSaavn Official Lyrics -> 3. Piped/YT Captions -> 4. Lyrics.ovh Fallback
// ═══════════════════════════════════════════

import type { Lyrics, LyricsLine } from '../models';
import { decodeHtmlEntities } from '../../core/utils';
import { universalGet } from '../../core/utils/http';

const BASE_SAAVN_URL = 'https://www.jiosaavn.com/api.php';
const lyricsCache = new Map<string, Lyrics>();

/**
 * Parses raw .lrc format text into sorted LyricsLine array with exact timestamps in seconds & milliseconds.
 */
export function parseLrc(lrcContent: string): LyricsLine[] {
  const lines = lrcContent.split('\n');
  const result: LyricsLine[] = [];
  const timeRegex = /\[(\d{2}):(\d{2}(?:\.\d+)?)\](.*)/;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    // Ignore header tags like [ar:Artist], [ti:Title], [length:03:45]
    if (/^\[(ti|ar|al|by|offset|length|re|ve):/i.test(trimmed)) {
      continue;
    }

    const match = trimmed.match(timeRegex);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseFloat(match[2]);
      const text = match[3].trim();
      const timeInSeconds = minutes * 60 + seconds;
      const timestamp_ms = Math.round(timeInSeconds * 1000);

      // Even if text is empty (musical pause), include it so highlight clears properly
      result.push({
        time: Math.max(0, timeInSeconds),
        timestamp_ms: Math.max(0, timestamp_ms),
        text: decodeHtmlEntities(text),
      });
    } else {
      // Line without timestamp
      result.push({
        text: decodeHtmlEntities(trimmed),
      });
    }
  }

  // Sort by time if synced timestamps exist
  result.sort((a, b) => {
    if (a.time !== undefined && b.time !== undefined) {
      return a.time - b.time;
    }
    return 0;
  });

  return result;
}

/**
 * Cleans track title by removing extraneous remix/soundtrack tags for broader lyrics match.
 */
function cleanLyricsQuery(title: string, artist: string): { cleanTitle: string; primaryArtist: string; cleanArtist: string } {
  const cleanTitle = title
    .replace(/\(feat\..*?\)/gi, '')
    .replace(/\(with.*?\)/gi, '')
    .replace(/\[feat\..*?\]/gi, '')
    .replace(/\(from.*?\)/gi, '')
    .replace(/\[from.*?\]/gi, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\s*-\s*(from|soundtrack|ost|remix|acoustic|remastered|live|original|audio|video|lyric|lyrics).*$/gi, '')
    .replace(/["'’]/g, '')
    .trim();

  const primaryArtist = (artist || '')
    .split(/[,&/]|feat\.|ft\.|with|\s+x\s+/i)[0]
    ?.trim()
    ?.replace(/["'’]/g, '') || '';

  const cleanArtist = (artist || '')
    .replace(/["'’]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    cleanTitle: cleanTitle || title,
    primaryArtist: primaryArtist || artist,
    cleanArtist: cleanArtist || artist,
  };
}

/**
 * Tier 1: LRCLIB Open-Source Synced Lyrics API
 */
async function fetchFromLrcLib(title: string, artist: string, duration?: number): Promise<Lyrics | null> {
  const { cleanTitle, primaryArtist, cleanArtist } = cleanLyricsQuery(title, artist);

  // 1. Direct Exact Get Endpoint
  try {
    let getUrl = `https://lrclib.net/api/get?track_name=${encodeURIComponent(cleanTitle)}&artist_name=${encodeURIComponent(primaryArtist)}`;
    if (duration && duration > 0) {
      getUrl += `&duration=${Math.round(duration)}`;
    }

    const data = await universalGet(getUrl, {
      'User-Agent': 'Soundwave/1.0 (https://auramusic.app)',
    });

    if (data?.syncedLyrics) {
      const lines = parseLrc(data.syncedLyrics);
      if (lines.length > 0) {
        return {
          songId: `${artist}_${title}`,
          lines,
          synced: true,
          source: 'lrclib (synced)',
        };
      }
    } else if (data?.plainLyrics) {
      const lines = data.plainLyrics
        .split('\n')
        .map((l: string) => l.trim())
        .filter((l: string) => l.length > 0)
        .map((text: string) => ({ text: decodeHtmlEntities(text) }));
      if (lines.length > 0) {
        return {
          songId: `${artist}_${title}`,
          lines,
          synced: false,
          source: 'lrclib (plain)',
        };
      }
    }
  } catch {
    // Proceed to search queries
  }

  // 2. Search Endpoint Queries on LRCLIB
  const searchQueries = [
    `${cleanTitle} ${primaryArtist}`,
    `${cleanTitle} ${cleanArtist}`,
    cleanTitle,
  ];

  for (const q of searchQueries) {
    try {
      const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(q)}`;
      const items = await universalGet(searchUrl, {
        'User-Agent': 'Soundwave/1.0 (https://auramusic.app)',
      });

      if (Array.isArray(items) && items.length > 0) {
        // Prioritize synced lyrics item
        const syncedItem = items.find((it: any) => it.syncedLyrics);
        const item = syncedItem || items[0];

        if (item?.syncedLyrics) {
          const lines = parseLrc(item.syncedLyrics);
          if (lines.length > 0) {
            return {
              songId: `${artist}_${title}`,
              lines,
              synced: true,
              source: 'lrclib (synced)',
            };
          }
        } else if (item?.plainLyrics) {
          const lines = item.plainLyrics
            .split('\n')
            .map((l: string) => l.trim())
            .filter((l: string) => l.length > 0)
            .map((text: string) => ({ text: decodeHtmlEntities(text) }));
          if (lines.length > 0) {
            return {
              songId: `${artist}_${title}`,
              lines,
              synced: false,
              source: 'lrclib (plain)',
            };
          }
        }
      }
    } catch {
      // try next query
    }
  }

  return null;
}

/**
 * Tier 2: JioSaavn Official Lyrics API (via universalGet)
 */
async function fetchFromJioSaavn(title: string, artist: string): Promise<Lyrics | null> {
  const { cleanTitle, primaryArtist } = cleanLyricsQuery(title, artist);
  const queries = [
    `${cleanTitle} ${primaryArtist}`,
    cleanTitle,
  ];

  for (const q of queries) {
    try {
      const searchUrl = `${BASE_SAAVN_URL}?__call=search.getResults&q=${encodeURIComponent(q)}&_format=json&_marker=0&api_version=4&ctx=web6dot0&n=6&p=1`;
      const data = await universalGet(searchUrl);
      const results = Array.isArray(data?.results) ? data.results : Array.isArray(data?.songs?.data) ? data.songs.data : [];

      for (const song of results) {
        const hasLyrics = song.more_info?.has_lyrics === 'true' || song.has_lyrics === 'true' || song.has_lyrics === true;
        const songId = song.id;

        if (hasLyrics && songId) {
          const lyricsUrl = `${BASE_SAAVN_URL}?__call=lyrics.getLyrics&lyrics_id=${songId}&_format=json&_marker=0&ctx=web6dot0`;
          const lData = await universalGet(lyricsUrl);
          const rawLyrics = lData?.lyrics;
          if (rawLyrics) {
            const lines = rawLyrics
              .replace(/<br\s*\/?>/gi, '\n')
              .replace(/<.*?>/g, '')
              .split('\n')
              .map((l: string) => l.trim())
              .filter((l: string) => l.length > 0)
              .map((text: string) => ({ text: decodeHtmlEntities(text) }));

            if (lines.length > 0) {
              return {
                songId: `${artist}_${title}`,
                lines,
                synced: false,
                source: 'jiosaavn',
              };
            }
          }
        }
      }
    } catch {
      // try next
    }
  }

  return null;
}

/**
 * Tier 3: Paxsenix Synced & Plain Lyrics API
 */
async function fetchFromPaxsenix(title: string, artist: string): Promise<Lyrics | null> {
  const { cleanTitle, primaryArtist } = cleanLyricsQuery(title, artist);
  const queries = [
    `${cleanTitle} ${primaryArtist}`,
    cleanTitle,
  ];

  for (const q of queries) {
    try {
      const url = `https://api.paxsenix.biz.id/lyrics/search?q=${encodeURIComponent(q)}`;
      const data = await universalGet(url);
      if (data?.ok && data?.lyrics) {
        const raw = data.lyrics;
        const isLrc = /\[\d{2}:\d{2}/.test(raw);
        if (isLrc) {
          const lines = parseLrc(raw);
          if (lines.length > 0) {
            return {
              songId: `${artist}_${title}`,
              lines,
              synced: true,
              source: 'paxsenix (synced)',
            };
          }
        } else {
          const lines = raw
            .split('\n')
            .map((l: string) => l.trim())
            .filter((l: string) => l.length > 0)
            .map((text: string) => ({ text: decodeHtmlEntities(text) }));
          if (lines.length > 0) {
            return {
              songId: `${artist}_${title}`,
              lines,
              synced: false,
              source: 'paxsenix (plain)',
            };
          }
        }
      }
    } catch {}
  }
  return null;
}

/**
 * Tier 4: KuGou Synced Lyrics API
 */
async function fetchFromKuGou(title: string, artist: string, duration?: number): Promise<Lyrics | null> {
  const { cleanTitle, primaryArtist } = cleanLyricsQuery(title, artist);
  try {
    const durMs = duration && duration > 0 ? Math.round(duration * 1000) : 0;
    const searchUrl = `http://krcs.kugou.com/search?ver=1&man=yes&client=mobi&keyword=${encodeURIComponent(`${cleanTitle} ${primaryArtist}`)}&duration=${durMs}&hash=`;
    const searchData = await universalGet(searchUrl);
    const candidates = searchData?.candidates || [];
    if (Array.isArray(candidates) && candidates.length > 0) {
      const top = candidates[0];
      if (top.id && top.accesskey) {
        const downloadUrl = `http://krcs.kugou.com/download?ver=1&client=mobi&id=${top.id}&accesskey=${top.accesskey}&fmt=lrc&charset=utf8`;
        const downloadData = await universalGet(downloadUrl);
        if (downloadData?.content) {
          // Decode Base64 LRC content
          const decoded = atob(downloadData.content);
          const lines = parseLrc(decoded);
          if (lines.length > 0) {
            return {
              songId: `${artist}_${title}`,
              lines,
              synced: true,
              source: 'kugou (synced)',
            };
          }
        }
      }
    }
  } catch {}
  return null;
}

/**
 * Tier 5: Lyrics.ovh Plain Text API (via universalGet)
 */
async function fetchFromLyricsOvh(title: string, artist: string): Promise<Lyrics | null> {
  const { cleanTitle, primaryArtist } = cleanLyricsQuery(title, artist);
  try {
    const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(primaryArtist)}/${encodeURIComponent(cleanTitle)}`;
    const data = await universalGet(url);
    if (data?.lyrics) {
      const lines = data.lyrics
        .split('\n')
        .map((l: string) => l.trim())
        .filter((l: string) => l.length > 0)
        .map((text: string) => ({ text: decodeHtmlEntities(text) }));
      if (lines.length > 0) {
        return {
          songId: `${artist}_${title}`,
          lines,
          synced: false,
          source: 'lyrics.ovh',
        };
      }
    }
  } catch {
    // fallback
  }
  return null;
}

/**
 * Primary lyrics getter with multi-tiered resolution, caching & synced time tagging.
 * Tiers: LRCLIB -> Paxsenix -> KuGou -> JioSaavn -> Lyrics.ovh
 */
export async function getLyrics(
  artist: string,
  title: string,
  duration?: number
): Promise<Lyrics | null> {
  if (!artist || !title) return null;

  const cacheKey = `${artist.toLowerCase().trim()}_${title.toLowerCase().trim()}`;
  if (lyricsCache.has(cacheKey)) {
    return lyricsCache.get(cacheKey)!;
  }

  // 1. Try LRCLIB (Synced LRC standard)
  try {
    const lrc = await fetchFromLrcLib(title, artist, duration);
    if (lrc && lrc.lines.length > 0) {
      lyricsCache.set(cacheKey, lrc);
      return lrc;
    }
  } catch {}

  // 2. Try Paxsenix Synced API
  try {
    const pax = await fetchFromPaxsenix(title, artist);
    if (pax && pax.lines.length > 0) {
      lyricsCache.set(cacheKey, pax);
      return pax;
    }
  } catch {}

  // 3. Try KuGou Synced LRC Engine
  try {
    const kugou = await fetchFromKuGou(title, artist, duration);
    if (kugou && kugou.lines.length > 0) {
      lyricsCache.set(cacheKey, kugou);
      return kugou;
    }
  } catch {}

  // 4. Try JioSaavn Official Lyrics
  try {
    const saavn = await fetchFromJioSaavn(title, artist);
    if (saavn && saavn.lines.length > 0) {
      lyricsCache.set(cacheKey, saavn);
      return saavn;
    }
  } catch {}

  // 5. Try Lyrics.ovh Plain Text API
  try {
    const ovh = await fetchFromLyricsOvh(title, artist);
    if (ovh && ovh.lines.length > 0) {
      lyricsCache.set(cacheKey, ovh);
      return ovh;
    }
  } catch {}

  return null;
}
