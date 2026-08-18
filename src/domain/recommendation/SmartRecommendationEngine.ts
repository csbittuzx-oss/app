// ═══════════════════════════════════════════
//  SmartRecommendationEngine
//  Spotify-style AutoPlay & Recommendation Intelligence:
//  - Strict Context & Language Isolation:
//      Bhojpuri → Bhojpuri only
//      Hindi → Hindi only
//      Phonk → Phonk only
//      Punjabi → Punjabi only
//      International → International only
//  - Classification by language, genre, subGenre, mood, artist, trackId (never just title)
//  - Multi-tier ranking & strict duplicate elimination
//  - Zero queue disruption & proactive smooth replenishment
// ═══════════════════════════════════════════

import type { Song, Playlist } from '../../data/models';
import { searchJioSaavn, resolveFullTrack } from '../../data/api/saavnApi';
import { searchYouTubeMusic } from '../../data/api/youtubeMusicApi';
import { userProfileTracker } from './UserProfileTracker';
import { isSongMatchingLanguage, deduplicateSongs } from '../../data/repository/musicRepository';
import { filterSpotifyAvailableTracks } from '../../services/SpotifyAvailabilityService';
import { aiTasteProfileEngine, inferSongMood } from '../ai/AITasteProfileEngine';

export interface RecommendationContext {
  languages?: string[];
  queue?: Song[];
  userPlaylists?: Playlist[];
  favorites?: Song[];
  recentlyPlayed?: Song[];
  searchHistory?: string[];
}

export interface MusicContext {
  language: string; // 'Bhojpuri' | 'Hindi' | 'Punjabi' | 'International' | 'Tamil' | 'Telugu' | 'Phonk'
  isPhonk: boolean;
  genre: string;
  artist: string;
}

/**
 * Classifies the exact music context, language, and genre from full song metadata.
 */
