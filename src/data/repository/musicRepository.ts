// ═══════════════════════════════════════════
//  Music Repository
//  Multi-provider: YouTube Music → JioSaavn (320kbps) → Jamendo → iTunes
// ═══════════════════════════════════════════

import type { Song, Artist, Album, SearchResult } from '../models';
import { searchYouTubeMusic, getYouTubeMusicTrending } from '../api/youtubeMusicApi';
import { searchJioSaavn, getJioSaavnTrending } from '../api/saavnApi';
import { searchItunes, getItunesAlbumTracks, getItunesTopCharts, searchItunesArtist } from '../api/itunesApi';
import { searchJamendo, getJamendoFeatured, getJamendoNewReleases, getJamendoByGenre, getJamendoAlbumTracks } from '../api/jamendoApi';
import { getLastfmArtist, getSimilarArtists, getLastfmTopArtists } from '../api/lastfmApi';
import { CONFIG } from '../../config';

// Simple in-memory cache
const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function fromCache<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { cache.delete(key); return null; }
  return entry.data as T;
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, ts: Date.now() });
}

// ─── Search ──────────────────────────────────────────────────────────────────

export async function searchMusic(query: string, limit = 20): Promise<SearchResult> {
  const cacheKey = `search_${query}_${limit}`;
  const cached = fromCache<SearchResult>(cacheKey);
  if (cached) return cached;

  const hasJamendo = Boolean(CONFIG.JAMENDO_CLIENT_ID);
  
  // Run YouTube Music (primary), JioSaavn (full tracks), iTunes, and Jamendo in parallel
  const [ytResult, saavnResult, itunesResult, jamendoResult] = await Promise.allSettled([
    searchYouTubeMusic(query, limit),
    searchJioSaavn(query, limit),
    searchItunes(query, limit),
    hasJamendo ? searchJamendo(query, limit) : Promise.resolve({ songs: [], artists: [], albums: [] }),
  ]);

  const yt = ytResult.status === 'fulfilled' ? ytResult.value : { songs: [], artists: [], albums: [] };
  const saavn = saavnResult.status === 'fulfilled' ? saavnResult.value : { songs: [], artists: [], albums: [] };
  const itunes = itunesResult.status === 'fulfilled' ? itunesResult.value : { songs: [], artists: [], albums: [] };
  const jamendo = jamendoResult.status === 'fulfilled' ? jamendoResult.value : { songs: [], artists: [], albums: [] };

  // Priority order: YouTube Music -> JioSaavn (320kbps full tracks) -> Jamendo -> iTunes
  const allSongs = deduplicateSongs([...yt.songs, ...saavn.songs, ...jamendo.songs, ...itunes.songs]).slice(0, limit * 2);
  const allArtists = deduplicateArtists([...yt.artists, ...saavn.artists, ...itunes.artists, ...jamendo.artists]).slice(0, 12);
  const allAlbums = deduplicateAlbums([...yt.albums, ...saavn.albums, ...itunes.albums, ...jamendo.albums]).slice(0, 12);

  const result: SearchResult = {
    songs: allSongs,
    artists: allArtists,
    albums: allAlbums,
    query,
    total: allSongs.length + allArtists.length + allAlbums.length,
  };
  setCache(cacheKey, result);
  return result;
}

// ─── Featured / Home Content ─────────────────────────────────────────────────

