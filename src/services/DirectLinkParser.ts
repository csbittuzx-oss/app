// ═══════════════════════════════════════════
//  DirectLinkParser
//  Smart Direct URL & Link Detection for YouTube, Spotify, and JioSaavn
// ═══════════════════════════════════════════

import type { Song, SearchResult } from '../data/models';
import { universalGet } from '../core/utils/http';
import { searchJioSaavn } from '../data/api/saavnApi';

export interface ParsedLinkResult {
  isLink: boolean;
  type: 'song' | 'album' | 'artist' | 'playlist' | 'unknown';
  searchResult?: SearchResult;
}

/**
 * Checks if the user query is a direct media URL or ID.
 */
export function isDirectMediaUrl(query: string): boolean {
  const q = (query || '').trim();
  if (!q) return false;
  return (
    /^(https?:\/\/)?(www\.|music\.)?(youtube\.com|youtu\.be)\//i.test(q) ||
    /^(https?:\/\/)?(open\.)?spotify\.com\//i.test(q) ||
    /^(https?:\/\/)?(www\.)?jiosaavn\.com\//i.test(q) ||
    /^[a-zA-Z0-9_-]{11}$/.test(q) // Standalone 11-char YouTube Video ID
  );
}

/**
 * Extract YouTube Video ID from any format of YouTube URL.
 */
export function extractYouTubeVideoId(url: string): string | null {
  const clean = url.trim();
  // 1. Standalone 11-char ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) {
    return clean;
  }
  // 2. youtu.be/ID
  const shortMatch = clean.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/i);
  if (shortMatch && shortMatch[1]) return shortMatch[1];

  // 3. watch?v=ID or /v/ID or /embed/ID or /shorts/ID
  const standardMatch = clean.match(/(?:watch\?v=|embed\/|v\/|shorts\/)([a-zA-Z0-9_-]{11})/i);
  if (standardMatch && standardMatch[1]) return standardMatch[1];

  return null;
}

/**
 * Resolves a YouTube video ID into a full playable Song object instantly.
 */
export async function resolveYouTubeVideoDirect(videoId: string): Promise<Song> {
  let title = 'YouTube Track';
  let artist = 'YouTube Music';
  let artwork = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  try {
    // Fast oEmbed lookup for exact official title and author
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const data = await universalGet(oembedUrl);
    if (data?.title) {
      title = data.title;
      artist = data.author_name || 'YouTube Music';
    }
  } catch {}

  return {
    id: `yt_${videoId}`,
    title,
    artist,
    album: title,
    artwork,
    artworkLg: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    duration: 210,
    previewUrl: null,
    provider: 'youtube',
    isLiked: false,
    isDownloaded: false,
    genre: 'YouTube Music',
  };
}

/**
 * Resolves direct URLs immediately into a structured SearchResult without full text search.
 */
export async function parseDirectMusicUrl(rawQuery: string): Promise<ParsedLinkResult | null> {
  const query = (rawQuery || '').trim();
  if (!isDirectMediaUrl(query)) return null;

  try {
    // 1. YouTube Video URL or standalone ID
    const ytVideoId = extractYouTubeVideoId(query);
    if (ytVideoId) {
      const song = await resolveYouTubeVideoDirect(ytVideoId);
      return {
        isLink: true,
        type: 'song',
        searchResult: {
          songs: [song],
          artists: [],
          albums: [],
          query,
          total: 1,
        },
      };
    }

    // 2. JioSaavn Song URL
    if (query.includes('jiosaavn.com/song/')) {
      const match = query.match(/jiosaavn\.com\/song\/([^/]+)/i);
      const songSlug = match?.[1]?.replace(/-/g, ' ');
      if (songSlug) {
        const saavnRes = await searchJioSaavn(songSlug, 5);
        if (saavnRes.songs.length > 0) {
          return {
            isLink: true,
            type: 'song',
            searchResult: {
              songs: saavnRes.songs,
              artists: [],
              albums: [],
              query,
              total: saavnRes.songs.length,
            },
          };
        }
      }
    }
  } catch (err) {
    console.warn('DirectLinkParser error:', err);
  }

  return null;
}
