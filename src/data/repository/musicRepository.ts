// ═══════════════════════════════════════════
//  Music Repository
//  Multi-provider: YouTube Music → JioSaavn (320kbps) → Jamendo → iTunes
// ═══════════════════════════════════════════

import type { Song, Artist, Album, SearchResult } from '../models';
import { searchYouTubeMusic, getYouTubeMusicTrending } from '../api/youtubeMusicApi';
import { searchJioSaavn, getJioSaavnTrending, formatMediaUrlWithQuality } from '../api/saavnApi';
import { searchItunes, getItunesAlbumTracks, getItunesTopCharts, searchItunesArtist } from '../api/itunesApi';
import { getJamendoFeatured, getJamendoNewReleases, getJamendoByGenre, getJamendoAlbumTracks } from '../api/jamendoApi';
import { getLastfmArtist, getSimilarArtists, getLastfmTopArtists } from '../api/lastfmApi';
import { filterSpotifyAvailableTracks } from '../../services/SpotifyAvailabilityService';
import { getArtistProfileImage } from '../../services/ArtistProfileService';
import { userProfileTracker } from '../../domain/recommendation/UserProfileTracker';
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

/**
 * Normalizes string for precision text matching (strips diacritics, punctuation, extra spaces).
 */
export function normalizeSearchString(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts clean core title without movie/soundtrack tags like (From "Movie"), [Official Audio], etc.
 */
export function extractCoreTitle(title: string): string {
  if (!title) return '';
  return title
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/[-–—]\s*(from|official|theme|soundtrack|audio|video|lyric|remix|lofi|slowed).*/i, '')
    .trim();
}

/**
 * Detects whether a track is a remix, cover, lofi, slowed, reverb, mashup, AI-generated, fan upload, etc.
 */
const ALTERNATE_VERSION_REGEX = /\b(remix|re-?mix|lofi|lo-?fi|slowed|reverb|slowed\s*\+\s*reverb|cover|mashup|rendition|parody|acoustic\s+version|instrumental|karaoke|tribute|tribute\s+to|dialogue|speech|bgm|ringtone|sped\s+up|speed\s+up|nightcore|bass\s+boost(?:ed)?|dj\s+mix|live\s+(?:at|version)|fan\s+made|fan\s+cover|ai\s+(?:version|cover|remake)|unofficial|recreation|reprise|regeneration|remake|hindi\s+version|dubbed|translated)\b/i;

export function isAlternateVersion(str: string): boolean {
  return ALTERNATE_VERSION_REGEX.test(str || '');
}

/**
 * Returns a TIER for the song's match type against the query.
 * Tier 1 (highest) = exact canonical title match. Tier 2 = close match. Etc.
 * The tier ensures exact title matches ALWAYS rank above everything else,
 * regardless of popularity, play count, or any other signal.
 */
export function getSearchMatchTier(song: Song, rawQuery: string): number {
  const query = normalizeSearchString(rawQuery);
  if (!query) return 5;

  const fullTitle = normalizeSearchString(song.title || '');
  const coreTitle = normalizeSearchString(extractCoreTitle(song.title || ''));
  const userAskedForAlternate = ALTERNATE_VERSION_REGEX.test(query);
  const songIsAlternate = !userAskedForAlternate &&
    (isAlternateVersion(song.title || '') || isAlternateVersion(song.album || ''));

  // Tier 1: Exact canonical match (e.g. full title = query AND not an alternate version)
  if ((fullTitle === query || coreTitle === query) && !songIsAlternate) return 1;

  // Tier 2: Exact canonical match that happens to be an alternate (user searched exact alternate name)
  if (fullTitle === query || coreTitle === query) return 2;

  // Tier 3: Title starts with query and is original (e.g. query = "Kaly" → "Kalyani")
  if ((fullTitle.startsWith(query) || coreTitle.startsWith(query)) && !songIsAlternate) return 3;

  // Tier 4: Title contains query (partial match, still original)
  if ((fullTitle.includes(query) || coreTitle.includes(query)) && !songIsAlternate) return 4;

  // Tier 5: Title contains query but is an alternate version (remix/cover/slowed etc.)
  if (fullTitle.includes(query) || coreTitle.includes(query)) return 5;

  // Tier 6: No title match (artist/album only)
  return 6;
}

/**
 * Returns an audio quality score for source selection.
 * Higher tier = better quality audio stream.
 */