export async function getFeaturedTracks(limit = 20): Promise<Song[]> {
  const cacheKey = `featured_${limit}`;
  const cached = fromCache<Song[]>(cacheKey);
  if (cached) return cached;

  const hasJamendo = Boolean(CONFIG.JAMENDO_CLIENT_ID);
  
  const [ytTrending, saavnTrending, jamendoFeatured, itunesCharts] = await Promise.allSettled([
    getYouTubeMusicTrending(limit),
    getJioSaavnTrending(limit),
    hasJamendo ? getJamendoFeatured(limit) : Promise.resolve([]),
    getItunesTopCharts('all', limit),
  ]);

  const ytSongs = ytTrending.status === 'fulfilled' ? ytTrending.value : [];
  const sSongs = saavnTrending.status === 'fulfilled' ? saavnTrending.value : [];
  const jamSongs = jamendoFeatured.status === 'fulfilled' ? jamendoFeatured.value : [];
  const itSongs = itunesCharts.status === 'fulfilled' ? itunesCharts.value : [];

  const songs = deduplicateSongs([...ytSongs, ...sSongs, ...jamSongs, ...itSongs]).slice(0, limit);
  setCache(cacheKey, songs);
  return songs;
}

export async function getNewReleases(limit = 20): Promise<Song[]> {
  const cacheKey = `new_releases_${limit}`;
  const cached = fromCache<Song[]>(cacheKey);
  if (cached) return cached;

  const hasJamendo = Boolean(CONFIG.JAMENDO_CLIENT_ID);
  const [ytRes, saavnRes, jamendoRes, itunesRes] = await Promise.allSettled([
    searchYouTubeMusic('Latest Music 2025 2026', limit),
    searchJioSaavn('2025 2026 Hits', limit),
    hasJamendo ? getJamendoNewReleases(limit) : Promise.resolve([]),
    searchItunes('2025', limit).then((r) => r.songs).catch(() => []),
  ]);

  const ytSongs = ytRes.status === 'fulfilled' ? ytRes.value.songs : [];
  const sSongs = saavnRes.status === 'fulfilled' ? saavnRes.value.songs : [];
  const jamSongs = jamendoRes.status === 'fulfilled' ? jamendoRes.value : [];
  const itSongs = itunesRes.status === 'fulfilled' ? itunesRes.value : [];

  const songs = deduplicateSongs([...ytSongs, ...sSongs, ...jamSongs, ...itSongs]).slice(0, limit);
  setCache(cacheKey, songs);
  return songs;
}

export async function getSongsByGenre(genre: string, limit = 20): Promise<Song[]> {
  const cacheKey = `genre_${genre}_${limit}`;
  const cached = fromCache<Song[]>(cacheKey);
  if (cached) return cached;

  const hasJamendo = Boolean(CONFIG.JAMENDO_CLIENT_ID);
  const [ytRes, saavnRes, jamendoRes, itunesRes] = await Promise.allSettled([
    searchYouTubeMusic(`${genre} hits`, limit),
    searchJioSaavn(genre, limit),
    hasJamendo ? getJamendoByGenre(genre, limit) : Promise.resolve([]),
    searchItunes(genre, limit).then((r) => r.songs).catch(() => []),
  ]);

  const ytSongs = ytRes.status === 'fulfilled' ? ytRes.value.songs : [];
  const sSongs = saavnRes.status === 'fulfilled' ? saavnRes.value.songs : [];
  const jamSongs = jamendoRes.status === 'fulfilled' ? jamendoRes.value : [];
  const itSongs = itunesRes.status === 'fulfilled' ? itunesRes.value : [];

  const songs = deduplicateSongs([...ytSongs, ...sSongs, ...jamSongs, ...itSongs]).slice(0, limit);
  setCache(cacheKey, songs);
  return songs;
}

// ─── AI-Powered Personalized Recommendations ─────────────────────────────────

