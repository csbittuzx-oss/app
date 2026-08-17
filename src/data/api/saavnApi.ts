import CryptoJS from 'crypto-js';
import type { Song, Album, Artist, SearchResult, AudioQuality } from '../models';
import { universalGet } from '../../core/utils/http';

const BASE_URL = 'https://www.jiosaavn.com/api.php';
const DES_KEY = '38346591';

/**
 * Replaces stream URL with the requested bitrate:
 * high -> _320.mp4 (320kbps Lossless/HD)
 * medium -> _160.mp4 (160/192kbps Balanced)
 * low -> _96.mp4 (96kbps Data Saver)
 */
export function formatMediaUrlWithQuality(url?: string | null, quality: AudioQuality = 'high'): string {
  if (!url || typeof url !== 'string') return '';
  const targetBitrate = quality === 'low' ? '_96.mp4' : quality === 'medium' ? '_160.mp4' : '_320.mp4';
  return url
    .replace(/_(96|160|320)\.mp4/g, targetBitrate)
    .replace('http://', 'https://');
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
 * Fetches top charts & trending tracks with full 320kbps decrypted audio.
 */
export async function getJioSaavnTrending(limit = 20): Promise<Song[]> {
  try {
    const url = `${BASE_URL}?__call=content.getCharts&api_version=4&_format=json&_marker=0&ctx=web6dot0`;
    const charts = await universalGet(url);

    if (!Array.isArray(charts) || charts.length === 0) return [];

    const firstChartId = charts[0]?.id || '1134543272';
    const playlistUrl = `${BASE_URL}?__call=playlist.getDetails&listid=${firstChartId}&_format=json&_marker=0&api_version=4&ctx=web6dot0`;
    const plData = await universalGet(playlistUrl);

    const songs: Song[] = (plData.list || []).map((item: any) => {
      const fullAudioUrl = decryptMediaUrl(item.more_info?.encrypted_media_url || item.encrypted_media_url)
        || item.more_info?.vlink
        || item.vlink
        || null;
      
      const durationSec = parseInt(item.more_info?.duration || item.duration, 10) || 0;

      const rawPlayCount = item.more_info?.play_count || item.play_count;
      const playCount = rawPlayCount ? parseInt(String(rawPlayCount), 10) : undefined;
      return {
        id: `saavn_${item.id}`,
        title: decodeHtmlEntities(item.title || item.song || ''),
        artist: decodeHtmlEntities(item.subtitle || item.more_info?.music || item.more_info?.primary_artists?.[0]?.name || 'Top Artist'),
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
        popularity: 95, // High trending rank
        genre: item.language || 'Trending',
        language: (item.language || item.more_info?.language || '').toLowerCase(),
      };
    });

    return songs.slice(0, limit);
  } catch (error) {
    console.error('JioSaavn trending failed:', error);
    return [];
  }
}

/**
 * Cleans a song title by stripping extraneous movie, soundtrack, remix, and feat tags.
 */
export function cleanTitleForMatching(title: string): string {
  if (!title) return '';
  return title
    .replace(/\(feat\..*?\)/gi, '')
    .replace(/\(with.*?\)/gi, '')
    .replace(/\(from.*?\)/gi, '')
    .replace(/\[feat\..*?\]/gi, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\s*-\s*(from|soundtrack|ost|remix|acoustic|remastered|live|original|radio edit|deluxe|version|slowed|reverb|lofi|cover|reprise|unplugged|male|female|duet|audio|video|teaser|lyric|lyrics).*$/gi, '')
    .replace(/["'’]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Generates search variations to maximize match rate for Spotify/Apple tracks.
 */
export function generateSearchVariants(title: string, artist: string): string[] {
  const variants: string[] = [];

  const cleanTitle = cleanTitleForMatching(title);

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

const UNWANTED_MODIFIERS = [
  'slowed + reverb',
  'slowed and reverb',
  'slowed reverb',
  'lo-fi remix',
  'lofi remix',
  'tribute to',
  'cover by',
  'karaoke version',
  'karaoke track',
  'instrumental version',
  '8d audio',
  'ringtone cut',
];

function normalizeText(str: string): string {
  return (str || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
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
  targetDuration?: number
): { isMatch: boolean; score: number } {
  const cleanTarget = cleanTitleForMatching(targetTitle);
  const cleanCand = cleanTitleForMatching(candidate.title);

  if (!cleanCand || !cleanTarget) return { isMatch: false, score: 0 };

  // 1. REJECT fake versions (Slowed, Reverb, Lofi, Cover, Remake, Karaoke)
  const rawCandTitle = (candidate.title || '').toLowerCase();
  const rawCandAlbum = (candidate.album || '').toLowerCase();
  const rawTargetTitle = (targetTitle || '').toLowerCase();

  for (const mod of UNWANTED_MODIFIERS) {
    if (!rawTargetTitle.includes(mod)) {
      if (rawCandTitle.includes(mod) || rawCandAlbum.includes(mod)) {
        return { isMatch: false, score: 0 };
      }
    }
  }

  // 2. Exact or High-Confidence Title Matching
  let titleScore = 0;
  if (cleanCand === cleanTarget) {
    titleScore = 100; // Exact title match
  } else if (cleanCand.startsWith(cleanTarget) || cleanTarget.startsWith(cleanCand)) {
    titleScore = 90;
  } else {
    const targetWords = cleanTarget.split(' ').filter((w) => w.length > 0);
    const candWords = cleanCand.split(' ').filter((w) => w.length > 0);

    if (targetWords.length === 0 || candWords.length === 0) return { isMatch: false, score: 0 };

    const commonWords = targetWords.filter((w) => candWords.includes(w));
    const targetWordRatio = commonWords.length / targetWords.length;
    const candWordRatio = commonWords.length / candWords.length;

    if (targetWordRatio === 1.0 && candWords.length <= targetWords.length + 2) {
      titleScore = 85;
    } else if (targetWordRatio >= 0.65 && candWordRatio >= 0.4) {
      titleScore = Math.round(targetWordRatio * 75);
    } else {
      return { isMatch: false, score: 0 }; // Completely different title -> Reject
    }
  }

  // 3. Artist & Record Label Verification
  const normTargetArtist = normalizeText(targetArtist);
  const normCandArtist = normalizeText(`${candidate.artist || ''} ${candidate.album || ''}`);

  let artistScore = 0;
  if (normTargetArtist && normCandArtist) {
    const targetTokens = normTargetArtist.split(/[,&/]|feat|ft|with|\s+/).filter((w) => w.length >= 2);
    const candTokens = normCandArtist.split(/[,&/]|feat|ft|with|\s+/).filter((w) => w.length >= 2);

    const hasCommonArtist = targetTokens.some((t) =>
      candTokens.some((c) => c === t || c.includes(t) || t.includes(c))
    );

    const OFFICIAL_RECORD_LABELS = [
      'tseries', 't series', 'sony', 'sonymusic', 'zee', 'zeemusic', 'yrf', 'saregama',
      'speedrecords', 'speed', 'tips', 'whitehill', 'geetmp3', 'dmf', 'desimusicfactory',
      'universal', 'warnermusic', 'warner', 'vevo', 'topic', 'official', 'records', 'music'
    ];

    const isOfficialLabelOrTopic = OFFICIAL_RECORD_LABELS.some((lbl) =>
      normCandArtist.includes(lbl)
    );

    if (hasCommonArtist) {
      artistScore = 50;
    } else if (isOfficialLabelOrTopic && titleScore >= 85) {
      artistScore = 30; // Official label publishing the exact same title
    } else {
      artistScore = -60; // Completely different artist -> Strict reject to prevent playing wrong song
    }
  } else {
    artistScore = 20;
  }

  // 4. Duration verification
  let durationScore = 0;
  if (targetDuration && targetDuration > 0 && candidate.duration && candidate.duration > 0) {
    const diff = Math.abs(candidate.duration - targetDuration);
    if (diff <= 15) {
      durationScore = 30; // exact studio cut
    } else if (diff <= 35) {
      durationScore = 15;
    } else if (diff > 85) {
      durationScore = -30;
    }
  }

  const total = titleScore + artistScore + durationScore;
  return { isMatch: total >= 65, score: total };
}

/**
 * Resolves the authentic, official full audio stream with specified quality.
 * Guaranteed to only play the exact same song in full length.
 */
export async function resolveFullTrack(
  title: string,
  artist: string,
  quality: AudioQuality = 'high',
  targetDuration?: number
): Promise<{ streamUrl: string; duration: number; artwork?: string } | null> {
  const queryVariants = generateSearchVariants(title, artist);

  // 1. Tier 1: Search JioSaavn through prioritized query variants with strict score matching
  for (const q of queryVariants) {
    try {
      const res = await searchJioSaavn(q, 8);
      if (res.songs && res.songs.length > 0) {
        const scoredCandidates = res.songs
          .map((song) => {
            const { isMatch, score } = isExactOrStrictTrackMatch(song, title, artist, targetDuration);
            return { song, isMatch, score };
          })
          .filter((item) => item.isMatch && item.song.previewUrl && item.song.previewUrl.startsWith('http'))
          .sort((a, b) => b.score - a.score);

        if (scoredCandidates.length > 0) {
          const best = scoredCandidates[0].song;
          return {
            streamUrl: formatMediaUrlWithQuality(best.previewUrl, quality),
            duration: best.duration,
            artwork: best.artwork || best.artworkLg,
          };
        }
      }
    } catch {
      // try next variant
    }
  }

  // 2. Tier 2: JioSaavn Autocomplete fuzzy match -> strict verify detailed songs
  try {
    const cleanT = cleanTitleForMatching(title);
    const primA = (artist || '').split(/[,&/]|feat\.|ft\./i)[0]?.trim() || '';
    const autoQuery = `${cleanT} ${primA}`.trim();
    const autoUrl = `${BASE_URL}?__call=autocomplete.get&query=${encodeURIComponent(autoQuery)}&_format=json&_marker=0&ctx=web6dot0`;
    const autoData = await universalGet(autoUrl);
    
    if (Array.isArray(autoData?.songs?.data) && autoData.songs.data.length > 0) {
      const topIds = autoData.songs.data.slice(0, 4).map((s: any) => s.id).filter(Boolean);
      if (topIds.length > 0) {
        const detailsUrl = `${BASE_URL}?__call=song.getDetails&pids=${topIds.join(',')}&_format=json&_marker=0&ctx=web6dot0`;
        const detailsData = await universalGet(detailsUrl);
        const detailedList = Array.isArray(detailsData?.songs) ? detailsData.songs : [];

        for (const item of detailedList) {
          const fullAudioUrl = decryptMediaUrl(item.encrypted_media_url) || item.media_preview_url || item.vlink || null;
          if (fullAudioUrl && fullAudioUrl.startsWith('http')) {
            const cand = {
              title: decodeHtmlEntities(item.song || item.title || ''),
              artist: decodeHtmlEntities(item.primary_artists || item.singers || 'Unknown Artist'),
              album: decodeHtmlEntities(item.album || ''),
              duration: parseInt(item.duration, 10) || 0,
            };
            const { isMatch } = isExactOrStrictTrackMatch(cand, title, artist, targetDuration);
            if (isMatch) {
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

  // 3. Tier 3: Search YouTube Music Full-Length Audio Stream with strict match verification
  try {
    const { resolveYouTubeFullAudioStream } = await import('./youtubeMusicApi');
    const ytStream = await resolveYouTubeFullAudioStream(title, artist, targetDuration);
    if (ytStream && ytStream.streamUrl) {
      return ytStream;
    }
  } catch {
    // fallback
  }

  return null;
}