export function getAudioSourceQualityTier(song: Song): number {
  if (!song || !song.previewUrl) return 0;
  // Tier 1: JioSaavn full 320kbps master audio
  if (song.provider === 'saavn' && !song.previewUrl.includes('preview')) return 100;
  // Tier 2: YouTube Music full track stream
  if (song.provider === 'youtube') return 85;
  // Tier 3: Verified official audio with full duration (> 60s)
  if (song.duration && song.duration > 60) return 70;
  // Tier 4: Promotional 30s preview
  return 30;
}

/**
 * Computes a composite search score for a song against a user query.
 *
 * ARCHITECTURE: Two-level comparator.
 * Level 1 — MATCH TIER (absolute priority, always decides first):
 *   Tier 1: exact canonical title, not an alternate version  → always beats everything
 *   Tier 2: exact title that is an alternate version
 *   Tier 3: title starts-with query, original track
 *   Tier 4: title contains query, original track
 *   Tier 5: title contains query, alternate version
 *   Tier 6: no title match (artist/album only)
 *
 * Level 2 — SUB-SCORE (tiebreaker within the same tier):
 *   Popularity/play count, audio quality, artist match, word coverage.
 *   Sub-score is capped at 999 so it CANNOT promote a song across tiers.
 *
 * This guarantees: "KALYANI" original always ranks above
 *   any remix/cover/slowed regardless of its popularity or play count.
 */
export function calculateSearchRelevance(song: Song, rawQuery: string): number {
  if (!song || !rawQuery) return 0;

  const query = normalizeSearchString(rawQuery);
  if (!query) return 0;

  // --- Level 1: Tier (multiplied by 10000 to dominate sub-score) ---
  const tier = getSearchMatchTier(song, rawQuery);
  // tier 1 → base 60000, tier 2 → 50000, …, tier 6 → 10000
  const tierBase = (7 - tier) * 10000;

  // --- Level 2: Sub-score (tiebreaker, max 999) ---
  const fullTitle = normalizeSearchString(song.title || '');
  const coreTitle = normalizeSearchString(extractCoreTitle(song.title || ''));
  const artist = normalizeSearchString(song.artist || '');
  const album = normalizeSearchString(song.album || '');
  const queryWords = query.split(' ').filter(Boolean);
  const userAskedForAlternate = ALTERNATE_VERSION_REGEX.test(query);
  const songIsAlternate = isAlternateVersion(song.title || '') || isAlternateVersion(song.album || '');

  let sub = 0;

  // A. Title precision within tier
  if (fullTitle === query || coreTitle === query) sub += 200;
  else if (fullTitle.startsWith(query) || coreTitle.startsWith(query)) sub += 150;
  else if (fullTitle.includes(query) || coreTitle.includes(query)) sub += 80;

  // B. Artist match
  if (artist === query) sub += 120;
  else if (artist.startsWith(query)) sub += 80;
  else if (artist.includes(query)) sub += 40;

  // C. Word coverage
  let matchedWords = 0;
  for (const word of queryWords) {
    if (word.length < 2) continue;
    if (coreTitle.includes(word) || fullTitle.includes(word)) { sub += 15; matchedWords++; }
    else if (artist.includes(word)) { sub += 8; matchedWords++; }
    else if (album.includes(word)) { sub += 4; matchedWords++; }
  }
  if (queryWords.length > 1 && matchedWords === queryWords.length) sub += 30;

  // D. Audio quality bonus (capped at 45 pts)
  sub += Math.min(45, Math.round(getAudioSourceQualityTier(song) * 0.45));

  // E. Play count / popularity (tiebreaker within same tier, capped at 180 pts)
  if (song.playCount && song.playCount > 0) {
    if (song.playCount >= 100_000_000) sub += 180;
    else if (song.playCount >= 25_000_000) sub += 140;
    else if (song.playCount >= 5_000_000) sub += 110;
    else if (song.playCount >= 1_000_000) sub += 80;
    else if (song.playCount >= 200_000) sub += 50;
    else if (song.playCount >= 20_000) sub += 25;
    else sub += 10;
  } else if (song.popularity) {
    sub += Math.min(120, Math.round(song.popularity * 1.2));
  }

  // F. Original track bonus within tier
  if (!userAskedForAlternate) {
    if (!songIsAlternate) sub += 60;  // original gets a small boost
    // (alternate already demoted to higher tier number, penalty not needed here)
  }

  // G. Junk content penalty
  if (/\b(dialogue|speech|audio\s+teaser|trailer|ringtone|sound\s+effects)\b/i.test(song.title || '')) {
    sub = Math.max(0, sub - 300);
  }

  // Clamp sub-score to [0, 999] so it never crosses tier boundaries
  const clampedSub = Math.min(999, Math.max(0, sub));

  return tierBase + clampedSub;
}