export const LANGUAGE_METADATA: Record<string, { query: string; title: string; artists: string[] }> = {
  Hindi: {
    query: 'Latest Bollywood Hindi Hits 2025',
    title: 'Top Hindi Hits',
    artists: ['Arijit Singh', 'Shreya Ghoshal', 'Pritam', 'A.R. Rahman', 'Vishal Mishra'],
  },
  International: {
    query: 'Global Pop Hits Billboard Top 2025',
    title: 'International Hits',
    artists: ['The Weeknd', 'Taylor Swift', 'Dua Lipa', 'Bruno Mars', 'Ed Sheeran'],
  },
  Punjabi: {
    query: 'Trending Punjabi Hits 2025',
    title: 'Punjabi Chartbusters',
    artists: ['Diljit Dosanjh', 'Karan Aujla', 'AP Dhillon', 'Sidhu Moose Wala', 'Shubh'],
  },
  Tamil: {
    query: 'Kollywood Tamil Top Hits 2025',
    title: 'Tamil Hits',
    artists: ['Anirudh Ravichander', 'A.R. Rahman', 'Sid Sriram', 'Yuvan Shankar Raja'],
  },
  Telugu: {
    query: 'Tollywood Telugu Top Hits 2025',
    title: 'Telugu Hits',
    artists: ['Thaman S', 'Devi Sri Prasad', 'Sid Sriram', 'Anirudh Ravichander'],
  },
  Malayalam: {
    query: 'Mollywood Malayalam Top Hits 2025',
    title: 'Malayalam Melodies',
    artists: ['Sushin Shyam', 'Hesham Abdul Wahab', 'K.S. Harisankar', 'Job Kurian'],
  },
  Marathi: {
    query: 'Latest Marathi Hits 2025',
    title: 'Marathi Beats',
    artists: ['Ajay-Atul', 'Swapnil Bandodkar', 'Adarsh Shinde'],
  },
  Gujarati: {
    query: 'Top Gujarati Hits Garba Songs 2025',
    title: 'Gujarati Favorites',
    artists: ['Geeta Rabari', 'Kinjal Dave', 'Jignesh Kaviraj'],
  },
  Bengali: {
    query: 'Top Bengali Bangla Hits 2025',
    title: 'Bangla Top Hits',
    artists: ['Arijit Singh', 'Anupam Roy', 'Shreya Ghoshal', 'Jeet Gannguli'],
  },
  Kannada: {
    query: 'Sandalwood Kannada Top Hits 2025',
    title: 'Kannada Hits',
    artists: ['Ravi Basrur', 'Arjun Janya', 'Sanjith Hegde', 'Vijay Prakash'],
  },
  Bhojpuri: {
    query: 'Top Bhojpuri Hits 2025',
    title: 'Bhojpuri Hits',
    artists: ['Khesari Lal Yadav', 'Pawan Singh', 'Pramod Premi Yadav'],
  },
};

export async function getPersonalizedTrending(languages: string[], limit = 20): Promise<Song[]> {
  const cacheKey = `personalized_trending_${languages.join('_')}_${limit}`;
  const cached = fromCache<Song[]>(cacheKey);
  if (cached) return cached;

  const validLangs = languages.length > 0 ? languages : ['Hindi', 'International'];
  const queries = validLangs.map((lang) => `${lang} trending hits 2025 2026`);
  
  // Search JioSaavn trending + YouTube Music for each language
  const searchPromises = queries.map(async (q) => {
    const [sRes, ytRes] = await Promise.allSettled([
      searchJioSaavn(q, Math.ceil(limit / queries.length) + 4),
      searchYouTubeMusic(q, Math.ceil(limit / queries.length) + 4),
    ]);
    const sSongs = sRes.status === 'fulfilled' ? sRes.value.songs : [];
    const ytSongs = ytRes.status === 'fulfilled' ? ytRes.value.songs : [];
    return [...sSongs, ...ytSongs];
  });

  const [generalTrending, ...langResults] = await Promise.all([
    getJioSaavnTrending(10).catch(() => []),
    ...searchPromises,
  ]);

  // Interleave results from user's languages first, then general trending
  const combined: Song[] = [];
  const maxLen = Math.max(...langResults.map(r => r.length), generalTrending.length);
  for (let i = 0; i < maxLen; i++) {
    for (const group of langResults) {
      if (group[i]) combined.push(group[i]);
    }
    if (generalTrending[i]) combined.push(generalTrending[i]);
  }

  const songs = deduplicateSongs(combined).slice(0, limit);
  setCache(cacheKey, songs);
  return songs;
}

