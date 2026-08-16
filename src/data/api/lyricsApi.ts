// ═══════════════════════════════════════════
//  Lyrics Engine — Multi-Tier Synced LRC & Plain Lyrics Resolver
//  Tiers: 1. LRCLIB Synced API -> 2. JioSaavn Official Lyrics -> 3. Lyrics.ovh Fallback
// ═══════════════════════════════════════════

import type { Lyrics, LyricsLine } from '../models';
import { decodeHtmlEntities } from '../../core/utils';

/**
 * Parses raw .lrc format text into sorted LyricsLine array with exact timestamps in seconds.
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

      // Even if text is empty (musical pause), include it so highlight clears properly
      result.push({
        time: Math.max(0, timeInSeconds),
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
function cleanLyricsQuery(title: string, artist: string): { cleanTitle: string; primaryArtist: string } {
  const cleanTitle = title
    .replace(/\(feat\..*?\)/gi, '')
    .replace(/\(with.*?\)/gi, '')
    .replace(/\[feat\..*?\]/gi, '')
    .replace(/\(from.*?\)/gi, '')
    .replace(/\[from.*?\]/gi, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\s*-\s*(from|soundtrack|ost|remix|acoustic|remastered|live|original).*$/gi, '')
    .replace(/["'’]/g, '')
    .trim();

  const primaryArtist = artist
    .split(/[,&/]|feat\.|ft\.|with|\s+x\s+/i)[0]
    ?.trim()
    ?.replace(/["'’]/g, '') || '';

  return { cleanTitle: cleanTitle || title, primaryArtist: primaryArtist || artist };
}

/**
 * Tier 1: LRCLIB Open-Source Synced Lyrics API
 */
async function fetchFromLrcLib(title: string, artist: string, duration?: number): Promise<Lyrics | null> {
  const { cleanTitle, primaryArtist } = cleanLyricsQuery(title, artist);

  // 1. Direct Get Endpoint
  try {
    let getUrl = `https://lrclib.net/api/get?track_name=${encodeURIComponent(cleanTitle)}&artist_name=${encodeURIComponent(primaryArtist)}`;
    if (duration && duration > 0) {
      getUrl += `&duration=${Math.round(duration)}`;
    }

    const res = await fetch(getUrl, {
      headers: { 'User-Agent': 'Soundwave/1.0 (https://auramusic.app)' },
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) {
      const data = await res.json();
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
    }
  } catch {
    // Proceed to search
  }

  // 2. Search Endpoint Fallback on LRCLIB
  try {
    const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(`${cleanTitle} ${primaryArtist}`)}`;
    const res = await fetch(searchUrl, {
      headers: { 'User-Agent': 'Soundwave/1.0 (https://auramusic.app)' },
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) {
      const items = await res.json();
      if (Array.isArray(items) && items.length > 0) {
        // Find best match with synced lyrics
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
    }
  } catch {
    // try next tier
  }

  return null;
}

/**
 * Tier 2: JioSaavn Lyrics API
 */
async function fetchFromJioSaavn(title: string, artist: string): Promise<Lyrics | null> {
  const { cleanTitle, primaryArtist } = cleanLyricsQuery(title, artist);
  try {
    const searchUrl = `https://www.jiosaavn.com/api.php?__call=search.getMoreResults&query=${encodeURIComponent(`${cleanTitle} ${primaryArtist}`)}&p=1&n=3&_format=json&_marker=0&ctx=web6dot0&params=%7B%22type%22%3A%22songs%22%7D`;
    const res = await fetch(searchUrl, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const data = await res.json();

    if (data?.results && Array.isArray(data.results)) {
      for (const song of data.results) {
        const hasLyrics = song.more_info?.has_lyrics === 'true' || song.has_lyrics === 'true';
        const songId = song.id;

        if (hasLyrics && songId) {
          const lyricsUrl = `https://www.jiosaavn.com/api.php?__call=lyrics.getLyrics&lyrics_id=${songId}&_format=json&_marker=0&ctx=web6dot0`;
          const lRes = await fetch(lyricsUrl, { signal: AbortSignal.timeout(4000) });
          if (lRes.ok) {
            const lData = await lRes.json();
            const rawLyrics = lData?.lyrics;
            if (rawLyrics) {
              const lines = rawLyrics
                .replace(/<br\s*\/?>/gi, '\n')
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
      }
    }
  } catch {
    // next tier
  }
  return null;
}

/**
 * Tier 3: Lyrics.ovh Plain Text API
 */
async function fetchFromLyricsOvh(title: string, artist: string): Promise<Lyrics | null> {
  const { cleanTitle, primaryArtist } = cleanLyricsQuery(title, artist);
  try {
    const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(primaryArtist)}/${encodeURIComponent(cleanTitle)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const data = await res.json();
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
 * Primary lyrics getter with multi-tiered resolution & synced time tagging.
 */
export async function getLyrics(
  artist: string,
  title: string,
  duration?: number
): Promise<Lyrics | null> {
  if (!artist || !title) return null;

  // 1. Try LRCLIB (Synced LRC standard)
  const lrc = await fetchFromLrcLib(title, artist, duration);
  if (lrc) return lrc;

  // 2. Try JioSaavn
  const saavn = await fetchFromJioSaavn(title, artist);
  if (saavn) return saavn;

  // 3. Try Lyrics.ovh
  const ovh = await fetchFromLyricsOvh(title, artist);
  if (ovh) return ovh;

  return null;
}
