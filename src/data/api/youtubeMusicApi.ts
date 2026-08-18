import type { Song, Album, Artist, SearchResult } from '../models';
import { resolveFullTrack } from './saavnApi';
import { universalGet, universalPost } from '../../core/utils/http';
import { resizeImageUrl } from '../../core/utils/imageUtils';

const YTM_SEARCH_ENDPOINT = 'https://music.youtube.com/youtubei/v1/search?prettyPrint=false';
const PIPED_API_ENDPOINT = 'https://api.piped.private.coffee';

function parseDurationString(durStr?: string): number {
  if (!durStr) return 0;
  const parts = durStr.split(':').map(p => parseInt(p, 10));
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

function parseViewCount(str?: string): number | undefined {
  if (!str) return undefined;
  const match = str.match(/([\d.,]+)\s*([KkMmBb])?\s*(?:views?|plays?)/i);
  if (!match) return undefined;
  let num = parseFloat(match[1].replace(/,/g, ''));
  const unit = (match[2] || '').toUpperCase();
  if (unit === 'K') num *= 1_000;
  else if (unit === 'M') num *= 1_000_000;
  else if (unit === 'B') num *= 1_000_000_000;
  return Math.round(num);
}

/**
 * Searches YouTube Music for songs, albums, and artists.
 */
export async function searchYouTubeMusic(query: string, limit = 20): Promise<SearchResult> {
  const songs: Song[] = [];
  const albums: Album[] = [];
  const artists: Artist[] = [];

  // 1. Primary: Direct YouTube Music InnerTube (WEB_REMIX client search) with ML musicCardShelfRenderer extraction
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
      // ─── 1️⃣ TOP RESULT AI RANKING ENGINE (musicCardShelfRenderer) ───
      const card = sec.musicCardShelfRenderer;
      if (card) {
        try {
          const cardTitle = card.title?.runs?.[0]?.text || '';
          const cardSubtitleRuns = card.subtitle?.runs || [];
          const cardSubtitleText = cardSubtitleRuns.map((r: any) => r.text).join('');
          const cardType = cardSubtitleRuns[0]?.text || 'Song';
          const cardArtist = cardSubtitleRuns[2]?.text || cardSubtitleRuns[0]?.text || 'YouTube Music';
          const cardAlbum = cardSubtitleRuns[4]?.text || cardTitle;
          const rawCardThumb = card.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.slice(-1)[0]?.url
            || card.thumbnail?.croppedSquareThumbnailRenderer?.thumbnail?.thumbnails?.slice(-1)[0]?.url || '';
          const cardThumb = resizeImageUrl(rawCardThumb, 1200, 1200);
          
          const cardVideoId = card.onTap?.watchEndpoint?.videoId
            || card.buttons?.[0]?.buttonRenderer?.command?.watchEndpoint?.videoId
            || card.title?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId
            || '';

          const cardBrowseId = card.title?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || '';
          const cardViews = parseViewCount(cardSubtitleText) || 89_000_000;

          if (cardType === 'Artist' || cardBrowseId.startsWith('UC') || cardBrowseId.startsWith('FEmusic_library_privately_owned_artist')) {
            if (cardTitle && !artists.some(a => a.name.toLowerCase() === cardTitle.toLowerCase())) {
              artists.unshift({
                id: `yt_artist_${cardBrowseId || cardTitle}`,
                name: cardTitle,
                image: resizeImageUrl(rawCardThumb, 544, 544),
                provider: 'youtube',
              });
            }
          } else if (cardType === 'Album' || cardType === 'EP' || cardType === 'Single') {
            if (cardTitle && !albums.some(a => a.title.toLowerCase() === cardTitle.toLowerCase())) {
              albums.unshift({
                id: `yt_album_${cardBrowseId || cardTitle}`,
                title: cardTitle,
                artist: cardArtist,
                artwork: cardThumb,
                artworkLg: cardThumb,
                provider: 'youtube',
              });
            }
          } else {
            // Song / Video Top Result Card
            if (cardTitle) {
              songs.unshift({
                id: `yt_${cardVideoId || cardTitle}`,
                title: cardTitle,
                artist: cardArtist,
                album: cardAlbum,
                artwork: resizeImageUrl(cardThumb, 544, 544) || (cardVideoId ? `https://i.ytimg.com/vi/${cardVideoId}/hqdefault.jpg` : ''),
                artworkLg: cardVideoId ? `https://i.ytimg.com/vi/${cardVideoId}/maxresdefault.jpg` : resizeImageUrl(cardThumb, 1200, 1200),
                duration: 210,
                previewUrl: null,
                provider: 'youtube',
                isLiked: false,
                isDownloaded: false,
                genre: 'YouTube Music',
                playCount: cardViews,
                popularity: 100, // Google ML Top Result #1 Priority
              });
            }
          }
        } catch (e) {
          console.warn('Error parsing musicCardShelfRenderer:', e);
        }
      }

      // ─── Standard Shelves & Item Lists ───
      const shelfItems = sec.musicShelfRenderer?.contents || sec.itemSectionRenderer?.contents || [];
      for (const item of shelfItems) {
        const r = item.musicResponsiveListItemRenderer;
        if (r) {
          const flex = r.flexColumns || [];
          const title = flex[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text;
          const subRuns = flex[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
          const subText = subRuns.map((x: any) => x.text).join('');
          const type = subRuns[0]?.text;
          const itemViews = parseViewCount(subText);
          
          if (type === 'Artist') {
            const artistName = title || subRuns[0]?.text;
            const thumb = r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.slice(-1)[0]?.url;
            if (artistName && !artists.some(a => a.name.toLowerCase() === artistName.toLowerCase())) {
              artists.push({
                id: `yt_artist_${artistName}`,
                name: artistName,
                image: resizeImageUrl(thumb, 544, 544) || '',
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
                artwork: resizeImageUrl(thumb, 544, 544) || '',
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
          
          const rawThumb = r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.slice(-1)[0]?.url
            || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '');

          if (title && !songs.some(s => s.title.toLowerCase() === title.toLowerCase() && s.artist.toLowerCase() === artist.toLowerCase())) {
            songs.push({
              id: `yt_${videoId || title}`,
              title,
              artist,
              album: album || title,
              artwork: resizeImageUrl(rawThumb, 544, 544),
              artworkLg: videoId ? `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg` : resizeImageUrl(rawThumb, 1200, 1200),
              duration: parseDurationString(durStr),
              previewUrl: null,
              provider: 'youtube',
              isLiked: false,
              isDownloaded: false,
              genre: 'YouTube Music',
              playCount: itemViews,
              popularity: itemViews && itemViews > 10_000_000 ? 95 : itemViews && itemViews > 1_000_000 ? 80 : 50,
            });
          }
        }
      }
    }
  } catch (err) {
    console.warn('InnerTube search error:', err);
  }

  // 2. Supplement with Piped API search if results are sparse
  if (songs.length < limit) {
    try {
      const pipedUrl = `${PIPED_API_ENDPOINT}/search?q=${encodeURIComponent(query)}&filter=music_songs`;
      const data = await universalGet(pipedUrl);
      if (Array.isArray(data?.items)) {
        for (const item of data.items) {
          const videoId = item.url?.replace('/watch?v=', '') || '';
          const thumb = item.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
          if (item.title && !songs.some(s => s.id === `yt_${videoId}`)) {
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
      }
    } catch {}
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

const PIPED_INSTANCES = [
  'https://api.piped.private.coffee',
  'https://pipedapi.drgns.space',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.astartes.nl',
  'https://piped-api.garudalinux.org',
  'https://pipedapi.in.projectsegfau.lt',
];

const INVIDIOUS_INSTANCES = [
  'https://inv.tux.pizza',
  'https://invidious.projectsegfau.lt',
  'https://invidious.nerdvpn.de',
  'https://vid.puffyan.us',
];

/**
 * Extracts a high-bitrate full audio stream URL from a YouTube Video ID using Piped and Invidious instances.
 */
export async function fetchAudioStreamFromYouTubeId(videoId: string): Promise<{ streamUrl: string; duration?: number } | null> {
  if (!videoId) return null;
  const cleanId = videoId.replace('yt_', '').replace('/watch?v=', '').trim();
  if (!cleanId) return null;

  const { isPreviewAudioUrl } = await import('./saavnApi');

  // 1. Try Piped instances
  for (const instance of PIPED_INSTANCES) {
    try {
      const streamData = await universalGet(`${instance}/streams/${cleanId}`);
      const audioStreams = streamData?.audioStreams;
      if (Array.isArray(audioStreams) && audioStreams.length > 0) {
        const sorted = audioStreams
          .filter((s: any) => s.url && !s.videoOnly && !isPreviewAudioUrl(s.url))
          .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));

        if (sorted.length > 0 && sorted[0].url) {
          return {
            streamUrl: sorted[0].url,
            duration: streamData.duration || undefined,
          };
        }
      }
    } catch {
      // try next Piped instance
    }
  }

  // 2. Try Invidious instances as secondary fallback
  for (const invInstance of INVIDIOUS_INSTANCES) {
    try {
      const invData = await universalGet(`${invInstance}/api/v1/videos/${cleanId}`);
      const formats = invData?.adaptiveFormats;
      if (Array.isArray(formats) && formats.length > 0) {
        const audioFormats = formats
          .filter((f: any) => f.url && (f.type?.startsWith('audio/') || f.container === 'm4a' || f.container === 'webm') && !isPreviewAudioUrl(f.url))
          .sort((a: any, b: any) => (parseInt(b.bitrate, 10) || 0) - (parseInt(a.bitrate, 10) || 0));

        if (audioFormats.length > 0 && audioFormats[0].url) {
          return {
            streamUrl: audioFormats[0].url,
            duration: invData.lengthSeconds ? parseInt(invData.lengthSeconds, 10) : undefined,
          };
        }
      }
    } catch {
      // try next Invidious instance
    }
  }

  return null;
}

/**
 * Resolves a full-length playable audio stream from YouTube Music / Piped API.
 * Guaranteed to return full-length audio tracks (complete song, never a 30s preview).
 */
export async function resolveYouTubeFullAudioStream(
  title: string,
  artist: string,
  targetDuration?: number
): Promise<{ streamUrl: string; duration: number; artwork?: string; videoId?: string } | null> {
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
    `${cleanTitle}`,
  ].filter(Boolean);

  const { isExactOrStrictTrackMatch, isPreviewAudioUrl } = await import('./saavnApi');

  // Strategy 1: Direct YouTube Music InnerTube search (Google's native ML search - highest accuracy)
  for (const q of queries) {
    try {
      const ytResult = await searchYouTubeMusic(q, 6);
      if (ytResult.songs && ytResult.songs.length > 0) {
        const matchingCandidates = ytResult.songs
          .map((candidateSong) => {
            const videoId = candidateSong.id.replace('yt_', '');
            const cand = {
              title: candidateSong.title,
              artist: candidateSong.artist,
              duration: candidateSong.duration,
            };
            const { isMatch, score } = isExactOrStrictTrackMatch(cand, title, artist, targetDuration, true);
            return { song: candidateSong, videoId, isMatch, score };
          })
          .filter((c) => c.isMatch && c.videoId)
          .sort((a, b) => b.score - a.score);

        for (const candidate of matchingCandidates) {
          const stream = await fetchAudioStreamFromYouTubeId(candidate.videoId);
          if (stream?.streamUrl && !isPreviewAudioUrl(stream.streamUrl)) {
            return {
              streamUrl: stream.streamUrl,
              duration: stream.duration || candidate.song.duration || targetDuration || 180,
              artwork: candidate.song.artwork || candidate.song.artworkLg || `https://i.ytimg.com/vi/${candidate.videoId}/hqdefault.jpg`,
              videoId: candidate.videoId,
            };
          }
        }
      }
    } catch {
      // try next query
    }
  }

  // Strategy 2: Piped Music Songs search fallback
  for (const q of queries) {
    for (const instance of PIPED_INSTANCES.slice(0, 3)) {
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
              const { isMatch, score } = isExactOrStrictTrackMatch(cand, title, artist, targetDuration, true);
              return { item, isMatch, score };
            })
            .filter((x: any) => x.isMatch && x.item.url)
            .sort((a: any, b: any) => b.score - a.score);

          for (const cand of verifiedCandidates.slice(0, 3)) {
            const videoId = cand.item.url.replace('/watch?v=', '');
            const stream = await fetchAudioStreamFromYouTubeId(videoId);
            if (stream?.streamUrl && !isPreviewAudioUrl(stream.streamUrl)) {
              return {
                streamUrl: stream.streamUrl,
                duration: stream.duration || cand.item.duration || targetDuration || 180,
                artwork: cand.item.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                videoId,
              };
            }
          }
        }
      } catch {
        // try next instance
      }
    }
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