export async function getPersonalizedNewReleases(languages: string[], limit = 20): Promise<Song[]> {
  const cacheKey = `personalized_new_${languages.join('_')}_${limit}`;
  const cached = fromCache<Song[]>(cacheKey);
  if (cached) return cached;

  const validLangs = languages.length > 0 ? languages : ['Hindi', 'International'];
  const queries = validLangs.map((lang) => `Latest ${lang} songs 2025 2026`);

  const searchPromises = queries.map(async (q) => {
    const [sRes, ytRes] = await Promise.allSettled([
      searchJioSaavn(q, Math.ceil(limit / queries.length) + 4),
      searchYouTubeMusic(q, Math.ceil(limit / queries.length) + 4),
    ]);
    const sSongs = sRes.status === 'fulfilled' ? sRes.value.songs : [];
    const ytSongs = ytRes.status === 'fulfilled' ? ytRes.value.songs : [];
    return [...sSongs, ...ytSongs];
  });

  const langResults = await Promise.all(searchPromises);

  const combined: Song[] = [];
  const maxLen = Math.max(...langResults.map(r => r.length));
  for (let i = 0; i < maxLen; i++) {
    for (const group of langResults) {
      if (group[i]) combined.push(group[i]);
    }
  }

  const songs = deduplicateSongs(combined).slice(0, limit);
  setCache(cacheKey, songs);
  return songs;
}

export async function getTodaysBiggestHits(languages: string[], limit = 20): Promise<Song[]> {
  const cacheKey = `todays_biggest_hits_${languages.join('_')}_${limit}`;
  const cached = fromCache<Song[]>(cacheKey);
  if (cached) return cached;

  const [top50India, viralIndia, ytHits] = await Promise.allSettled([
    searchJioSaavn('Top 50 India Latest 2025', limit),
    searchJioSaavn('Viral Hits India 2025', limit),
    searchYouTubeMusic('Top Music India Chartbusters 2025', limit),
  ]);

  const s1 = top50India.status === 'fulfilled' ? top50India.value.songs : [];
  const s2 = viralIndia.status === 'fulfilled' ? viralIndia.value.songs : [];
  const yt = ytHits.status === 'fulfilled' ? ytHits.value.songs : [];

  const allSongs = deduplicateSongs([...s1, ...s2, ...yt]);

  // If user selected specific languages, boost matching tracks to front
  const validLangs = languages.map(l => l.toLowerCase());
  const prioritized = allSongs.sort((a, b) => {
    const aMatch = validLangs.some(l => a.title.toLowerCase().includes(l) || a.artist.toLowerCase().includes(l) || (a.album && a.album.toLowerCase().includes(l)));
    const bMatch = validLangs.some(l => b.title.toLowerCase().includes(l) || b.artist.toLowerCase().includes(l) || (b.album && b.album.toLowerCase().includes(l)));
    if (aMatch && !bMatch) return -1;
    if (!aMatch && bMatch) return 1;
    return 0;
  });

  const result = prioritized.slice(0, limit);
  setCache(cacheKey, result);
  return result;
}

export async function getIndiasBest(languages: string[], limit = 20): Promise<Song[]> {
  const cacheKey = `indias_best_${languages.join('_')}_${limit}`;
  const cached = fromCache<Song[]>(cacheKey);
  if (cached) return cached;

  const validLangs = languages.length > 0 ? languages : ['Hindi', 'Tamil', 'Telugu', 'Punjabi'];
  const queries = validLangs.map((lang) => `Best of ${lang} all time hits`);

  const searchPromises = queries.map(async (q) => {
    const [sRes, ytRes] = await Promise.allSettled([
      searchJioSaavn(q, Math.ceil(limit / queries.length) + 4),
      searchYouTubeMusic(q, Math.ceil(limit / queries.length) + 4),
    ]);
    const sSongs = sRes.status === 'fulfilled' ? sRes.value.songs : [];
    const ytSongs = ytRes.status === 'fulfilled' ? ytRes.value.songs : [];
    return [...sSongs, ...ytSongs];
  });

  const langResults = await Promise.all(searchPromises);

  const combined: Song[] = [];
  const maxLen = Math.max(...langResults.map(r => r.length));
  for (let i = 0; i < maxLen; i++) {
    for (const group of langResults) {
      if (group[i]) combined.push(group[i]);
    }
  }

  const songs = deduplicateSongs(combined).slice(0, limit);
  setCache(cacheKey, songs);
  return songs;
}

