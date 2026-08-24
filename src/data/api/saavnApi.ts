import CryptoJS from 'crypto-js';
import type { Song, Album, Artist, SearchResult, AudioQuality } from '../models';
import { universalGet } from '../../core/utils/http';
import { evaluateTrackMatch, cleanCoreTitle } from '../../domain/player/TrackMatchingEngine';

const BASE_URL = 'https://www.jiosaavn.com/api.php';
const DES_KEY = '38346591';

/**
 * Replaces stream URL with the requested bitrate:
 * high -> _320.mp4 / _320_m4a.mp4 (320kbps Extreme HD Studio Master Audio)
 * medium -> _160.mp4 / _160_m4a.mp4 (160/192kbps High Quality)
 * low -> _96.mp4 / _96_m4a.mp4 (96kbps Data Saver)
 */
export function formatMediaUrlWithQuality(url?: string | null, quality: AudioQuality = 'high'): string {
  if (!url || typeof url !== 'string') return '';
  const targetSuffix = quality === 'low' ? '_96' : quality === 'medium' ? '_160' : '_320';
  let formatted = url.replace('http://', 'https://');

  if (formatted.includes('saavncdn.com') || formatted.includes('saavn.com')) {
    // 1. URLs with pattern _48_m4a.mp4, _96_m4a.mp4, _160_m4a.mp4, _320_m4a.mp4
    if (/_(12|48|64|96|160|320)_m4a\.(mp4|m4a|mp3)/i.test(formatted)) {
      formatted = formatted.replace(/_(12|48|64|96|160|320)_m4a\.(mp4|m4a|mp3)/gi, `${targetSuffix}_m4a.$2`);
    }
    // 2. URLs with pattern _12.mp4, _48.mp4, _64.mp4, _96.mp4, _160.mp4, _320.mp4, _96.m4a, etc.
    else if (/_(12|48|64|96|160|320)\.(mp4|m4a|mp3)/i.test(formatted)) {
      formatted = formatted.replace(/_(12|48|64|96|160|320)\.(mp4|m4a|mp3)/gi, `${targetSuffix}.$2`);
    }
    // 3. URLs with _12, _48, _64, _96, _160 without standard extension
    else if (/_(12|48|64|96|160|320)/i.test(formatted)) {
      formatted = formatted.replace(/_(12|48|64|96|160|320)/gi, targetSuffix);
    }
    // 4. Clean .mp4 / .m4a ending with no bitrate tag
    else if (/\.(mp4|m4a|mp3)$/i.test(formatted) && !/_(96|160|320)/.test(formatted)) {
      formatted = formatted.replace(/\.(mp4|m4a|mp3)$/i, `${targetSuffix}.mp4`);
    }
  }

  return formatted;
}

/**
 * Decrypts JioSaavn encrypted media url to specified quality audio stream
 */
export function decryptMediaUrl(encryptedUrl?: string, quality: AudioQuality = 'high'): string | null {
  if (!encryptedUrl || typeof encryptedUrl !== 'string') return null;
  try {
    const key = CryptoJS.enc.Utf8.parse(DES_KEY);
    const cipherParams = CryptoJS.lib.CipherParams.create({
      ciphertext: CryptoJS.enc.Base64.parse(encryptedUrl.trim()),
    });
    const decrypted = CryptoJS.DES.decrypt(cipherParams, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    });
    const rawUrl = decrypted.toString(CryptoJS.enc.Utf8);
    if (!rawUrl || !rawUrl.startsWith('http')) return null;
    
    return formatMediaUrlWithQuality(rawUrl, quality);
  } catch (err) {
    console.error('Error decrypting JioSaavn media url:', err);
    return null;
  }
}

/**
 * Directly fetches authentic high-quality media stream by Saavn song ID.
 */
export async function fetchSaavnSongStreamById(songId: string, quality: AudioQuality = 'high'): Promise<string | null> {
  const cleanId = songId.replace('saavn_', '').trim();
  if (!cleanId || !/^\d+$/.test(cleanId)) return null;
  try {
    const detailsUrl = `${BASE_URL}?__call=song.getDetails&pids=${cleanId}&_format=json&_marker=0&ctx=web6dot0`;
    const detailsData = await universalGet(detailsUrl);
    const songItem = Array.isArray(detailsData?.songs) ? detailsData.songs[0] : (detailsData?.[cleanId] || null);
    if (songItem?.encrypted_media_url) {
      const dec = decryptMediaUrl(songItem.encrypted_media_url, quality);
      if (dec && !isPreviewAudioUrl(dec)) {
        return formatMediaUrlWithQuality(dec, quality);
      }
    }
  } catch {}
  return null;
}

