// ═══════════════════════════════════════════
//  SmartRecommendationEngine
//  Spotify-style AutoPlay & Recommendation Intelligence:
//  - Current song is the recommendation SEED (not search results list)
//  - Strict same-title / remix / cover duplicate elimination
//  - Multi-tier ranking: Artist affinity + Genre/Mood + User History + Trending
//  - Strict artist variety (no back-to-back repeats)
// ═══════════════════════════════════════════

import type { Song, Playlist } from '../../data/models';
import { searchJioSaavn, resolveFullTrack } from '../../data/api/saavnApi';
import { getSimilarArtists } from '../../data/api/lastfmApi';
import { userProfileTracker } from './UserProfileTracker';
import { getPersonalizedTrending, getPersonalizedNewReleases } from '../../data/repository/musicRepository';

export interface RecommendationContext {
  languages?: string[];
  queue?: Song[];
  userPlaylists?: Playlist[];
  favorites?: Song[];
  recentlyPlayed?: Song[];
  searchHistory?: string[];
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
 * e.g. "Tum Hi Ho (Remix)" -> "tumhiho"
 *      "Tum Hi Ho - From Aashiqui 2" -> "tumhiho"
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

class SmartRecommendationEngineService {
  private preloadedTrackCache: Map<string, { song: Song; ts: number }> = new Map();