/**
 * Multi-source deduplication that merges identical recordings into a single high-definition entry.
 * Strictly applies Audio Quality Ranking BEFORE popularity when choosing between duplicate sources.
 */
export function mergeAndDeduplicateSearchResults(songs: Song[]): Song[] {
  if (!Array.isArray(songs) || songs.length === 0) return [];

  const map = new Map<string, Song>();

  for (const s of songs) {
    if (!s) continue;

    const coreTitle = normalizeSearchString(extractCoreTitle(s.title || ''));
    const primaryArtist = normalizeSearchString((s.artist || '').split(/[,&/|+]|\bfeat\b|\bft\b/i)[0] || '');
    const isAlt = isAlternateVersion(s.title || '');

    // Canonical key pairs core title and primary artist
    const canonicalKey = `${primaryArtist}::${coreTitle}::${isAlt ? s.title.toLowerCase() : 'original'}`;

    const existing = map.get(canonicalKey);
    if (!existing) {
      map.set(canonicalKey, {
        ...s,
        previewUrl: formatMediaUrlWithQuality(s.previewUrl, 'high'),
      });
    } else {
      const existingTier = getAudioSourceQualityTier(existing);
      const currentTier = getAudioSourceQualityTier(s);

      // Quality ranking is applied before popularity: prefer highest legitimate audio quality source
      const chosenSource = currentTier > existingTier ? s : existing;
      const otherSource = currentTier > existingTier ? existing : s;

      const betterPreviewUrl = chosenSource.previewUrl || otherSource.previewUrl;
      const betterArtwork = (chosenSource.artworkLg && !chosenSource.artworkLg.includes('placeholder'))
        ? chosenSource.artworkLg
        : (otherSource.artworkLg || chosenSource.artwork);
      const betterDuration = Math.max(chosenSource.duration || 0, otherSource.duration || 0);
      const higherPlayCount = Math.max(chosenSource.playCount || 0, otherSource.playCount || 0) || undefined;
      const higherPopularity = Math.max(chosenSource.popularity || 0, otherSource.popularity || 0) || undefined;

      map.set(canonicalKey, {
        ...chosenSource,
        previewUrl: formatMediaUrlWithQuality(betterPreviewUrl, 'high'),
        artworkLg: betterArtwork,
        duration: betterDuration,
        playCount: higherPlayCount,
        popularity: higherPopularity,
      });
    }
  }

  return Array.from(map.values());
}

