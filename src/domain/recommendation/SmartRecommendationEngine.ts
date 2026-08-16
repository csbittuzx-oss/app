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
import { isSongMatchingLanguage } from '../../data/repository/musicRepository';
import { filterSpotifyAvailableTracks } from '../../services/SpotifyAvailabilityService';

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

function normalizeKey(str: string): string {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeArtist(str: string): string {
  return (str || '')
    .toLowerCase()
    .split(/[,&/]|feat\.|ft\.|with|\s+x\s+/i)[0]
    ?.trim() || '';
}

/**
 * Extracts clean core title without version/cover/remix/movie tags
 */
function getCoreTitle(str: string): string {
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
function isSameOrSimilarTitle(titleA: string, titleB: string): boolean {
  const coreA = getCoreTitle(titleA);
  const coreB = getCoreTitle(titleB);
  if (!coreA || !coreB) return false;
  if (coreA === coreB) return true;
  if (coreA.length >= 4 && coreB.length >= 4) {
    if (coreA.includes(coreB) || coreB.includes(coreA)) return true;
  }
  return false;
}

function deduplicateSongs(songs: Song[]): Song[] {
  const seenIds = new Set<string>();
  const seenCoreKeys = new Set<string>();

  return songs.filter((s) => {
    if (!s || !s.title) return false;
    if (seenIds.has(s.id)) return false;

    const coreKey = `${getCoreTitle(s.title)}_${normalizeArtist(s.artist)}`;
    if (seenCoreKeys.has(coreKey)) return false;

    seenIds.add(s.id);
    seenCoreKeys.add(coreKey);
    return true;
  });
}

function isPhonkSong(song: Song): boolean {
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

    // Core titles & IDs that must NEVER be repeated
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

    recentSongs.slice(0, 15).forEach((s) => {
      blacklistedIds.add(s.id);
      const core = getCoreTitle(s.title);
      if (core) blacklistedCoreTitles.add(core);
    });

    const candidatePool: Song[] = [];

    // ── 1. Same Language / Genre Liked Songs (Priority 3) ────────────────────
    const matchingFavorites = favorites.filter((s) => {
      if (isPhonk) return isPhonkSong(s);
      return isSongMatchingLanguage(s, targetLanguage);
    });
    candidatePool.push(...matchingFavorites.slice(0, 8));

    // ── 2. Same Language / Genre Recently Played (Priority 4) ────────────────
    const matchingRecent = recentSongs.filter((s) => {
      if (isPhonk) return isPhonkSong(s);
      return isSongMatchingLanguage(s, targetLanguage);
    });
    candidatePool.push(...matchingRecent.slice(0, 8));

    // ── 3. Targeted Query Generation Based on Exact Context (Priority 2 & 5) ─
    if (isPhonk) {
      // Strictly Phonk queries
      const phonkQueries = [
        `${musicCtx.artist} phonk`,
        'Drift Phonk viral hits 2025',
        'Brazilian Phonk drift',
        'Aggressive Phonk playlist',
        'Phonk dark club music',
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
      // Strictly Bhojpuri queries
      const primaryArtist = normalizeArtist(currentSong?.artist || 'Pawan Singh');
      const bhojpuriQueries = [
        `${primaryArtist} bhojpuri songs`,
        'Top Bhojpuri hits 2025 2026',
        'Bhojpuri superhit dance songs',
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
      // Strictly Hindi queries
      const primaryArtist = normalizeArtist(currentSong?.artist || 'Arijit Singh');
      const hindiQueries = [
        `${primaryArtist} hit songs`,
        'Bollywood Hindi romantic hits 2025',
        'Latest Hindi superhit songs 2025',
        'Top Bollywood melodies',
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
      // Strictly Punjabi queries
      const primaryArtist = normalizeArtist(currentSong?.artist || 'Diljit Dosanjh');
      const punjabiQueries = [
        `${primaryArtist} punjabi songs`,
        'Latest Punjabi chartbusters 2025',
        'Trending Punjabi hits',
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
      const query = primaryArtist ? `${primaryArtist} ${targetLanguage} songs` : `${targetLanguage} top hits 2025`;
      const [sRes, ytRes] = await Promise.allSettled([
        searchJioSaavn(query, 16),
        searchYouTubeMusic(query, 12),
      ]);
      const sSongs = sRes.status === 'fulfilled' ? sRes.value.songs : [];
      const ytSongs = ytRes.status === 'fulfilled' ? ytRes.value.songs : [];
      candidatePool.push(...[...sSongs, ...ytSongs].filter((s) => isSongMatchingLanguage(s, targetLanguage)));
    }

    // ── 4. Strict Candidate Filtering & Isolation ───────────────────────────
    const validCandidates = deduplicateSongs(candidatePool).filter((song) => {
      if (!song || !song.title) return false;
      if (blacklistedIds.has(song.id)) return false;

      const candidateCore = getCoreTitle(song.title);
      if (!candidateCore) return false;

      // 1. Strict duplicate / same-title check against current song
      if (currentSong && isSameOrSimilarTitle(song.title, currentSong.title)) {
        return false;
      }

      // 2. Blacklist check (queue & recent tracks)
      if (blacklistedCoreTitles.has(candidateCore)) {
        return false;
      }

      // 3. Strict language / genre context gate
      if (isPhonk) {
        if (!isPhonkSong(song)) return false;
      } else {
        if (!isSongMatchingLanguage(song, targetLanguage)) return false;
      }

      // 4. Skip check (songs user repeatedly skips)
      if (userProfileTracker.isFrequentlySkipped(song)) {
        return false;
      }

      return true;
    });

    const spotifyVerifiedCandidates = await filterSpotifyAvailableTracks(validCandidates);

    // ── 5. Scoring & Ranking Algorithm ──────────────────────────────────────
    const currentArtistNorm = currentSong ? normalizeArtist(currentSong.artist) : '';

    const scored = spotifyVerifiedCandidates.map((song) => {
      let score = 50; // base score
      const songArtistNorm = normalizeArtist(song.artist);

      // Same artist boost
      if (currentArtistNorm && songArtistNorm === currentArtistNorm) {
        score += 30;
      }

      // User affinity score from profile tracker
      const affinityScore = userProfileTracker.calculateAffinityScore(song);
      score += affinityScore;

      // Liked Song boost
      const isLiked = favorites.some((f) => f.id === song.id || normalizeKey(f.title) === normalizeKey(song.title));
      if (isLiked) score += 25;

      return { song, score };
    });

    scored.sort((a, b) => b.score - a.score);

    // ── 6. Enforce Artist Diversity in Output Sequence ──────────────────────
    const selected: Song[] = [];
    const selectedCoreTitles = new Set<string>();
    let lastSelectedArtist = currentArtistNorm;

    for (const item of scored) {
      const art = normalizeArtist(item.song.artist);
      const core = getCoreTitle(item.song.title);

      if (selectedCoreTitles.has(core)) continue;

      if (art && art === lastSelectedArtist && selected.length > 0) {
        continue;
      }

      selected.push(item.song);
      selectedCoreTitles.add(core);
      lastSelectedArtist = art;

      if (selected.length >= count) break;
    }

    if (selected.length < count) {
      for (const item of scored) {
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