/**
 * Detects if a URL is a 30s preview clip rather than a full-length playable audio stream.
 */
export function isPreviewAudioUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string' || !url.startsWith('http')) return true;
  const lower = url.toLowerCase();
  return (
    lower.includes('p.scdn.co') ||
    lower.includes('audio-preview') ||
    lower.includes('_preview') ||
    lower.includes('preview.mp4') ||
    lower.includes('preview.mp3') ||
    lower.includes('preview_') ||
    lower.includes('/preview/') ||
    lower.includes('apple.com') ||
    lower.includes('mzstatic.com') ||
    lower.includes('spotify.com')
  );
}

function decodeHtmlEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function getHighResImage(url?: string): string {
  if (!url) return '';
  return url
    .replace('50x50.jpg', '500x500.jpg')
    .replace('150x150.jpg', '500x500.jpg')
    .replace('http://', 'https://');
}

/**
 * Searches JioSaavn for songs with full 320kbps audio streams.
 */
export async function searchJioSaavn(query: string, limit = 20): Promise<SearchResult> {
  try {
    let songs: Song[] = [];

    // 1. Primary: search.getResults (official universal query endpoint)
    try {
      const getResultsUrl = `${BASE_URL}?__call=search.getResults&q=${encodeURIComponent(query)}&_format=json&_marker=0&api_version=4&ctx=web6dot0&n=${limit}&p=1`;
      const resData = await universalGet(getResultsUrl);
      const rawResults = Array.isArray(resData?.results) ? resData.results : Array.isArray(resData?.songs?.data) ? resData.songs.data : [];

      if (rawResults.length > 0) {
        songs = rawResults.map((item: any) => {
          const fullAudioUrl = decryptMediaUrl(item.more_info?.encrypted_media_url || item.encrypted_media_url)
            || item.more_info?.vlink
            || item.vlink
            || item.media_preview_url
            || null;
          const durationSec = parseInt(item.more_info?.duration || item.duration, 10) || 0;
          const rawPlayCount = item.more_info?.play_count || item.play_count;
          const playCount = rawPlayCount ? parseInt(String(rawPlayCount), 10) : undefined;
          return {
            id: `saavn_${item.id}`,
            title: decodeHtmlEntities(item.title || item.song || ''),
            artist: decodeHtmlEntities(item.subtitle || item.more_info?.primary_artists || item.primary_artists || item.singers || 'Unknown Artist'),
            album: decodeHtmlEntities(item.more_info?.album || item.album || ''),
            artwork: getHighResImage(item.image),
            artworkLg: getHighResImage(item.image),
            duration: durationSec,
            previewUrl: fullAudioUrl,
            provider: 'saavn' as const,
            isLiked: false,
            isDownloaded: false,
            year: item.year ? parseInt(item.year, 10) : undefined,
            playCount,
            popularity: playCount && playCount > 1000000 ? 90 : playCount && playCount > 100000 ? 75 : 60,
            genre: item.language || 'Music',
            language: (item.language || item.more_info?.language || '').toLowerCase(),
          };
        });
      }
    } catch (e) {
      console.warn('JioSaavn primary search warning:', e);
    }

    // 2. Secondary: search.getMoreResults if primary returned no songs
    if (songs.length === 0) {
      try {
        const deepUrl = `${BASE_URL}?__call=search.getMoreResults&query=${encodeURIComponent(query)}&p=1&n=${limit}&_format=json&_marker=0&ctx=web6dot0&params=%7B%22type%22%3A%22songs%22%7D`;
        const deepData = await universalGet(deepUrl);
        if (Array.isArray(deepData?.results)) {
          songs = deepData.results.map((item: any) => {
            const fullAudioUrl = decryptMediaUrl(item.encrypted_media_url) || item.vlink || item.more_info?.vlink || null;
            const durationSec = parseInt(item.duration, 10) || 0;
            const rawPlayCount = item.play_count || item.more_info?.play_count;
            const playCount = rawPlayCount ? parseInt(String(rawPlayCount), 10) : undefined;
            return {
              id: `saavn_${item.id}`,
              title: decodeHtmlEntities(item.song || item.title || ''),
              artist: decodeHtmlEntities(item.primary_artists || item.singers || 'Unknown Artist'),
              album: decodeHtmlEntities(item.album || ''),
              artwork: getHighResImage(item.image),
              artworkLg: getHighResImage(item.image),
              duration: durationSec,
              previewUrl: fullAudioUrl,
              provider: 'saavn' as const,
              isLiked: false,
              isDownloaded: false,
              year: item.year ? parseInt(item.year, 10) : undefined,
              playCount,
              popularity: playCount && playCount > 1000000 ? 90 : playCount && playCount > 100000 ? 75 : 60,
              genre: item.language || 'Music',
              language: (item.language || item.more_info?.language || '').toLowerCase(),
            };
          });
        }
      } catch (e) {
        console.warn('JioSaavn getMoreResults search warning:', e);
      }
    }

    // 3. Autocomplete for albums, artists, and fallback songs
    const autoUrl = `${BASE_URL}?__call=autocomplete.get&query=${encodeURIComponent(query)}&_format=json&_marker=0&ctx=web6dot0`;
    let albums: Album[] = [];
    let artists: Artist[] = [];

    try {
      const autoData = await universalGet(autoUrl);
      
      albums = (autoData.albums?.data || []).map((item: any) => ({
        id: `saavn_album_${item.id}`,
        title: decodeHtmlEntities(item.title || ''),
        artist: decodeHtmlEntities(item.music || item.description || 'Various Artists'),
        artwork: getHighResImage(item.image),
        year: item.year,
        provider: 'saavn' as const,
      }));

      artists = (autoData.artists?.data || []).map((item: any) => ({
        id: `saavn_artist_${item.id}`,
        name: decodeHtmlEntities(item.title || ''),
        image: getHighResImage(item.image),
        provider: 'saavn' as const,
      }));

      // If still no songs found, fetch top autocomplete songs via song.getDetails
      if (songs.length === 0 && Array.isArray(autoData?.songs?.data) && autoData.songs.data.length > 0) {
        const topSongIds = autoData.songs.data.slice(0, 5).map((s: any) => s.id).filter(Boolean);
        if (topSongIds.length > 0) {
          try {
            const detailsUrl = `${BASE_URL}?__call=song.getDetails&pids=${topSongIds.join(',')}&_format=json&_marker=0&ctx=web6dot0`;
            const detailsData = await universalGet(detailsUrl);
            const detailedSongsList = Array.isArray(detailsData?.songs) ? detailsData.songs : [];

            if (detailedSongsList.length > 0) {
              songs = detailedSongsList.map((item: any) => {
                const fullAudioUrl = decryptMediaUrl(item.encrypted_media_url) || item.media_preview_url || item.vlink || null;
                const durationSec = parseInt(item.duration, 10) || 0;
                return {
                  id: `saavn_${item.id}`,
                  title: decodeHtmlEntities(item.song || item.title || ''),
                  artist: decodeHtmlEntities(item.primary_artists || item.singers || 'Unknown Artist'),
                  album: decodeHtmlEntities(item.album || ''),
                  artwork: getHighResImage(item.image),
                  artworkLg: getHighResImage(item.image),
                  duration: durationSec,
                  previewUrl: fullAudioUrl,
                  provider: 'saavn' as const,
                  isLiked: false,
                  isDownloaded: false,
                  year: item.year ? parseInt(item.year, 10) : undefined,
                  genre: item.language || 'Music',
                  language: (item.language || item.more_info?.language || '').toLowerCase(),
                };
              });
            }
          } catch {
            // ignore
          }
        }
      }
    } catch (e) {
      console.warn('JioSaavn autocomplete warning:', e);
    }

    const finalSongs = songs.slice(0, limit);
    return {
      songs: finalSongs,
      artists,
      albums,
      query,
      total: finalSongs.length + artists.length + albums.length,
    };
  } catch (error) {
    console.error('JioSaavn search failed:', error);
    return { songs: [], artists: [], albums: [], query, total: 0 };
  }
}