export async function getPersonalizedTracksByLanguage(language: string, limit = 16): Promise<Song[]> {
  const meta = LANGUAGE_METADATA[language] || { query: `${language} top hits`, title: `${language} Hits` };
  const cacheKey = `lang_tracks_${language}_${limit}`;
  const cached = fromCache<Song[]>(cacheKey);
  if (cached) return cached;

  const [saavnRes, ytRes] = await Promise.allSettled([
    searchJioSaavn(meta.query, limit),
    searchYouTubeMusic(meta.query, limit),
  ]);

  const sSongs = saavnRes.status === 'fulfilled' ? saavnRes.value.songs : [];
  const ytSongs = ytRes.status === 'fulfilled' ? ytRes.value.songs : [];

  const songs = deduplicateSongs([...sSongs, ...ytSongs]).slice(0, limit);
  setCache(cacheKey, songs);
  return songs;
}

// ─── More Like What You Like ──────────────────────────────────────────────────

export async function getMoreLikeWhatYouLike(
  languages: string[],
  seedArtists: string[] = [],
  limit = 16
): Promise<Song[]> {
  const artistsKey = seedArtists.slice(0, 3).join('_');
  const cacheKey = `more_like_you_${languages.join('_')}_${artistsKey}_${limit}`;
  const cached = fromCache<Song[]>(cacheKey);
  if (cached) return cached;

  const targetArtists = seedArtists.length > 0
    ? seedArtists.slice(0, 3)
    : (LANGUAGE_METADATA[languages[0] || 'Hindi']?.artists || ['Arijit Singh', 'Pritam']).slice(0, 3);

  const searchPromises = targetArtists.map(async (art) => {
    const [sRes, ytRes] = await Promise.allSettled([
      searchJioSaavn(`${art} best songs`, 8),
      searchYouTubeMusic(`${art} hits`, 8),
    ]);
    const sSongs = sRes.status === 'fulfilled' ? sRes.value.songs : [];
    const ytSongs = ytRes.status === 'fulfilled' ? ytRes.value.songs : [];
    return [...sSongs, ...ytSongs];
  });

  const results = await Promise.all(searchPromises);
  const combined: Song[] = [];
  const maxLen = Math.max(...results.map(r => r.length), 0);
  for (let i = 0; i < maxLen; i++) {
    for (const group of results) {
      if (group[i]) combined.push(group[i]);
    }
  }

  const songs = deduplicateSongs(combined).slice(0, limit);
  setCache(cacheKey, songs);
  return songs;
}

// ─── Happy (Upbeat & Feel-Good) ───────────────────────────────────────────────

export async function getHappyHits(languages: string[], limit = 16): Promise<Song[]> {
  const cacheKey = `happy_hits_${languages.join('_')}_${limit}`;
  const cached = fromCache<Song[]>(cacheKey);
  if (cached) return cached;

  const validLangs = languages.length > 0 ? languages : ['Hindi', 'International'];
  const queries = validLangs.map((lang) => `${lang} happy feel good upbeat energetic songs hits`);

  const searchPromises = queries.map(async (q) => {
    const [sRes, ytRes] = await Promise.allSettled([
      searchJioSaavn(q, Math.ceil(limit / queries.length) + 4),
      searchYouTubeMusic(q, Math.ceil(limit / queries.length) + 4),
    ]);
    const sSongs = sRes.status === 'fulfilled' ? sRes.value.songs : [];
    const ytSongs = ytRes.status === 'fulfilled' ? ytRes.value.songs : [];
    return [...sSongs, ...ytSongs];
  });

  const langResults = await Promise.all(searchPromises);
  const combined: Song[] = [];
  const maxLen = Math.max(...langResults.map(r => r.length), 0);
  for (let i = 0; i < maxLen; i++) {
    for (const group of langResults) {
      if (group[i]) combined.push(group[i]);
    }
  }

  const songs = deduplicateSongs(combined).slice(0, limit);
  setCache(cacheKey, songs);
  return songs;
}