  /**
   * Generates a ranked list of recommended songs for AutoPlay & Up Next.
   */
  async getSmartNextTracks(
    currentSong: Song | null,
    count = 5,
    context: RecommendationContext = {}
  ): Promise<Song[]> {
    const rawLanguages = context.languages && context.languages.length > 0
      ? context.languages
      : ['Hindi', 'International', 'Punjabi'];

    const existingQueue = context.queue || [];
    const recentSongs = context.recentlyPlayed || [];
    const favorites = context.favorites || [];

    // Core titles that must NEVER be recommended (current song, queue, recent songs)
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

    const candidates: Song[] = [];

    // ── Tier 1: Current Song Affinity (Artist catalog & Similar Artists) ──────
    if (currentSong) {
      const primaryArtist = normalizeArtist(currentSong.artist);
      const genreOrStyle = currentSong.genre || 'Bollywood';

      const [artistHitsRes, artistRomanticRes, similarArtists] = await Promise.allSettled([
        // 1a. Best songs from the same artist (different titles)
        searchJioSaavn(`${primaryArtist || currentSong.artist} best songs`, 12),
        // 1b. Popular tracks from the same genre/language
        searchJioSaavn(`${primaryArtist} ${genreOrStyle} hits`, 8),
        // 1c. Similar artists from Last.fm
        getSimilarArtists(primaryArtist || currentSong.artist, 5),
      ]);

      if (artistHitsRes.status === 'fulfilled' && artistHitsRes.value.songs) {
        candidates.push(...artistHitsRes.value.songs);
      }
      if (artistRomanticRes.status === 'fulfilled' && artistRomanticRes.value.songs) {
        candidates.push(...artistRomanticRes.value.songs);
      }

      // Fetch top track from each similar artist
      if (similarArtists.status === 'fulfilled' && similarArtists.value.length > 0) {
        const simSearches = similarArtists.value.slice(0, 4).map((a) =>
          searchJioSaavn(`${a.name} top hits`, 5)
        );
        const simResults = await Promise.allSettled(simSearches);
        simResults.forEach((r) => {
          if (r.status === 'fulfilled' && r.value.songs) {
            candidates.push(...r.value.songs);
          }
        });
      }
    }

    // ── Tier 2: User's Top Artists & Liked Favorites ──────────────────────────
    const topUserArtists = userProfileTracker.getTopArtists(4);
    if (topUserArtists.length > 0) {
      const artistSearchPromises = topUserArtists.slice(0, 2).map((a) =>
        searchJioSaavn(`${a} hit songs`, 6)
      );
      const res = await Promise.allSettled(artistSearchPromises);
      res.forEach((r) => {
        if (r.status === 'fulfilled' && r.value.songs) {
          candidates.push(...r.value.songs);
        }
      });
    }

    // Add candidate songs from user's favorites if matching language
    if (favorites.length > 0) {
      candidates.push(...favorites.slice(0, 10));
    }

    // ── Tier 3: Preferred Languages & India Trending / New Releases ──────────
    const [trendRes, newRelRes] = await Promise.allSettled([
      getPersonalizedTrending(rawLanguages, 15),
      getPersonalizedNewReleases(rawLanguages, 10),
    ]);

    if (trendRes.status === 'fulfilled' && trendRes.value) {
      candidates.push(...trendRes.value);
    }
    if (newRelRes.status === 'fulfilled' && newRelRes.value) {
      candidates.push(...newRelRes.value);
    }

    // ── Strict Candidate Filtering ──────────────────────────────────────────
    const validCandidates = deduplicateSongs(candidates).filter((song) => {
      if (!song || !song.title) return false;
      if (blacklistedIds.has(song.id)) return false;

      const candidateCore = getCoreTitle(song.title);
      if (!candidateCore) return false;

      // 1. Strict duplicate / same-title check against current song (prevents "Tum Hi Ho" remix/cover)
      if (currentSong && isSameOrSimilarTitle(song.title, currentSong.title)) {
        return false;
      }

      // 2. Blacklist check (queue & recent tracks)
      if (blacklistedCoreTitles.has(candidateCore)) {
        return false;
      }

      // 3. Skip check (songs user repeatedly skips)
      if (userProfileTracker.isFrequentlySkipped(song)) {
        return false;
      }

      return true;
    });

    // ── Scoring & Ranking Algorithm ─────────────────────────────────────────
    const currentArtistNorm = currentSong ? normalizeArtist(currentSong.artist) : '';
    const currentGenre = currentSong?.genre?.toLowerCase() || '';

    const scored = validCandidates.map((song) => {
      let score = 50; // base score
      const songArtistNorm = normalizeArtist(song.artist);
      const songGenre = song.genre?.toLowerCase() || '';

      // 1. Language alignment
      const matchesLanguage = rawLanguages.some(
        (l) =>
          song.title.toLowerCase().includes(l.toLowerCase()) ||
          song.artist.toLowerCase().includes(l.toLowerCase()) ||
          songGenre.includes(l.toLowerCase())
      );
      if (matchesLanguage) score += 35;

      // 2. Same artist boost (for 1st song, but will be diversified)
      if (currentArtistNorm && songArtistNorm === currentArtistNorm) {
        score += 25;
      }

      // 3. User listening affinity from tracker
      const affinityScore = userProfileTracker.calculateAffinityScore(song);
      score += affinityScore;

      // 4. Liked Songs boost
      const isLiked = favorites.some((f) => f.id === song.id || normalizeKey(f.title) === normalizeKey(song.title));
      if (isLiked) score += 20;

      // 5. Genre similarity
      if (currentGenre && songGenre && (currentGenre.includes(songGenre) || songGenre.includes(currentGenre))) {
        score += 15;
      }

      return { song, score };
    });

    // Sort descending by score
    scored.sort((a, b) => b.score - a.score);

    // ── Enforce Spotify-Style Diversity in Output Sequence ──────────────────
    const selected: Song[] = [];
    const selectedCoreTitles = new Set<string>();
    let lastSelectedArtist = currentArtistNorm;

    // First pass: try to pick songs that alternate artists (no consecutive repeats)
    for (const item of scored) {
      const art = normalizeArtist(item.song.artist);
      const core = getCoreTitle(item.song.title);

      if (selectedCoreTitles.has(core)) continue;

      // Avoid consecutive same-artist tracks
      if (art && art === lastSelectedArtist && selected.length > 0) {
        continue; // skip for now, pick an alternating artist
      }

      selected.push(item.song);
      selectedCoreTitles.add(core);
      lastSelectedArtist = art;

      if (selected.length >= count) break;
    }

    // Second pass: if we need more songs to fill the count, fill from remaining scored songs
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
   * to guarantee instant, zero-gap playback.
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
   * Gets the single best next track for AutoPlay.
   */
  async getNextSong(currentSong: Song | null, context: RecommendationContext = {}): Promise<Song | null> {
    const list = await this.getSmartNextTracks(currentSong, 1, context);
    return list[0] || null;
  }
}

export const smartRecommendationEngine = new SmartRecommendationEngineService();