export function classifySongContext(song: Song | null): MusicContext {
  if (!song) {
    return { language: 'Hindi', isPhonk: false, genre: 'Bollywood', artist: '' };
  }

  const rawText = `${song.title} ${song.artist} ${song.album || ''} ${song.genre || ''} ${song.language || ''}`.toLowerCase();

  // 1. Phonk check (genre = 'phonk' or text contains phonk / drift / brazilian phonk)
  const isPhonk = (song.genre || '').toLowerCase().includes('phonk') ||
    rawText.includes('phonk') ||
    rawText.includes('drift phonk') ||
    rawText.includes('brazilian phonk') ||
    rawText.includes('kordhell') ||
    rawText.includes('gvrido') ||
    rawText.includes('interworld') ||
    rawText.includes('playaphonk') ||
    rawText.includes('dxrk') ||
    rawText.includes('hxvrmxn') ||
    rawText.includes('cursed evil') ||
    rawText.includes('cowbell phonk');

  if (isPhonk) {
    return { language: 'Phonk', isPhonk: true, genre: 'Phonk', artist: song.artist };
  }

  // 2. Bhojpuri check
  const isBhojpuri = (song.language || '').toLowerCase().includes('bhojpuri') ||
    (song.genre || '').toLowerCase().includes('bhojpuri') ||
    rawText.includes('bhojpuri') ||
    rawText.includes('khesari') ||
    rawText.includes('pawan singh') ||
    rawText.includes('pramod premi') ||
    rawText.includes('shilpi raj') ||
    rawText.includes('ankush raja') ||
    rawText.includes('golu gold') ||
    rawText.includes('gunjan singh') ||
    rawText.includes('arvind akela') ||
    rawText.includes('kallu') ||
    rawText.includes('chintu');

  if (isBhojpuri) {
    return { language: 'Bhojpuri', isPhonk: false, genre: 'Regional', artist: song.artist };
  }

  // 3. Punjabi check
  const isPunjabi = (song.language || '').toLowerCase().includes('punjabi') ||
    (song.genre || '').toLowerCase().includes('punjabi') ||
    rawText.includes('punjabi') ||
    rawText.includes('diljit') ||
    rawText.includes('karan aujla') ||
    rawText.includes('ap dhillon') ||
    rawText.includes('sidhu moose') ||
    rawText.includes('shubh') ||
    rawText.includes('amrit maan') ||
    rawText.includes('jassi gill');

  if (isPunjabi) {
    return { language: 'Punjabi', isPhonk: false, genre: 'Punjabi', artist: song.artist };
  }

  // 4. Tamil / Telugu / Malayalam / Kannada
  if ((song.language || '').toLowerCase().includes('tamil') || rawText.includes('tamil') || rawText.includes('kollywood')) {
    return { language: 'Tamil', isPhonk: false, genre: 'Kollywood', artist: song.artist };
  }
  if ((song.language || '').toLowerCase().includes('telugu') || rawText.includes('telugu') || rawText.includes('tollywood')) {
    return { language: 'Telugu', isPhonk: false, genre: 'Tollywood', artist: song.artist };
  }
  if ((song.language || '').toLowerCase().includes('malayalam') || rawText.includes('malayalam')) {
    return { language: 'Malayalam', isPhonk: false, genre: 'Mollywood', artist: song.artist };
  }

  // 5. English / International
  const isEnglish = (song.language || '').toLowerCase().includes('english') ||
    (song.language || '').toLowerCase().includes('international') ||
    (song.genre || '').toLowerCase().includes('pop') ||
    (song.genre || '').toLowerCase().includes('rock') ||
    (song.genre || '').toLowerCase().includes('hip-hop') ||
    (song.genre || '').toLowerCase().includes('edm') ||
    rawText.includes('billboard') ||
    rawText.includes('the weeknd') ||
    rawText.includes('taylor swift') ||
    rawText.includes('dua lipa') ||
    rawText.includes('drake') ||
    rawText.includes('ed sheeran');

  if (isEnglish && !rawText.includes('hindi') && !rawText.includes('bollywood') && !rawText.includes('arijit')) {
    return { language: 'International', isPhonk: false, genre: 'International', artist: song.artist };
  }

  // 6. Default: Hindi
  return { language: 'Hindi', isPhonk: false, genre: song.genre || 'Bollywood', artist: song.artist };
}