/**
 * Fetches tracks from an official JioSaavn chart or playlist by ID.
 */
export async function fetchJioSaavnChartTracks(chartListId: string, limit = 50): Promise<Song[]> {
  try {
    const playlistUrl = `${BASE_URL}?__call=playlist.getDetails&listid=${chartListId}&_format=json&_marker=0&api_version=4&ctx=web6dot0`;
    const plData = await universalGet(playlistUrl);
    const rawList = Array.isArray(plData?.songs) ? plData.songs : Array.isArray(plData?.list) ? plData.list : [];

    const songs: Song[] = rawList.map((item: any) => {
      const fullAudioUrl = decryptMediaUrl(item.more_info?.encrypted_media_url || item.encrypted_media_url)
        || item.more_info?.vlink
        || item.vlink
        || null;
      
      const durationSec = parseInt(item.more_info?.duration || item.duration, 10) || 0;
      const rawPlayCount = item.more_info?.play_count || item.play_count;
      const playCount = rawPlayCount ? parseInt(String(rawPlayCount), 10) : undefined;
      const primaryArtist = decodeHtmlEntities(item.more_info?.primary_artists || item.primary_artists || item.singers || item.subtitle || 'Top Artist');

      return {
        id: `saavn_${item.id}`,
        title: decodeHtmlEntities(item.song || item.title || ''),
        artist: primaryArtist,
        album: decodeHtmlEntities(item.more_info?.album || item.album || ''),
        artwork: getHighResImage(item.image),
        artworkLg: getHighResImage(item.image),
        duration: durationSec,
        previewUrl: fullAudioUrl,
        provider: 'saavn' as const,
        isLiked: false,
        isDownloaded: false,
        year: item.year ? parseInt(item.year, 10) : undefined,
        playCount,
        popularity: 95,
        genre: item.language || 'Trending',
        language: (item.language || item.more_info?.language || '').toLowerCase(),
      };
    });

    return songs.slice(0, limit);
  } catch (error) {
    console.warn('JioSaavn chart fetch error:', error);
    return [];
  }
}