// ─── Party (High-Energy Dance / Club) ─────────────────────────────────────────

export async function getPartyHits(languages: string[], limit = 16): Promise<Song[]> {
  const cacheKey = `party_hits_${languages.join('_')}_${limit}`;
  const cached = fromCache<Song[]>(cacheKey);
  if (cached) return cached;

  const validLangs = languages.length > 0 ? languages : ['Hindi', 'International', 'Punjabi'];
  const queries = validLangs.map((lang) => `${lang} party dance club DJ chartbusters 2025 2026`);

  const searchPromises = queries.map(async (q) => {
    const [sRes, ytRes] = await Promise.allSettled([
      searchJioSaavn(q, Math.ceil(limit / queries.length) + 4),
      searchYouTubeMusic(q, Math.ceil(limit / queries.length) + 4),
    ]);
    const sSongs = sRes.status === 'fulfilled' ? sRes.value.songs : [];
    const ytSongs = ytRes.status === 'fulfilled' ? ytRes.value.songs : [];
    return [...sSongs, ...ytSongs];
  });

  const langResults = await Promise.all(searchPromises);
  const combined: Song[] = [];
  const maxLen = Math.max(...langResults.map(r => r.length), 0);
  for (let i = 0; i < maxLen; i++) {
    for (const group of langResults) {
      if (group[i]) combined.push(group[i]);
    }
  }

  const songs = deduplicateSongs(combined).slice(0, limit);
  setCache(cacheKey, songs);
  return songs;
}

// ─── Throwback (Nostalgic 90s/2000s Classics) ──────────────────────────────────

export async function getThrowbackHits(languages: string[], limit = 16): Promise<Song[]> {
  const cacheKey = `throwback_hits_${languages.join('_')}_${limit}`;
  const cached = fromCache<Song[]>(cacheKey);
  if (cached) return cached;

  const validLangs = languages.length > 0 ? languages : ['Hindi', 'International'];
  const queries = validLangs.map((lang) => `90s 2000s ${lang} evergreen golden classics throwback melody hits`);

  const searchPromises = queries.map(async (q) => {
    const [sRes, ytRes] = await Promise.allSettled([
      searchJioSaavn(q, Math.ceil(limit / queries.length) + 4),
      searchYouTubeMusic(q, Math.ceil(limit / queries.length) + 4),
    ]);
    const sSongs = sRes.status === 'fulfilled' ? sRes.value.songs : [];
    const ytSongs = ytRes.status === 'fulfilled' ? ytRes.value.songs : [];
    return [...sSongs, ...ytSongs];
  });

  const langResults = await Promise.all(searchPromises);
  const combined: Song[] = [];
  const maxLen = Math.max(...langResults.map(r => r.length), 0);
  for (let i = 0; i < maxLen; i++) {
    for (const group of langResults) {
      if (group[i]) combined.push(group[i]);
    }
  }

  const songs = deduplicateSongs(combined).slice(0, limit);
  setCache(cacheKey, songs);
  return songs;
}

// ─── Recommendation for Today (Fresh Daily Personalized Mix) ───────────────────

