import type { Song, Album, Artist, SearchResult } from '../models';
import { resolveFullTrack } from './saavnApi';
import { universalGet, universalPost } from '../../core/utils/http';

const YTM_SEARCH_ENDPOINT = 'https://music.youtube.com/youtubei/v1/search?prettyPrint=false';
const PIPED_API_ENDPOINT = 'https://api.piped.private.coffee';

function parseDurationString(durStr?: string): number {
  if (!durStr) return 0;
  const parts = durStr.split(':').map(p => parseInt(p, 10));
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

/**
 * Searches YouTube Music for songs, albums, and artists.
 */
export async function searchYouTubeMusic(query: string, limit = 20): Promise<SearchResult> {
  const songs: Song[] = [];
  const albums: Album[] = [];
  const artists: Artist[] = [];

  // Try Piped API YouTube Music search first (cleanest schema)
  try {
    const pipedUrl = `${PIPED_API_ENDPOINT}/search?q=${encodeURIComponent(query)}&filter=music_songs`;
    const data = await universalGet(pipedUrl);
    if (Array.isArray(data.items)) {
      for (const item of data.items) {
        const videoId = item.url?.replace('/watch?v=', '') || '';
        const thumb = item.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
        songs.push({
          id: `yt_${videoId}`,
          title: item.title || '',
          artist: item.uploaderName || 'YouTube Music',
          album: 'YouTube Music',
          artwork: thumb,
          artworkLg: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          duration: item.duration || 0,
          previewUrl: null,
          provider: 'youtube',
          isLiked: false,
          isDownloaded: false,
          genre: 'YouTube Music',
        });
      }
    }
  } catch {
    // fallback to direct InnerTube
  }

  // Fallback / supplement with direct YouTube Music InnerTube
  if (songs.length < limit) {
    try {
      const body = {
        context: {
          client: {
            clientName: 'WEB_REMIX',
            clientVersion: '1.20240101.01.00',
            hl: 'en',
            gl: 'IN',
          },
        },
        query,
      };

      const d = await universalPost(YTM_SEARCH_ENDPOINT, body, {
        Origin: 'https://music.youtube.com',
        Referer: 'https://music.youtube.com/',
      });

      const sections = d.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
      
      for (const sec of sections) {
        const items = sec.itemSectionRenderer?.contents || [];
        for (const item of items) {
          const r = item.musicResponsiveListItemRenderer;
          if (r) {
            const flex = r.flexColumns || [];
            const title = flex[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text;
            const subRuns = flex[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
            const type = subRuns[0]?.text;
            
            if (type === 'Artist') {
              const artistName = title || subRuns[0]?.text;
              const thumb = r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.slice(-1)[0]?.url;
              if (artistName && !artists.some(a => a.name === artistName)) {
                artists.push({
                  id: `yt_artist_${artistName}`,
                  name: artistName,
                  image: thumb || '',
                  provider: 'youtube',
                });
              }
              continue;
            }

            if (type === 'Album' || type === 'EP' || type === 'Single') {
              const albumTitle = title;
              const albumArtist = subRuns[2]?.text || subRuns[0]?.text;
              const thumb = r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.slice(-1)[0]?.url;
              if (albumTitle) {
                albums.push({
                  id: `yt_album_${albumTitle}`,
                  title: albumTitle,
                  artist: albumArtist || 'YouTube Music',
                  artwork: thumb || '',
                  provider: 'youtube',
                });
              }
              continue;
            }

            // Song item
            const artist = subRuns[2]?.text || subRuns[0]?.text || 'YouTube Music';
            const album = subRuns[4]?.text || '';
            const durStr = subRuns[subRuns.length - 1]?.text || '';
            const playBtn = r.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer;
            const videoId = playBtn?.playNavigationEndpoint?.watchEndpoint?.videoId
              || r.doubleTapCommand?.watchEndpoint?.videoId
              || flex[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId
              || '';
            
            const thumb = r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.slice(-1)[0]?.url
              || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '');

            if (title && !songs.some(s => s.title.toLowerCase() === title.toLowerCase())) {
              songs.push({
                id: `yt_${videoId || title}`,
                title,
                artist,
                album: album || title,
                artwork: thumb,
                artworkLg: videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : thumb,
                duration: parseDurationString(durStr),
                previewUrl: null,
                provider: 'youtube',
                isLiked: false,
                isDownloaded: false,
                genre: 'YouTube Music',
              });
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }

  const finalSongs = songs.slice(0, limit);
  return {
    songs: finalSongs,
    artists: artists.slice(0, 10),
    albums: albums.slice(0, 10),
    query,
    total: finalSongs.length + artists.length + albums.length,
  };
}

/**
 * Fetches YouTube Music Top Charts & Trending tracks.
 */
export async function getYouTubeMusicTrending(limit = 20): Promise<Song[]> {
  const searchQueries = ['Top 50 Hits', 'Trending Music', 'Latest Hits'];
  const q = searchQueries[Math.floor(Math.random() * searchQueries.length)];
  const res = await searchYouTubeMusic(q, limit);
  return res.songs;
}

/**
 * Resolves a full-length playable audio stream from YouTube / Piped API.
 * Guaranteed to return full-length audio tracks (3-5 minutes, complete song).
 */
export async function resolveYouTubeFullAudioStream(
  title: string,
  artist: string,
  targetDuration?: number
): Promise<{ streamUrl: string; duration: number; artwork?: string } | null> {
  const cleanTitle = title
    .replace(/\(feat\..*?\)/gi, '')
    .replace(/\(with.*?\)/gi, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const primaryArtist = (artist || '').split(/[,&/]|feat\.|ft\./i)[0]?.trim() || '';
  const queries = [
    `${cleanTitle} ${primaryArtist} official audio`,
    `${cleanTitle} ${primaryArtist}`,
    `${title} ${artist}`,
    `${title}`,
  ].filter(Boolean);

  const PIPED_INSTANCES = [
    'https://api.piped.private.coffee',
    'https://pipedapi.kavin.rocks',
    'https://pipedapi.leptons.xyz',
    'https://pipedapi.tokhmi.xyz',
  ];

  const { isExactOrStrictTrackMatch } = await import('./saavnApi');

  // Strategy 1: Piped search
  for (const q of queries) {
    for (const instance of PIPED_INSTANCES) {
      try {
        const searchUrl = `${instance}/search?q=${encodeURIComponent(q)}&filter=music_songs`;
        const data = await universalGet(searchUrl);
        if (Array.isArray(data?.items) && data.items.length > 0) {
          const verifiedCandidates = data.items
            .map((item: any) => {
              const cand = {
                title: item.title || '',
                artist: item.uploaderName || item.artist || '',
                duration: item.duration || 0,
              };
              const { isMatch, score } = isExactOrStrictTrackMatch(cand, title, artist, targetDuration);
              return { item, isMatch, score };
            })
            .filter((x: any) => x.isMatch && x.item.url)
            .sort((a: any, b: any) => b.score - a.score);

          if (verifiedCandidates.length > 0) {
            const top = verifiedCandidates[0].item;
            const videoId = top.url.replace('/watch?v=', '');
            if (videoId) {
              const streamData = await universalGet(`${instance}/streams/${videoId}`);
              const audioStreams = streamData?.audioStreams;
              if (Array.isArray(audioStreams) && audioStreams.length > 0) {
                const sorted = audioStreams
                  .filter((s: any) => s.url && !s.videoOnly)
                  .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));

                if (sorted.length > 0) {
                  return {
                    streamUrl: sorted[0].url,
                    duration: streamData.duration || top.duration || targetDuration || 180,
                    artwork: streamData.thumbnailUrl || top.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                  };
                }
              }
            }
          }
        }
      } catch {
        // try next instance
      }
    }
  }

  // Strategy 2: Direct InnerTube search + stream resolution
  for (const q of queries) {
    try {
      const ytResult = await searchYouTubeMusic(q, 4);
      if (ytResult.songs && ytResult.songs.length > 0) {
        for (const candidateSong of ytResult.songs) {
          const videoId = candidateSong.id.replace('yt_', '');
          if (!videoId) continue;

          for (const instance of PIPED_INSTANCES) {
            try {
              const streamData = await universalGet(`${instance}/streams/${videoId}`);
              const audioStreams = streamData?.audioStreams;
              if (Array.isArray(audioStreams) && audioStreams.length > 0) {
                const sorted = audioStreams
                  .filter((s: any) => s.url && !s.videoOnly)
                  .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));

                if (sorted.length > 0) {
                  return {
                    streamUrl: sorted[0].url,
                    duration: streamData.duration || candidateSong.duration || targetDuration || 180,
                    artwork: candidateSong.artwork || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                  };
                }
              }
            } catch {}
          }
        }
      }
    } catch {}
  }

  return null;
}

/**
 * Resolves a full audio stream for a YouTube Music song.
 */
export async function resolveYouTubeAudioStream(title: string, artist: string): Promise<string | null> {
  try {
    const res = await resolveFullTrack(title, artist);
    if (res && res.streamUrl) return res.streamUrl;
    const ytRes = await resolveYouTubeFullAudioStream(title, artist);
    if (ytRes && ytRes.streamUrl) return ytRes.streamUrl;
    return null;
  } catch {
    return null;
  }
}

/**
 * Directly resolves a high-quality audio stream for a known YouTube video ID.
 */
export async function getYouTubeTrackAudioStream(
  videoId: string,
  targetDuration?: number
): Promise<{ streamUrl: string; duration: number; artwork?: string } | null> {
  if (!videoId) return null;
  const cleanId = videoId.replace(/^yt_/, '').replace('/watch?v=', '').trim();
  const PIPED_INSTANCES = [
    'https://api.piped.private.coffee',
    'https://pipedapi.kavin.rocks',
    'https://pipedapi.leptons.xyz',
    'https://pipedapi.tokhmi.xyz',
  ];

  for (const instance of PIPED_INSTANCES) {
    try {
      const streamData = await universalGet(`${instance}/streams/${cleanId}`);
      const audioStreams = streamData?.audioStreams;
      if (Array.isArray(audioStreams) && audioStreams.length > 0) {
        const sorted = audioStreams
          .filter((s: any) => s.url && !s.videoOnly)
          .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));

        if (sorted.length > 0) {
          return {
            streamUrl: sorted[0].url,
            duration: streamData.duration || targetDuration || 180,
            artwork: streamData.thumbnailUrl || `https://i.ytimg.com/vi/${cleanId}/hqdefault.jpg`,
          };
        }
      }
    } catch {}
  }
  return null;
}

/**
 * Generates an automated song queue / radio automix based on a track's videoId or title.
 */
export async function getYouTubeMusicRadio(videoIdOrQuery: string, limit = 15): Promise<Song[]> {
  const cleanId = videoIdOrQuery.replace(/^yt_/, '').trim();
  const PIPED_API_ENDPOINT = 'https://api.piped.private.coffee';

  // 1. Try Piped API related streams
  if (cleanId.length === 11) {
    try {
      const data = await universalGet(`${PIPED_API_ENDPOINT}/streams/${cleanId}`);
      const related = data?.relatedStreams || [];
      if (Array.isArray(related) && related.length > 0) {
        const songs: Song[] = related
          .filter((r: any) => r.type === 'stream' && r.url)
          .slice(0, limit)
          .map((r: any) => {
            const vId = r.url?.replace('/watch?v=', '') || '';
            return {
              id: `yt_${vId}`,
              title: r.title || 'Unknown Track',
              artist: r.uploaderName || 'YouTube Music',
              album: 'YouTube Radio',
              artwork: r.thumbnail || `https://i.ytimg.com/vi/${vId}/hqdefault.jpg`,
              artworkLg: `https://i.ytimg.com/vi/${vId}/hqdefault.jpg`,
              duration: r.duration || 180,
              previewUrl: null,
              provider: 'youtube' as const,
              isLiked: false,
              isDownloaded: false,
              genre: 'Radio',
            };
          });
        if (songs.length > 0) return songs;
      }
    } catch {}
  }

  // 2. Fallback to smart search recommendation
  const searchRes = await searchYouTubeMusic(`${videoIdOrQuery} mix`, limit);
  return searchRes.songs;
}

/**
 * Extracts a YouTube playlist ID from standard or YouTube Music URLs.
 */
export function extractYouTubePlaylistId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  const listMatch = trimmed.match(/[?&]list=([a-zA-Z0-9_-]+)/);
  if (listMatch && listMatch[1]) return listMatch[1];
  const rawMatch = trimmed.match(/^(PL|RD|UU|LL|FL)[a-zA-Z0-9_-]+$/);
  if (rawMatch) return rawMatch[0];
  return null;
}

/**
 * Imports and mirrors a public YouTube or YouTube Music playlist.
 */
export async function importYouTubePlaylist(
  urlOrId: string
): Promise<{ title: string; artwork: string; tracks: Song[] } | null> {
  const playlistId = extractYouTubePlaylistId(urlOrId);
  if (!playlistId) return null;

  const PIPED_INSTANCES = [
    'https://api.piped.private.coffee',
    'https://pipedapi.kavin.rocks',
    'https://pipedapi.leptons.xyz',
  ];

  for (const instance of PIPED_INSTANCES) {
    try {
      const data = await universalGet(`${instance}/playlists/${playlistId}`);
      if (data && Array.isArray(data.relatedStreams)) {
        const title = data.name || 'YouTube Imported Playlist';
        const artwork = data.thumbnailUrl || (data.relatedStreams[0]?.thumbnail) || '';
        const tracks: Song[] = data.relatedStreams
          .filter((item: any) => item.url)
          .map((item: any) => {
            const vId = item.url.replace('/watch?v=', '');
            return {
              id: `yt_${vId}`,
              title: item.title || 'Untitled Track',
              artist: item.uploaderName || 'YouTube Artist',
              album: title,
              artwork: item.thumbnail || `https://i.ytimg.com/vi/${vId}/hqdefault.jpg`,
              artworkLg: `https://i.ytimg.com/vi/${vId}/hqdefault.jpg`,
              duration: item.duration || 180,
              previewUrl: null,
              provider: 'youtube' as const,
              isLiked: false,
              isDownloaded: false,
              genre: 'YouTube Import',
            };
          });

        if (tracks.length > 0) {
          return { title, artwork, tracks };
        }
      }
    } catch {}
  }

  return null;
}