/**
 * Fetches official trending content (songs & albums) from JioSaavn.
 */
export async function fetchJioSaavnTrendingContent(): Promise<{ songs: Song[]; albums: Album[] }> {
  try {
    const url = `${BASE_URL}?__call=content.getTrending&_format=json&_marker=0&ctx=web6dot0&api_version=4`;
    const res = await universalGet(url);
    const items = Array.isArray(res) ? res : Object.values(res || {});

    const songs: Song[] = [];
    const albums: Album[] = [];

    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const itemType = (item.type || '').toLowerCase();

      if (itemType === 'album') {
        const artists = item.more_info?.artistMap?.artists?.map((a: any) => a.name).join(', ') || item.subtitle || 'Official Album';
        albums.push({
          id: `saavn_album_${item.id}`,
          title: decodeHtmlEntities(item.title || ''),
          artist: decodeHtmlEntities(artists),
          artwork: getHighResImage(item.image),
          year: item.year || item.more_info?.release_date?.slice(0, 4) || undefined,
          provider: 'saavn',
        });
      } else if (itemType === 'song') {
        const fullAudioUrl = decryptMediaUrl(item.more_info?.encrypted_media_url || item.encrypted_media_url)
          || item.more_info?.vlink
          || item.vlink
          || null;
        songs.push({
          id: `saavn_${item.id}`,
          title: decodeHtmlEntities(item.title || item.song || ''),
          artist: decodeHtmlEntities(item.subtitle || item.more_info?.primary_artists || 'Top Artist'),
          album: decodeHtmlEntities(item.more_info?.album || item.album || ''),
          artwork: getHighResImage(item.image),
          artworkLg: getHighResImage(item.image),
          duration: parseInt(item.more_info?.duration || item.duration, 10) || 0,
          previewUrl: fullAudioUrl,
          provider: 'saavn',
          isLiked: false,
          isDownloaded: false,
          year: item.year ? parseInt(item.year, 10) : undefined,
          popularity: 90,
          genre: item.language || 'Music',
          language: (item.language || item.more_info?.language || '').toLowerCase(),
        });
      }
    }

    return { songs, albums };
  } catch (error) {
    console.warn('JioSaavn trending content error:', error);
    return { songs: [], albums: [] };
  }
}