export async function searchMusic(query: string, limit = 20): Promise<SearchResult> {
  const cleanQuery = query.trim();
  const cacheKey = `search_${cleanQuery}_${limit}`;
  const cached = fromCache<SearchResult>(cacheKey);
  if (cached) return cached;

  // Run YouTube Music (InnerTube ML ranker + view counts), JioSaavn (320kbps master), and iTunes (official) in parallel
  const [ytResult, saavnResult, itunesResult] = await Promise.allSettled([
    searchYouTubeMusic(cleanQuery, limit + 10),
    searchJioSaavn(cleanQuery, limit + 10),
    searchItunes(cleanQuery, limit + 8),
  ]);

  const yt = ytResult.status === 'fulfilled' ? ytResult.value : { songs: [], artists: [], albums: [] };
  const saavn = saavnResult.status === 'fulfilled' ? saavnResult.value : { songs: [], artists: [], albums: [] };
  const itunes = itunesResult.status === 'fulfilled' ? itunesResult.value : { songs: [], artists: [], albums: [] };

  // 1. Merge and deduplicate identical recordings across official sources
  const mergedSongs = mergeAndDeduplicateSearchResults([
    ...yt.songs,
    ...saavn.songs,
    ...itunes.songs,
  ]);
  
  // 2. Filter for catalog availability
  const verifiedSongs = await filterSpotifyAvailableTracks(mergedSongs);

  // 3. Rank results strictly with Spotify & YouTube ML relevance and view-count scoring
  const rankedSongs = [...verifiedSongs].sort((a, b) => {
    const scoreA = calculateSearchRelevance(a, cleanQuery);
    const scoreB = calculateSearchRelevance(b, cleanQuery);
    return scoreB - scoreA;
  });

  const allSongs = rankedSongs.slice(0, limit * 2);
  const allArtists = deduplicateArtists([...yt.artists, ...saavn.artists, ...itunes.artists]).slice(0, 12);
  const allAlbums = deduplicateAlbums([...yt.albums, ...saavn.albums, ...itunes.albums]).slice(0, 12);

  const result: SearchResult = {
    songs: allSongs,
    artists: allArtists,
    albums: allAlbums,
    query: cleanQuery,
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
    artists: ['Khesari Lal Yadav', 'Pawan Singh', 'Pramod Premi Yadav', 'Shilpi Raj'],
  },
  Haryanvi: {
    query: 'Latest Haryanvi Ragni Songs 2025',
    title: 'Haryanvi Hits',
    artists: ['Gulzaar Chhaniwala', 'Renuka Panwar', 'Masoom Sharma', 'Diler Kharkiya'],
  },
  Rajasthani: {
    query: 'Top Rajasthani Marwadi Folk Songs 2025',
    title: 'Rajasthani Hits',
    artists: ['Seema Mishra', 'Twinkle Vaishnav', 'Prakash Mali'],
  },
  'Himachali / Pahari': {
    query: 'Top Himachali Pahari Nati Songs 2025',
    title: 'Himachali & Pahari Hits',
    artists: ['Kuldeep Sharma', 'Thakur Das Rathi', 'Inder Jeet'],
  },
  Assamese: {
    query: 'Top Assamese Bihu Songs 2025',
    title: 'Assamese Hits',
    artists: ['Zubeen Garg', 'Papon', 'Neel Akash', 'Deeplina Deka'],
  },
  Odia: {
    query: 'Latest Odia Movie Songs 2025',
    title: 'Odia Hits',
    artists: ['Humane Sagar', 'Aseema Panda', 'Kuldeep Pattanaik'],
  },
  Kashmiri: {
    query: 'Top Kashmiri Sufi Songs Rouf 2025',
    title: 'Kashmiri Melodies',
    artists: ['Rashid Jahangir', 'Kailash Mehra', 'Noor Mohammad'],
  },
  Sindhi: {
    query: 'Top Sindhi Sufi Songs 2025',
    title: 'Sindhi Hits',
    artists: ['Abida Parveen', 'Allan Fakir', 'Jalal Chandio'],
  },
  Konkani: {
    query: 'Top Konkani Songs Goa Mangalore 2025',
    title: 'Konkani Melodies',
    artists: ['Lorna Cordeiro', 'Remo Fernandes', 'Wilfy Rebimbus'],
  },
  Maithili: {
    query: 'Top Maithili Lokgeet Songs 2025',
    title: 'Maithili Hits',
    artists: ['Kunj Bihari Mishra', 'Maithili Thakur', 'Poonam Mishra'],
  },
  Chhattisgarhi: {
    query: 'Latest Chhattisgarhi CG Songs 2025',
    title: 'Chhattisgarhi Hits',
    artists: ['Dukalu Yadav', 'Gorelal Barman', 'Garima Diwakar'],
  },
  Garhwali: {
    query: 'Top Garhwali Uttarakhandi Songs 2025',
    title: 'Garhwali Hits',
    artists: ['Narendra Singh Negi', 'Pritam Bhartwan', 'Gajendra Rana'],
  },
  Kumaoni: {
    query: 'Top Kumaoni Songs Uttarakhand 2025',
    title: 'Kumaoni Hits',
    artists: ['Gopal Babu Goswami', 'B.K. Samant', 'Meena Rana'],
  },
  Manipuri: {
    query: 'Top Manipuri Meitei Songs 2025',
    title: 'Manipuri Melodies',
    artists: ['Tapta', 'Ranbir Thouna', 'Sorri Senjam'],
  },
  Nagpuri: {
    query: 'Latest Nagpuri Sadri Songs 2025',
    title: 'Nagpuri Hits',
    artists: ['Pawan Roy', 'Pankaj Roy', 'Suman Gupta'],
  },
  Braj: {
    query: 'Top Braj Bhasha Rasiya Bhajan Songs 2025',
    title: 'Braj Hits',
    artists: ['Vinod Agarwal', 'Gaurav Krishna Goswami', 'Chitra Vichitra'],
  },
  Awadhi: {
    query: 'Top Awadhi Lokgeet Songs 2025',
    title: 'Awadhi Melodies',
    artists: ['Malini Awasthi', 'Sharda Sinha', 'Channulal Mishra'],
  },
  Marwari: {
    query: 'Top Marwari Desi Bhajan Songs 2025',
    title: 'Marwari Hits',
    artists: ['Chhotu Singh Rawna', 'Prakash Mali', 'Neeta Nayak'],
  },
};