export function normalizeKey(str: string): string {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function normalizeArtist(str: string): string {
  return (str || '')
    .toLowerCase()
    .split(/[,&/]|feat\.|ft\.|with|\s+x\s+/i)[0]
    ?.trim() || '';
}

/**
 * Extracts clean core title without version/cover/remix/movie tags
 */
export function getCoreTitle(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/\(feat\..*?\)/gi, '')
    .replace(/\(with.*?\)/gi, '')
    .replace(/\(from.*?\)/gi, '')
    .replace(/\[feat\..*?\]/gi, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\s*-\s*(from|soundtrack|ost|remix|acoustic|remastered|live|original|radio edit|deluxe|version|slowed|reverb|lofi|cover|reprise|unplugged|male|female|duet|mix|edit).*$/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Checks if two song titles are essentially the same song (covers, remixes, edits).
 */
export function isSameOrSimilarTitle(titleA: string, titleB: string): boolean {
  const coreA = getCoreTitle(titleA);
  const coreB = getCoreTitle(titleB);
  if (!coreA || !coreB) return false;
  if (coreA === coreB) return true;
  if (coreA.length >= 4 && coreB.length >= 4) {
    if (coreA.includes(coreB) || coreB.includes(coreA)) return true;
  }
  return false;
}

export function isPhonkSong(song: Song): boolean {
  const text = `${song.title} ${song.artist} ${song.genre || ''}`.toLowerCase();
  return text.includes('phonk') || text.includes('drift') || text.includes('brazilian') ||
    text.includes('kordhell') || text.includes('gvrido') || text.includes('interworld') ||
    text.includes('playaphonk') || text.includes('dxrk') || text.includes('cursed evil');
}

class SmartRecommendationEngineService {
  private preloadedTrackCache: Map<string, { song: Song; ts: number }> = new Map();

  /**
   * Generates a ranked list of recommended songs for Smart AutoPlay
   * with strict music context & language continuity.
   */
  async getSmartNextTracks(
    currentSong: Song | null,
    count = 5,
    context: RecommendationContext = {}
  ): Promise<Song[]> {
    const musicCtx = classifySongContext(currentSong);
    const targetLanguage = musicCtx.language;
    const isPhonk = musicCtx.isPhonk;

    const existingQueue = context.queue || [];
    const recentSongs = context.recentlyPlayed || [];
    const favorites = context.favorites || [];

    // ── 0. Collect Known / Played Songs & Blacklists ─────────────────────────
    const playedSongIds = userProfileTracker.getAllKnownPlayedSongIds();
    const knownCoreTitles = new Set<string>();

    recentSongs.forEach((s) => {
      if (s?.id) playedSongIds.add(s.id);
      const c = getCoreTitle(s.title);
      if (c) knownCoreTitles.add(c);
    });

    favorites.forEach((s) => {
      if (s?.id) playedSongIds.add(s.id);
      const c = getCoreTitle(s.title);
      if (c) knownCoreTitles.add(c);
    });

    // Core titles & IDs currently in queue or currently playing (NEVER repeat)
    const blacklistedCoreTitles = new Set<string>();
    const blacklistedIds = new Set<string>();

    if (currentSong) {
      blacklistedIds.add(currentSong.id);
      const currentCore = getCoreTitle(currentSong.title);
      if (currentCore) blacklistedCoreTitles.add(currentCore);
    }

    existingQueue.forEach((s) => {
      blacklistedIds.add(s.id);
      const core = getCoreTitle(s.title);
      if (core) blacklistedCoreTitles.add(core);
    });

    const candidatePool: Song[] = [];

    // ── 1. Dynamic Query Generation with User Taste Integration ─────────────
    const topTasteArtists = userProfileTracker.getTopArtists(5);

    if (isPhonk) {
      // Strictly Phonk queries
      const phonkQueries = [
        `${musicCtx.artist} phonk`,
        'Drift Phonk viral hits 2025 2026',
        'Brazilian Phonk drift bass',
        'Aggressive Phonk playlist club',
        'Phonk dark night music',
      ];
      const searchPromises = phonkQueries.map(async (q) => {
        const [ytRes, sRes] = await Promise.allSettled([
          searchYouTubeMusic(q, 10),
          searchJioSaavn(q, 8),
        ]);
        const ySongs = ytRes.status === 'fulfilled' ? ytRes.value.songs : [];
        const sSongs = sRes.status === 'fulfilled' ? sRes.value.songs : [];
        return [...ySongs, ...sSongs];
      });
      const results = await Promise.all(searchPromises);
      candidatePool.push(...results.flat().filter(isPhonkSong));
    } else if (targetLanguage.toLowerCase() === 'bhojpuri') {
      // Strictly Bhojpuri queries tailored to user taste & current song
      const primaryArtist = normalizeArtist(currentSong?.artist || 'Pawan Singh');
      const bhojpuriTasteArtist = topTasteArtists.find((a) => a && a !== primaryArtist) || 'Khesari Lal Yadav';

      const bhojpuriQueries = [
        `${primaryArtist} new bhojpuri song`,
        `${bhojpuriTasteArtist} top bhojpuri hits 2025 2026`,
        'Top Bhojpuri chartbusters 2025 2026',
        'Bhojpuri superhit dance songs viral',
        'Bhojpuri romantic melody hits',
      ];
      const searchPromises = bhojpuriQueries.map(async (q) => {
        const [sRes, ytRes] = await Promise.allSettled([
          searchJioSaavn(q, 14),
          searchYouTubeMusic(q, 10),
        ]);
        const sSongs = sRes.status === 'fulfilled' ? sRes.value.songs : [];
        const ytSongs = ytRes.status === 'fulfilled' ? ytRes.value.songs : [];
        return [...sSongs, ...ytSongs];
      });
      const results = await Promise.all(searchPromises);
      candidatePool.push(...results.flat().filter((s) => isSongMatchingLanguage(s, 'Bhojpuri')));
    } else if (targetLanguage.toLowerCase() === 'hindi') {
      // Strictly Hindi queries tailored to user taste & current song
      const primaryArtist = normalizeArtist(currentSong?.artist || 'Arijit Singh');
      const hindiTasteArtist = topTasteArtists.find((a) => a && a !== primaryArtist) || 'Arijit Singh';

      const hindiQueries = [
        `${primaryArtist} latest songs`,
        `${hindiTasteArtist} superhit Bollywood songs`,
        'Bollywood Hindi romantic hits 2025 2026',
        'Latest Hindi chartbusters trending 2025',
        'Top Bollywood melodies trending',
      ];
      const searchPromises = hindiQueries.map(async (q) => {
        const [sRes, ytRes] = await Promise.allSettled([
          searchJioSaavn(q, 14),
          searchYouTubeMusic(q, 10),
        ]);
        const sSongs = sRes.status === 'fulfilled' ? sRes.value.songs : [];
        const ytSongs = ytRes.status === 'fulfilled' ? ytRes.value.songs : [];
        return [...sSongs, ...ytSongs];
      });
      const results = await Promise.all(searchPromises);
      candidatePool.push(...results.flat().filter((s) => isSongMatchingLanguage(s, 'Hindi')));
    } else if (targetLanguage.toLowerCase() === 'punjabi') {
      // Strictly Punjabi queries tailored to user taste & current song
      const primaryArtist = normalizeArtist(currentSong?.artist || 'Diljit Dosanjh');
      const punjabiTasteArtist = topTasteArtists.find((a) => a && a !== primaryArtist) || 'Karan Aujla';

      const punjabiQueries = [
        `${primaryArtist} latest punjabi song`,
        `${punjabiTasteArtist} punjabi hits 2025`,
        'Latest Punjabi chartbusters 2025 2026',
        'Trending Punjabi hits viral',
      ];
      const searchPromises = punjabiQueries.map(async (q) => {
        const [sRes, ytRes] = await Promise.allSettled([
          searchJioSaavn(q, 14),
          searchYouTubeMusic(q, 10),
        ]);
        const sSongs = sRes.status === 'fulfilled' ? sRes.value.songs : [];
        const ytSongs = ytRes.status === 'fulfilled' ? ytRes.value.songs : [];
        return [...sSongs, ...ytSongs];
      });
      const results = await Promise.all(searchPromises);
      candidatePool.push(...results.flat().filter((s) => isSongMatchingLanguage(s, 'Punjabi')));
    } else {
      // Strict other language queries (Tamil, Telugu, International)
      const primaryArtist = normalizeArtist(currentSong?.artist || '');
      const query = primaryArtist ? `${primaryArtist} ${targetLanguage} songs` : `${targetLanguage} top hits 2025 2026`;
      const [sRes, ytRes] = await Promise.allSettled([
        searchJioSaavn(query, 16),
        searchYouTubeMusic(query, 12),
      ]);
      const sSongs = sRes.status === 'fulfilled' ? sRes.value.songs : [];
      const ytSongs = ytRes.status === 'fulfilled' ? ytRes.value.songs : [];
      candidatePool.push(...[...sSongs, ...ytSongs].filter((s) => isSongMatchingLanguage(s, targetLanguage)));
    }

    // ── 2. Add Library/Favorites as Low-Priority Fallbacks ONLY ──────────────
    const matchingFavorites = favorites.filter((s) => {
      if (isPhonk) return isPhonkSong(s);
      return isSongMatchingLanguage(s, targetLanguage);
    });
    candidatePool.push(...matchingFavorites.slice(0, 4));

    const matchingRecent = recentSongs.filter((s) => {
      if (isPhonk) return isPhonkSong(s);
      return isSongMatchingLanguage(s, targetLanguage);
    });
    candidatePool.push(...matchingRecent.slice(0, 4));

    // ── 3. Strict Candidate Filtering & Duplicate Removal ───────────────────
    const validCandidates = deduplicateSongs(candidatePool).filter((song) => {
      if (!song || !song.title) return false;
      if (blacklistedIds.has(song.id)) return false;

      const candidateCore = getCoreTitle(song.title);
      if (!candidateCore) return false;

      // 1. Strict duplicate / same-title check against current song
      if (currentSong && isSameOrSimilarTitle(song.title, currentSong.title)) {
        return false;
      }

      // 2. Blacklist check (queue & current tracks)
      if (blacklistedCoreTitles.has(candidateCore)) {
        return false;
      }

      // 3. Strict language / genre context gate
      if (isPhonk) {
        if (!isPhonkSong(song)) return false;
      } else {
        if (!isSongMatchingLanguage(song, targetLanguage)) return false;
      }

      // 4. Disqualify tracks user repeatedly skips
      if (userProfileTracker.isFrequentlySkipped(song)) {
        return false;
      }

      return true;
    });

    const spotifyVerifiedCandidates = await filterSpotifyAvailableTracks(validCandidates);

    // ── 4. AI Taste & Freshness Scoring Algorithm ───────────────────────────
    const currentArtistNorm = currentSong ? normalizeArtist(currentSong.artist) : '';
    const currentMood = aiTasteProfileEngine.getCurrentContextualMood();
    const aiTopArtists = aiTasteProfileEngine.getProfile().topArtists;

    const scored = spotifyVerifiedCandidates.map((song) => {
      let score = 50; // base score
      const songArtistNorm = normalizeArtist(song.artist);
      const songCore = getCoreTitle(song.title);

      // Freshness check: Is this song unplayed / not in library history?
      const isFresh = !playedSongIds.has(song.id) && (!songCore || !knownCoreTitles.has(songCore));

      if (isFresh) {
        score += 80; // Massive Freshness Priority Boost!
      } else {
        score -= 50; // Previously known / played song penalty
      }

      // User Taste Alignment: Artist Affinity from UserProfileTracker
      const artistTasteScore = userProfileTracker.getArtistTasteScore(song.artist);
      score += artistTasteScore; // 0 to 50 points

      // User Taste Alignment: AI Taste Profile Engine Top Artists
      if (aiTopArtists[songArtistNorm]) {
        score += Math.min(30, aiTopArtists[songArtistNorm].score * 3);
      }

      // Mood / Vibe Alignment with current listening context
      const songMood = inferSongMood(song);
      if (songMood === currentMood && songMood !== 'neutral') {
        score += 15;
      }

      // Same Artist Boost (different track)
      if (currentArtistNorm && songArtistNorm === currentArtistNorm) {
        score += 20;
      }

      // User Affinity Score from Tracker
      const affinityScore = userProfileTracker.calculateAffinityScore(song);
      score += affinityScore;

      // Popularity signal
      score += Math.min(20, (song.popularity || 70) * 0.2);

      return { song, score, isFresh };
    });

    // ── 5. Partition Selection: Fresh Songs First, Fallback to Known ────────
    const freshScored = scored.filter((item) => item.isFresh).sort((a, b) => b.score - a.score);
    const knownScored = scored.filter((item) => !item.isFresh).sort((a, b) => b.score - a.score);

    const selected: Song[] = [];
    const selectedCoreTitles = new Set<string>();
    let lastSelectedArtist = currentArtistNorm;

    // First pass: Pick fresh unplayed songs with artist diversity
    for (const item of freshScored) {
      const art = normalizeArtist(item.song.artist);
      const core = getCoreTitle(item.song.title);

      if (selectedCoreTitles.has(core)) continue;
      if (art && art === lastSelectedArtist && selected.length > 0) continue;

      selected.push(item.song);
      selectedCoreTitles.add(core);
      lastSelectedArtist = art;

      if (selected.length >= count) break;
    }

    // Second pass on fresh songs if diversity filter was too strict
    if (selected.length < count) {
      for (const item of freshScored) {
        const core = getCoreTitle(item.song.title);
        if (selectedCoreTitles.has(core)) continue;

        selected.push(item.song);
        selectedCoreTitles.add(core);

        if (selected.length >= count) break;
      }
    }

    // Third pass: ONLY if fresh songs are not available, fall back to best known tracks
    if (selected.length < count) {
      for (const item of knownScored) {
        const core = getCoreTitle(item.song.title);
        if (selectedCoreTitles.has(core)) continue;

        selected.push(item.song);
        selectedCoreTitles.add(core);

        if (selected.length >= count) break;
      }
    }

    // Preload top recommended song's full audio stream in background
    if (selected.length > 0) {
      this.preloadNextTrackStream(selected[0]).catch(() => {});
    }

    return selected;
  }

  /**
   * Generates "Made For You" personalized tracklist based on user's highest taste affinities.
   */
  async getPersonalizedMadeForYou(context: RecommendationContext = {}): Promise<Song[]> {
    const favorites = context.favorites || [];
    const recent = context.recentlyPlayed || [];
    const topArtists = userProfileTracker.getTopArtists(4);

    const queries: string[] = [];
    if (topArtists.length > 0) {
      queries.push(`${topArtists[0]} superhits`, `${topArtists.slice(0, 2).join(' ')} best songs`);
    } else {
      queries.push('Bollywood Trending Superhits', 'Global Top Hits 2025');
    }

    const songs: Song[] = [...favorites.slice(0, 6), ...recent.slice(0, 4)];
    for (const q of queries) {
      try {
        const res = await searchJioSaavn(q, 10);
        songs.push(...res.songs);
      } catch {}
    }

    return deduplicateSongs(songs).slice(0, 20);
  }

  /**
   * Generates "Because You Listened To [Artist / Song]" contextual similarity shelf.
   */
  async getBecauseYouListenedTo(context: RecommendationContext = {}): Promise<{ seedSong: Song | null; title: string; subtitle: string; songs: Song[] } | null> {
    const recent = context.recentlyPlayed || [];
    const favorites = context.favorites || [];
    const seedSong = recent[0] || favorites[0] || null;

    if (!seedSong) return null;

    const query = `${seedSong.artist} similar songs top hits`;
    let songs: Song[] = [];
    try {
      const res = await searchJioSaavn(query, 16);
      songs = res.songs.filter((s) => s.id !== seedSong.id);
    } catch {}

    if (songs.length === 0) {
      try {
        const res = await searchJioSaavn(`${seedSong.artist} hits`, 16);
        songs = res.songs.filter((s) => s.id !== seedSong.id);
      } catch {}
    }

    return {
      seedSong,
      title: `Because you listened to ${seedSong.title}`,
      subtitle: `Similar tracks inspired by ${seedSong.artist}`,
      songs: deduplicateSongs(songs).slice(0, 15),
    };
  }

  /**
   * Generates "Discover Something New" shelf for fresh exploration outside immediate history.
   */
  async getDiscoverSomethingNew(languages: string[] = ['Hindi', 'International']): Promise<Song[]> {
    const lang = languages[0] || 'Hindi';
    const discoveryQueries = [
      `${lang} Fresh New Discoveries 2025`,
      `${lang} Indie Acoustic Underground Hits`,
      'Viral Underground Tracks 2025',
    ];

    const songs: Song[] = [];
    for (const q of discoveryQueries) {
      try {
        const res = await searchJioSaavn(q, 8);
        songs.push(...res.songs);
      } catch {}
    }

    return deduplicateSongs(songs).slice(0, 15);
  }

  /**
   * Generates dynamic personalized Home sections based on actual user listening behavior
   * (e.g. "Top Bhojpuri Hits" when listening to Bhojpuri, top artist mixes, or genre styles).
   */
  async getLearnedBehaviorSections(
    context: RecommendationContext = {},
    _defaultLanguages: string[] = []
  ): Promise<{ id: string; title: string; subtitle: string; badge?: string; songs: Song[] }[]> {
    const recent = context.recentlyPlayed || [];
    const favorites = context.favorites || [];
    const allInteractionTracks = deduplicateSongs([...recent, ...favorites]);

    if (allInteractionTracks.length === 0) {
      return [];
    }

    const dynamicSections: { id: string; title: string; subtitle: string; badge?: string; songs: Song[] }[] = [];

    // 1. Language behavior signals analysis
    const langCounts: Record<string, number> = {};
    for (const song of allInteractionTracks) {
      const ctx = classifySongContext(song);
      if (ctx.language) {
        langCounts[ctx.language] = (langCounts[ctx.language] || 0) + 1;
      }
    }

    // Languages to dynamically promote when user listens frequently
    const candidateLangs = ['Bhojpuri', 'Punjabi', 'Haryanvi', 'Tamil', 'Telugu', 'Phonk', 'Bengali', 'Marathi', 'Gujarati'];
    for (const lang of candidateLangs) {
      const count = langCounts[lang] || 0;
      // Only generate if user actually listens to it (at least 2 plays/interactions)
      if (count >= 2) {
        const query = lang === 'Phonk'
          ? 'Drift Phonk viral hits 2025'
          : `${lang} superhits top songs 2025`;
        try {
          const res = await searchJioSaavn(query, 16);
          const uniqueTracks = deduplicateSongs(res.songs);
          if (uniqueTracks.length > 0) {
            dynamicSections.push({
              id: `dynamic_lang_${lang.toLowerCase()}`,
              title: lang === 'Phonk' ? 'Top Phonk Drift Mix' : `Top ${lang} Hits`,
              subtitle: `Because you frequently listen to ${lang} music`,
              badge: 'For You',
              songs: uniqueTracks.slice(0, 16),
            });
          }
        } catch {}
      }
    }

    // 2. Top Artist behavior signals analysis
    const topArtists = userProfileTracker.getTopArtists(3);
    for (const artist of topArtists) {
      if (!artist) continue;
      try {
        const res = await searchJioSaavn(`${artist} best songs superhits`, 16);
        const uniqueTracks = deduplicateSongs(res.songs);
        if (uniqueTracks.length >= 4) {
          const capitalizedArtist = artist.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          dynamicSections.push({
            id: `dynamic_artist_${artist.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`,
            title: `Best of ${capitalizedArtist}`,
            subtitle: `Because you love ${capitalizedArtist}`,
            badge: 'Artist Mix',
            songs: uniqueTracks.slice(0, 16),
          });
        }
      } catch {}
    }

    return dynamicSections;
  }

  /**
   * Preloads and resolves the 320kbps full stream for the next track
   */
  async preloadNextTrackStream(song: Song): Promise<void> {
    if (!song) return;
    if (this.preloadedTrackCache.has(song.id)) return;

    try {
      if (!song.previewUrl || !song.previewUrl.includes('saavncdn.com')) {
        const fullTrack = await resolveFullTrack(song.title, song.artist, 'high', song.duration);
        if (fullTrack && fullTrack.streamUrl) {
          song.previewUrl = fullTrack.streamUrl;
          if (fullTrack.duration > 0) song.duration = fullTrack.duration;
          if (fullTrack.artwork && !song.artwork) {
            song.artwork = fullTrack.artwork;
            song.artworkLg = fullTrack.artwork;
          }
        }
      }

      if (song.previewUrl && song.previewUrl.startsWith('http')) {
        const preloadAudio = new Audio();
        preloadAudio.preload = 'auto';
        preloadAudio.src = song.previewUrl;
        this.preloadedTrackCache.set(song.id, { song, ts: Date.now() });
      }
    } catch {
      // ignore
    }
  }

  /**
   * Gets the single best next track for Smart AutoPlay.
   */
  async getNextSong(currentSong: Song | null, context: RecommendationContext = {}): Promise<Song | null> {
    const list = await this.getSmartNextTracks(currentSong, 1, context);
    return list[0] || null;
  }
}

export const smartRecommendationEngine = new SmartRecommendationEngineService();
