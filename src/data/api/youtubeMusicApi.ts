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
 * Resolves a full audio stream for a YouTube Music song.
 */
export async function resolveYouTubeAudioStream(title: string, artist: string): Promise<string | null> {
  try {
    const res = await resolveFullTrack(title, artist);
    if (res && res.streamUrl) return res.streamUrl;
    return null;
  } catch {
    return null;
  }
}