export async function getPersonalizedTrending(languages: string[], limit = 20): Promise<Song[]> {
  const todayKey = new Date().toISOString().slice(0, 10);
  const cacheKey = `daily_trending_${todayKey}_${languages.join('_')}_${limit}`;
  const cached = fromCache<Song[]>(cacheKey);
  if (cached && cached.length > 0) return cached;

  const validLangs = languages.length > 0 ? languages : ['Hindi', 'International'];
  const queries = validLangs.map((lang) => `${lang} top charts trending 2025 2026`);
  
  // Search JioSaavn trending + YouTube Music for each language chart
  const searchPromises = queries.map(async (q) => {
    const [sRes, ytRes] = await Promise.allSettled([
      searchJioSaavn(q, Math.ceil(limit / queries.length) + 6),
      searchYouTubeMusic(q, Math.ceil(limit / queries.length) + 6),
    ]);
    const sSongs = sRes.status === 'fulfilled' ? sRes.value.songs : [];
    const ytSongs = ytRes.status === 'fulfilled' ? ytRes.value.songs : [];
    return [...sSongs, ...ytSongs];
  });

  const [generalTrending, ...langResults] = await Promise.all([
    getJioSaavnTrending(16).catch(() => []),
    ...searchPromises,
  ]);

  // Interleave results from user's languages first, then general trending charts
  const combined: Song[] = [];
  const maxLen = Math.max(...langResults.map(r => r.length), generalTrending.length);
  for (let i = 0; i < maxLen; i++) {
    if (generalTrending[i]) combined.push(generalTrending[i]);
    for (const group of langResults) {
      if (group[i]) combined.push(group[i]);
    }
  }

  const rawSongs = deduplicateSongs(combined);
  const verified = await filterSpotifyAvailableTracks(rawSongs);
  const ranked = sortByPopularityAndTrending(verified);
  const songs = diversifySongArtworks(ranked)
    .slice(0, limit)
    .map((s) => ({
      ...s,
      previewUrl: formatMediaUrlWithQuality(s.previewUrl, 'high'),
    }));

  setCache(cacheKey, songs);
  return songs;
}

/**
 * Calculates a dynamic trending & popularity score (0-100) for a song.
 * Factors in:
 * 1. Global / Indian streaming play count & chart position.
 * 2. Recent release freshness (2025/2026 chartbusters).
 * 3. User listening affinity & repeat play count from userProfileTracker.
 */