export async function getDailyRecommendations(
  languages: string[],
  seedArtists: string[] = [],
  limit = 16
): Promise<Song[]> {
  const todayDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const cacheKey = `daily_rec_${todayDate}_${languages.join('_')}_${seedArtists.slice(0, 2).join('_')}_${limit}`;
  const cached = fromCache<Song[]>(cacheKey);
  if (cached) return cached;

  const validLangs = languages.length > 0 ? languages : ['Hindi', 'International'];
  const artistQueries = seedArtists.slice(0, 2).map((a) => `${a} popular songs`);
  const langQueries = validLangs.map((l) => `${l} top trending hits 2025`);

  const allQueries = [...artistQueries, ...langQueries];

  const searchPromises = allQueries.map(async (q) => {
    const res = await searchJioSaavn(q, 6).catch(() => ({ songs: [] }));
    return res.songs || [];
  });

  const [trendingSongs, ...queryResults] = await Promise.all([
    getPersonalizedTrending(validLangs, 10).catch(() => []),
    ...searchPromises,
  ]);

  const candidatePool = deduplicateSongs([...queryResults.flat(), ...trendingSongs]);

  // Pseudorandom daily shuffle based on day-of-year for fresh daily feeling
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
  const shuffled = [...candidatePool].sort((a, b) => {
    const hashA = (a.title.charCodeAt(0) * 31 + dayOfYear) % 100;
    const hashB = (b.title.charCodeAt(0) * 31 + dayOfYear) % 100;
    return hashA - hashB;
  });

  const songs = shuffled.slice(0, limit);
  setCache(cacheKey, songs);
  return songs;
}

export async function getPersonalizedArtists(languages: string[], limit = 12): Promise<Artist[]> {
  const cacheKey = `lang_artists_${languages.join('_')}_${limit}`;
  const cached = fromCache<Artist[]>(cacheKey);
  if (cached) return cached;

  const targetNames: string[] = [];
  languages.forEach((lang) => {
    const meta = LANGUAGE_METADATA[lang];
    if (meta) targetNames.push(...meta.artists);
  });

  if (targetNames.length === 0) {
    targetNames.push('Arijit Singh', 'The Weeknd', 'Diljit Dosanjh', 'Taylor Swift', 'Anirudh Ravichander');
  }

  // Deduplicate and slice
  const uniqueNames = Array.from(new Set(targetNames)).slice(0, limit);
  const artistPromises = uniqueNames.map(async (name) => {
    try {
      const details = await getArtistDetails(name);
      if (details.artist) return details.artist;
    } catch {}
    return {
      id: `artist_${name.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
      name,
      image: CONFIG.ARTWORK_PLACEHOLDER,
      imageLg: CONFIG.ARTWORK_PLACEHOLDER,
      provider: 'youtube' as const,
    };
  });

  const artists = await Promise.all(artistPromises);
  const validArtists = artists.filter(Boolean) as Artist[];
  setCache(cacheKey, validArtists);
  return validArtists;
}

// ─── Artist ──────────────────────────────────────────────────────────────────

export async function getArtistDetails(artistName: string): Promise<{
  artist: Artist | null;
  topTracks: Song[];
  similarArtists: Artist[];
}> {
  const cacheKey = `artist_${artistName}`;
  const cached = fromCache<{ artist: Artist | null; topTracks: Song[]; similarArtists: Artist[] }>(cacheKey);
  if (cached) return cached;

  const [lastfmInfo, ytTracks, saavnTracks, itunesTracks, iTunesArtistImg, similarArtists] = await Promise.all([
    getLastfmArtist(artistName).catch(() => null),
    searchYouTubeMusic(artistName, 30).then(r => r.songs).catch(() => []),
    searchJioSaavn(artistName, 30).then(r => r.songs).catch(() => []),
    searchItunesArtist(artistName).catch(() => []),
    // Fetch iTunes artist page for a dedicated artist portrait
    fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(artistName)}&entity=musicArtist&limit=1`)
      .then(r => r.json())
      .then((d: { results?: Array<{ artworkUrl100?: string }> }) => {
        const url = d.results?.[0]?.artworkUrl100;
        return url ? url.replace('100x100', '600x600') : null;
      })
      .catch(() => null),
    getSimilarArtists(artistName, 8).catch(() => []),
  ]);

  const topTracks = deduplicateSongs([...ytTracks, ...saavnTracks, ...itunesTracks]);

  // Image cascade: last.fm → iTunes artist portrait → song artwork → placeholder
  const isPlaceholder = (url?: string | null) =>
    !url || url === CONFIG.ARTWORK_PLACEHOLDER || url.includes('placeholder') || url.includes('2a96cbd8b46e442fc41c2b86b821562f');

  const resolvedImage =
    (!isPlaceholder(lastfmInfo?.image) ? lastfmInfo?.image : null) ??
    iTunesArtistImg ??
    topTracks[0]?.artwork ??
    CONFIG.ARTWORK_PLACEHOLDER;

  const resolvedImageLg =
    (!isPlaceholder(lastfmInfo?.imageLg) ? lastfmInfo?.imageLg : null) ??
    iTunesArtistImg ??
    topTracks[0]?.artworkLg ??
    CONFIG.ARTWORK_PLACEHOLDER;

  const artist: Artist | null = lastfmInfo ? {
    id: lastfmInfo.id || `artist_${artistName}`,
    name: lastfmInfo.name || artistName,
    image: resolvedImage,
    imageLg: resolvedImageLg,
    bio: lastfmInfo.bio,
    followerCount: lastfmInfo.followerCount,
    provider: 'lastfm',
    externalUrl: lastfmInfo.externalUrl,
  } : {
    id: `artist_${artistName}`,
    name: artistName,
    image: iTunesArtistImg ?? topTracks[0]?.artwork ?? CONFIG.ARTWORK_PLACEHOLDER,
    imageLg: iTunesArtistImg ?? topTracks[0]?.artworkLg ?? CONFIG.ARTWORK_PLACEHOLDER,
    provider: 'youtube',
  };

  const result = { artist, topTracks, similarArtists };
  setCache(cacheKey, result);
  return result;
}