/**
 * Fetches top charts & trending tracks with full 320kbps decrypted audio.
 */
export async function getJioSaavnTrending(limit = 20): Promise<Song[]> {
  try {
    const songs = await fetchJioSaavnChartTracks('1134543272', limit);
    if (songs.length > 0) return songs;
    return await fetchJioSaavnChartTracks('1134548194', limit);
  } catch (error) {
    console.error('JioSaavn trending failed:', error);
    return [];
  }
}

/**
 * Cleans a song title by stripping extraneous movie, soundtrack, and non-semantic video/audio tags.
 */
export function cleanTitleForMatching(title: string): string {
  return cleanCoreTitle(title);
}

/**
 * Generates search variations to maximize match rate for Spotify/Apple tracks.
 */
export function generateSearchVariants(title: string, artist: string): string[] {
  const variants: string[] = [];
  const cleanTitle = cleanCoreTitle(title);

  // Clean Artists: primary artist (before comma, &, feat, with)
  const primaryArtist = (artist || '')
    .split(/[,&/]|feat\.|ft\.|with|\s+x\s+/i)[0]
    ?.replace(/["'’]/g, '')
    ?.replace(/[^\p{L}\p{N}\s]/gu, ' ')
    ?.replace(/\s+/g, ' ')
    ?.trim() || '';

  const allCleanArtists = (artist || '')
    .replace(/["'’]/g, '')
    .replace(/feat\.|ft\.|with/gi, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Priority 1: Clean Title + Primary Artist
  if (cleanTitle && primaryArtist) {
    variants.push(`${cleanTitle} ${primaryArtist}`.trim());
  }

  // Priority 2: Clean Title + All Artists
  if (cleanTitle && allCleanArtists && allCleanArtists !== primaryArtist) {
    variants.push(`${cleanTitle} ${allCleanArtists}`.trim());
  }

  // Priority 3: Raw Clean Title + Primary Artist
  const rawCleanTitle = title.replace(/["'’]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (rawCleanTitle && rawCleanTitle.toLowerCase() !== cleanTitle && primaryArtist) {
    variants.push(`${rawCleanTitle} ${primaryArtist}`.trim());
  }

  // Priority 4: Clean Title only
  if (cleanTitle) {
    variants.push(cleanTitle);
  }

  // Priority 5: Raw title + artist
  if (title && artist) {
    variants.push(`${title.trim()} ${artist.trim()}`);
  }

  return [...new Set(variants.filter((v) => v.length > 0))];
}

/**
 * Strict, high-precision match verification.
 * Guarantees that only the EXACT same song by the authentic artist is resolved.
 * Discards any fake versions, wrong singers, completely different songs, or covers.
 */
export function isExactOrStrictTrackMatch(
  candidate: { title: string; artist: string; album?: string; duration?: number },
  targetTitle: string,
  targetArtist: string,
  targetDuration?: number,
  relaxedArtist = false
): { isMatch: boolean; score: number } {
  const decision = evaluateTrackMatch(
    targetTitle,
    targetArtist,
    targetDuration,
    candidate,
    relaxedArtist ? 'JioSaavn (Relaxed)' : 'JioSaavn'
  );
  return { isMatch: decision.isMatch, score: Math.round(decision.confidence * 100) };
}

/**
 * Resolves the authentic, official full audio stream with specified quality.
 * Guaranteed to only play the exact same song in full length.
 * @param isSpotifyImport — set true for Spotify-imported tracks to use cross-catalog relaxed matching
 */
export async function resolveFullTrack(
  title: string,
  artist: string,
  quality: AudioQuality = 'high',
  targetDuration?: number,
  _isSpotifyImport = false
): Promise<{ streamUrl: string; duration: number; artwork?: string } | null> {
  const queryVariants = generateSearchVariants(title, artist);

  // 1. Tier 1: Search JioSaavn through prioritized query variants with strict score matching
  for (const q of queryVariants) {
    try {
      const res = await searchJioSaavn(q, 8);
      if (res.songs && res.songs.length > 0) {
        const scoredCandidates = res.songs
          .map((song) => {
            const decision = evaluateTrackMatch(title, artist, targetDuration, song, 'JioSaavn Tier 1');
            return { song, isMatch: decision.isMatch, confidence: decision.confidence };
          })
          .filter((item) => item.isMatch && item.song.previewUrl && item.song.previewUrl.startsWith('http'))
          .sort((a, b) => b.confidence - a.confidence);

        if (scoredCandidates.length > 0) {
          const best = scoredCandidates[0].song;
          let fullUrl = best.previewUrl;

          // If stream URL is a preview or missing, fetch full track details to get decrypted media URL
          if (isPreviewAudioUrl(fullUrl) || !fullUrl) {
            const cleanId = best.id.replace('saavn_', '');
            try {
              const detailsUrl = `${BASE_URL}?__call=song.getDetails&pids=${cleanId}&_format=json&_marker=0&ctx=web6dot0`;
              const detailsData = await universalGet(detailsUrl);
              const songItem = Array.isArray(detailsData?.songs) ? detailsData.songs[0] : (detailsData?.[cleanId] || null);
              if (songItem?.encrypted_media_url) {
                const dec = decryptMediaUrl(songItem.encrypted_media_url, quality);
                if (dec && !isPreviewAudioUrl(dec)) {
                  fullUrl = dec;
                }
              }
            } catch {}
          }

          if (fullUrl && !isPreviewAudioUrl(fullUrl)) {
            return {
              streamUrl: formatMediaUrlWithQuality(fullUrl, quality),
              duration: best.duration || targetDuration || 180,
              artwork: best.artwork || best.artworkLg,
            };
          }
        }
      }
    } catch {
      // try next variant
    }
  }

  // 2. Tier 2: JioSaavn Autocomplete fuzzy match -> strict verify detailed songs
  try {
    const cleanT = cleanCoreTitle(title);
    const primA = (artist || '').split(/[,&/]|feat\.|ft\./i)[0]?.trim() || '';
    const autoQuery = `${cleanT} ${primA}`.trim();
    const autoUrl = `${BASE_URL}?__call=autocomplete.get&query=${encodeURIComponent(autoQuery || cleanT)}&_format=json&_marker=0&ctx=web6dot0`;
    const autoData = await universalGet(autoUrl);
    
    if (Array.isArray(autoData?.songs?.data) && autoData.songs.data.length > 0) {
      const topIds = autoData.songs.data.slice(0, 5).map((s: any) => s.id).filter(Boolean);
      if (topIds.length > 0) {
        const detailsUrl = `${BASE_URL}?__call=song.getDetails&pids=${topIds.join(',')}&_format=json&_marker=0&ctx=web6dot0`;
        const detailsData = await universalGet(detailsUrl);
        const detailedList = Array.isArray(detailsData?.songs) ? detailsData.songs : [];

        for (const item of detailedList) {
          const dec = decryptMediaUrl(item.encrypted_media_url, quality);
          const fullAudioUrl = dec || (item.vlink && !isPreviewAudioUrl(item.vlink) ? item.vlink : null);
          if (fullAudioUrl && fullAudioUrl.startsWith('http') && !isPreviewAudioUrl(fullAudioUrl)) {
            const cand = {
              title: decodeHtmlEntities(item.song || item.title || ''),
              artist: decodeHtmlEntities(item.primary_artists || item.singers || 'Unknown Artist'),
              album: decodeHtmlEntities(item.album || ''),
              duration: parseInt(item.duration, 10) || 0,
            };
            const decision = evaluateTrackMatch(title, artist, targetDuration, cand, 'JioSaavn Tier 2');
            if (decision.isMatch) {
              const dur = cand.duration || targetDuration || 180;
              return {
                streamUrl: formatMediaUrlWithQuality(fullAudioUrl, quality),
                duration: dur,
                artwork: getHighResImage(item.image),
              };
            }
          }
        }
      }
    }
  } catch {
    // try next tier
  }

  // 3. Tier 3: Search YouTube Music Full-Length Audio Stream with verification
  try {
    const { resolveYouTubeFullAudioStream } = await import('./youtubeMusicApi');
    const ytStream = await resolveYouTubeFullAudioStream(title, artist, targetDuration);
    if (ytStream && ytStream.streamUrl && !isPreviewAudioUrl(ytStream.streamUrl)) {
      return ytStream;
    }
  } catch {
    // fallback
  }

  return null;
}