export function calculateSongPopularity(song: Song, indexInResults = 0): number {
  if (!song) return 0;
  let score = 50;

  // 1. Chart / search rank position (earlier in results = higher listing popularity)
  score += Math.max(0, 30 - indexInResults * 2);

  // 2. Play count data if available
  if (song.playCount && song.playCount > 0) {
    if (song.playCount > 10_000_000) score += 20;
    else if (song.playCount > 1_000_000) score += 15;
    else if (song.playCount > 100_000) score += 10;
    else score += 5;
  } else if (song.popularity) {
    score = Math.max(score, song.popularity);
  }

  // 3. Freshness & Trending Year
  const currentYear = new Date().getFullYear();
  if (song.year && (song.year >= currentYear - 1)) {
    score += 10; // Boost current 2025/2026 trending drops
  }

  // 4. User Listening Intelligence & Affinity
  if (typeof userProfileTracker !== 'undefined') {
    const affinity = userProfileTracker.calculateAffinityScore(song);
    score += Math.round(affinity * 0.25);
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Sorts an array of songs by dynamic popularity and trending score.
 */
export function sortByPopularityAndTrending(songs: Song[]): Song[] {
  return [...songs].sort((a, b) => {
    const scoreA = calculateSongPopularity(a);
    const scoreB = calculateSongPopularity(b);
    return scoreB - scoreA;
  });
}

/**
 * Ensures artwork diversity across horizontal song rows so adjacent/nearby
 * cards do not duplicate identical compilation/album covers.
 */
export function diversifySongArtworks(songs: Song[], maxPerArtwork = 1): Song[] {
  const artworkCounts = new Map<string, number>();
  const prioritized: Song[] = [];
  const overflow: Song[] = [];

  for (const song of songs) {
    if (!song) continue;
    const art = (song.artwork || '').split('?')[0].toLowerCase().trim();
    const count = artworkCounts.get(art) || 0;
    if (!art || count < maxPerArtwork) {
      if (art) artworkCounts.set(art, count + 1);
      prioritized.push(song);
    } else {
      overflow.push(song);
    }
  }

  return [...prioritized, ...overflow];
}

export async function getPersonalizedRecommendForYou(
  languages: string[],
  recentlyPlayed: Song[] = [],
  favorites: Song[] = [],
  limit = 20
): Promise<Song[]> {
  const recentIds = new Set(recentlyPlayed.map((s) => s.id));
  const recentTitles = new Set(recentlyPlayed.map((s) => s.title.toLowerCase().replace(/[^a-z0-9]/g, '')));

  // 1. Analyze dominant language & genre from history
  let dominantLang = languages[0] || 'Hindi';
  let isPhonkDominant = false;

  const historySample = [...recentlyPlayed.slice(0, 15), ...favorites.slice(0, 15)];
  if (historySample.length > 0) {
    let bhojpuriCount = 0;
    let hindiCount = 0;
    let phonkCount = 0;
    let punjabiCount = 0;

    for (const song of historySample) {
      const text = `${song.title} ${song.artist} ${song.album || ''}`.toLowerCase();
      if (text.includes('phonk') || text.includes('drift') || text.includes('kordhell') || text.includes('montagem')) {
        phonkCount++;
      } else if (isSongMatchingLanguage(song, 'Bhojpuri')) {
        bhojpuriCount++;
      } else if (isSongMatchingLanguage(song, 'Hindi')) {
        hindiCount++;
      } else if (isSongMatchingLanguage(song, 'Punjabi')) {
        punjabiCount++;
      }
    }

    if (phonkCount >= 2 && phonkCount >= bhojpuriCount && phonkCount >= hindiCount) {
      isPhonkDominant = true;
    } else if (bhojpuriCount > hindiCount && bhojpuriCount > punjabiCount) {
      dominantLang = 'Bhojpuri';
    } else if (punjabiCount > hindiCount && punjabiCount > bhojpuriCount) {
      dominantLang = 'Punjabi';
    } else if (hindiCount > 0) {
      dominantLang = 'Hindi';
    }
  }

  // 2. Formulate dynamic queries based on listening patterns & top artists
  const topArtists = userProfileTracker.getTopArtists(4);
  const queries: string[] = [];

  if (isPhonkDominant) {
    queries.push('Drift Phonk viral gaming 2025 2026', 'Brazilian Phonk aggressive mix', 'Top Phonk hits 2025');
  } else if (dominantLang === 'Bhojpuri') {
    queries.push('Latest Bhojpuri superhit songs 2025 2026', 'Top Bhojpuri romantic party hits 2025');
    if (topArtists.length > 0) {
      queries.push(`${topArtists[0]} new Bhojpuri songs`);
    }
  } else if (dominantLang === 'Punjabi') {
    queries.push('Latest Punjabi hits 2025 2026', 'Top Punjabi chartbusters 2025');
    if (topArtists.length > 0) {
      queries.push(`${topArtists[0]} Punjabi songs`);
    }
  } else {
    queries.push('Latest Hindi romantic pop hits 2025 2026', 'Top Bollywood chartbusters 2025');
    if (topArtists.length > 0) {
      queries.push(`${topArtists[0]} best songs`, `${topArtists[1] || 'Arijit Singh'} latest hits`);
    }
  }

  // 3. Search and gather candidates
  const searchPromises = queries.map(async (q) => {
    const [sRes, ytRes] = await Promise.allSettled([
      searchJioSaavn(q, 15),
      searchYouTubeMusic(q, 15),
    ]);
    const sSongs = sRes.status === 'fulfilled' ? sRes.value.songs : [];
    const ytSongs = ytRes.status === 'fulfilled' ? ytRes.value.songs : [];
    return [...sSongs, ...ytSongs];
  });

  const batches = await Promise.all(searchPromises);
  const rawPool = deduplicateSongs(batches.flat());

  // 4. Strict Language/Genre & Not-Repeated-In-Recently-Played Filter
  const filtered = rawPool.filter((song) => {
    // Exclude tracks user already recently listened to (no repeated songs)
    if (recentIds.has(song.id)) return false;
    const core = song.title.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (recentTitles.has(core)) return false;

    // Strict genre/language continuity
    if (isPhonkDominant) {
      const text = `${song.title} ${song.artist}`.toLowerCase();
      return text.includes('phonk') || text.includes('drift') || text.includes('kordhell') || text.includes('montagem') || text.includes('giga');
    }
    return isSongMatchingLanguage(song, dominantLang);
  });

  // 5. Verify official Spotify listing
  const verified = await filterSpotifyAvailableTracks(filtered);

  // 6. Score by user affinity AND trending popularity
  const scored = verified.map((song, idx) => {
    const affinity = userProfileTracker.calculateAffinityScore(song);
    const popScore = calculateSongPopularity(song, idx);
    return { song, score: affinity * 0.6 + popScore * 0.4 };
  });

  scored.sort((a, b) => b.score - a.score);
  const rawList = scored.map((s) => s.song);

  // 7. Ensure artwork diversity (each song has its own individual cover banner)
  const diversified = diversifySongArtworks(rawList);
  return diversified.slice(0, limit);
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

  const rawSongs = deduplicateSongs(combined);
  const verified = await filterSpotifyAvailableTracks(rawSongs);
  const ranked = sortByPopularityAndTrending(verified);
  const songs = diversifySongArtworks(ranked).slice(0, limit);
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

  const verified = await filterSpotifyAvailableTracks(prioritized);
  const result = verified.slice(0, limit);
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

  const rawSongs = deduplicateSongs(combined);
  const songs = (await filterSpotifyAvailableTracks(rawSongs)).slice(0, limit);
  setCache(cacheKey, songs);
  return songs;
}

export async function getPersonalizedTracksByLanguage(language: string, limit = 16): Promise<Song[]> {
  const meta = LANGUAGE_METADATA[language] || { query: `${language} top hits`, title: `${language} Hits` };
  const cacheKey = `lang_tracks_${language}_${limit}`;
  const cached = fromCache<Song[]>(cacheKey);
  if (cached) return cached;

  const [saavnRes, ytRes] = await Promise.allSettled([
    searchJioSaavn(meta.query, limit + 5),
    searchYouTubeMusic(meta.query, limit + 5),
  ]);

  const sSongs = saavnRes.status === 'fulfilled' ? saavnRes.value.songs : [];
  const ytSongs = ytRes.status === 'fulfilled' ? ytRes.value.songs : [];

  const rawSongs = deduplicateSongs([...sSongs, ...ytSongs])
    .filter((s) => isSongMatchingLanguage(s, language));
  const verified = await filterSpotifyAvailableTracks(rawSongs);
  const songs = diversifySongArtworks(verified).slice(0, limit);
  setCache(cacheKey, songs);
  return songs;
}

/**
 * Strict language validator to ensure tracks match target language.
 * Filters out cross-contamination (e.g. Bhojpuri songs in Hindi playlist, or Hindi songs in Bhojpuri playlist).
 */
export function isSongMatchingLanguage(song: Song, targetLanguage: string): boolean {
  if (!song) return false;
  let target = targetLanguage.toLowerCase().trim();
  if (target === 'himachali / pahari' || target === 'himachali' || target === 'pahari') {
    target = 'pahari';
  }
  const songLang = (song.language || song.genre || '').toLowerCase().trim();

  // If language metadata is explicitly present on song
  if (songLang && songLang !== 'music' && songLang !== 'trending') {
    if (target === 'hindi') {
      if (songLang.includes('bhojpuri') || songLang.includes('punjabi') || songLang.includes('tamil') || songLang.includes('telugu') || songLang.includes('bengali') || songLang.includes('malayalam') || songLang.includes('kannada') || songLang.includes('marathi') || songLang.includes('gujarati') || songLang.includes('haryanvi')) {
        return false;
      }
      return songLang.includes('hindi') || songLang.includes('bollywood');
    }

    if (target === 'bhojpuri') {
      if (songLang.includes('hindi') || songLang.includes('punjabi') || songLang.includes('tamil') || songLang.includes('telugu') || songLang.includes('english')) {
        return false;
      }
      return songLang.includes('bhojpuri');
    }

    if (target === 'punjabi') {
      if (songLang.includes('bhojpuri') || songLang.includes('hindi') || songLang.includes('tamil')) return false;
      return songLang.includes('punjabi');
    }

    if (target === 'international' || target === 'english') {
      if (songLang.includes('hindi') || songLang.includes('bhojpuri') || songLang.includes('punjabi') || songLang.includes('tamil') || songLang.includes('telugu')) return false;
      return songLang.includes('english') || songLang.includes('international') || songLang.includes('pop') || songLang.includes('rock');
    }

    if (target === 'pahari') {
      return songLang.includes('pahari') || songLang.includes('himachali') || songLang.includes('nati');
    }

    return songLang.includes(target);
  }

  // Fallback text check on title / artist / album if language field not explicitly defined
  const fullText = `${song.title} ${song.artist} ${song.album || ''}`.toLowerCase();
  if (target === 'hindi') {
    if (fullText.includes('bhojpuri') || fullText.includes('khesari') || fullText.includes('pawan singh') || fullText.includes('chintu') || fullText.includes('nirahua') || fullText.includes('shilpi raj') || fullText.includes('haryanvi')) {
      return false;
    }
    return true;
  }

  if (target === 'bhojpuri') {
    if (fullText.includes('bollywood') || fullText.includes('arijit') || fullText.includes('shreya ghoshal')) {
      return false;
    }
    return fullText.includes('bhojpuri') || fullText.includes('khesari') || fullText.includes('pawan singh') || fullText.includes('pramod premi') || fullText.includes('ankush raja') || fullText.includes('shilpi raj') || fullText.includes('golu gold') || fullText.includes('gunjan singh');
  }

  if (target === 'pahari') {
    return fullText.includes('pahari') || fullText.includes('himachali') || fullText.includes('nati') || fullText.includes('kuldeep sharma');
  }

  return true;
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
    targetNames.push('Arijit Singh', 'Shreya Ghoshal', 'Pritam', 'A.R. Rahman', 'Diljit Dosanjh', 'The Weeknd', 'Taylor Swift', 'Anirudh Ravichander');
  }

  // Deduplicate and slice
  const uniqueNames = Array.from(new Set(targetNames)).slice(0, limit);
  const artistPromises = uniqueNames.map(async (name) => {
    const photoUrl = await getArtistProfileImage(name);
    return {
      id: `artist_${name.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
      name,
      profileImage: photoUrl,
      image: photoUrl,
      imageLg: photoUrl,
      provider: 'lastfm' as const,
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

  const [lastfmInfo, ytTracks, saavnTracks, itunesTracks, artistPhoto, similarArtistsRaw] = await Promise.all([
    getLastfmArtist(artistName).catch(() => null),
    searchYouTubeMusic(artistName, 30).then(r => r.songs).catch(() => []),
    searchJioSaavn(artistName, 30).then(r => r.songs).catch(() => []),
    searchItunesArtist(artistName).catch(() => []),
    getArtistProfileImage(artistName),
    getSimilarArtists(artistName, 8).catch(() => []),
  ]);

  const rawTracks = deduplicateSongs([...saavnTracks, ...itunesTracks, ...ytTracks]);
  const topTracks = await filterSpotifyAvailableTracks(rawTracks);

  // Populate similar artists with their official profile photos
  const similarArtists: Artist[] = await Promise.all(
    similarArtistsRaw.map(async (a) => {
      const pImg = await getArtistProfileImage(a.name);
      return {
        ...a,
        profileImage: pImg,
        image: pImg,
        imageLg: pImg,
      };
    })
  );

  const artist: Artist = {
    id: lastfmInfo?.id || `artist_${artistName.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
    name: lastfmInfo?.name || artistName,
    profileImage: artistPhoto,
    image: artistPhoto,
    imageLg: artistPhoto,
    bio: lastfmInfo?.bio,
    followerCount: lastfmInfo?.followerCount,
    provider: 'lastfm',
    externalUrl: lastfmInfo?.externalUrl,
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

export function normalizeSongKey(str: string): string {
  return (str || '')
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export function deduplicateSongs(songs: Song[]): Song[] {
  if (!Array.isArray(songs) || songs.length === 0) return [];

  const seenIds = new Set<string>();
  const seenArtistTitle = new Set<string>();
  const uniqueSongs: Song[] = [];

  for (const s of songs) {
    if (!s) continue;

    // 1. Direct stable unique ID check
    const id = s.id ? s.id.trim() : '';
    if (id) {
      if (seenIds.has(id)) continue;
      seenIds.add(id);
    }

    // 2. Exact Title + Primary Artist match (deduplicates multi-source identical tracks while preserving different songs with same title)
    const cleanTitle = (s.title || '').trim().toLowerCase().replace(/\(.*?\)|\[.*?\]/g, '').replace(/[^\p{L}\p{N}]/gu, '');
    const primaryArtist = (s.artist || '').trim().toLowerCase().split(/[,&/|+]|\bfeat\b|\bft\b/i)[0]?.trim().replace(/[^\p{L}\p{N}]/gu, '') || '';

    if (cleanTitle && primaryArtist) {
      const artistTitleKey = `${primaryArtist}_${cleanTitle}`;
      if (seenArtistTitle.has(artistTitleKey)) {
        continue;
      }
      seenArtistTitle.add(artistTitleKey);
    }

    uniqueSongs.push(s);
  }

  return uniqueSongs;
}

function deduplicateArtists(artists: Artist[]): Artist[] {
  const seen = new Set<string>();
  return artists.filter((a) => {
    const key = normalizeSongKey(a.name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function deduplicateAlbums(albums: Album[]): Album[] {
  const seen = new Set<string>();
  return albums.filter((a) => {
    const key = `${normalizeSongKey(a.title)}_${normalizeSongKey(a.artist)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