export async function getTopArtists(limit = 12): Promise<Artist[]> {
  const cacheKey = `top_artists_${limit}`;
  const cached = fromCache<Artist[]>(cacheKey);
  if (cached) return cached;

  const artists = await getLastfmTopArtists(limit).catch(() => []);
  setCache(cacheKey, artists);
  return artists;
}

// ─── Album ───────────────────────────────────────────────────────────────────

export async function getAlbumTracks(albumId: string): Promise<Song[]> {
  const cacheKey = `album_${albumId}`;
  const cached = fromCache<Song[]>(cacheKey);
  if (cached) return cached;

  let tracks: Song[] = [];
  if (albumId.startsWith('jamendo_album_')) {
    tracks = await getJamendoAlbumTracks(albumId).catch(() => []);
  } else if (albumId.startsWith('yt_album_')) {
    const rawTitle = albumId.replace('yt_album_', '');
    const res = await searchYouTubeMusic(rawTitle, 25);
    tracks = res.songs;
  } else if (albumId.startsWith('saavn_album_')) {
    const rawId = albumId.replace('saavn_album_', '');
    const res = await searchJioSaavn(rawId, 25);
    tracks = res.songs;
  } else {
    tracks = await getItunesAlbumTracks(albumId).catch(() => []);
  }
  setCache(cacheKey, tracks);
  return tracks;
}

// ─── Deduplication Helpers ───────────────────────────────────────────────────

function normalizeKey(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function deduplicateSongs(songs: Song[]): Song[] {
  const seen = new Set<string>();
  return songs.filter((s) => {
    const key = `${normalizeKey(s.title)}_${normalizeKey(s.artist)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function deduplicateArtists(artists: Artist[]): Artist[] {
  const seen = new Set<string>();
  return artists.filter((a) => {
    const key = normalizeKey(a.name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function deduplicateAlbums(albums: Album[]): Album[] {
  const seen = new Set<string>();
  return albums.filter((a) => {
    const key = `${normalizeKey(a.title)}_${normalizeKey(a.artist)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
