// ═══════════════════════════════════════════
//  CuratedPlaylistsService
//  Builds Spotify-style rich curated playlist shelves:
//  1. More Like What You Like
//  2. Jump Back In
//  3. Happy
//  4. Party
//  5. Throwback
//  6. Bhojpuri Hits (or language specific)
//  7. Recommendations For Today
//  With strict language separation & deep 25-40 song track lists.
// ═══════════════════════════════════════════

import type { Song, Playlist } from '../data/models';
import { isSongMatchingLanguage, sortByPopularityAndTrending, deduplicateSongs } from '../data/repository/musicRepository';
import { searchJioSaavn } from '../data/api/saavnApi';
import { searchYouTubeMusic } from '../data/api/youtubeMusicApi';
import { userProfileTracker } from '../domain/recommendation/UserProfileTracker';
import { filterSpotifyAvailableTracks } from './SpotifyAvailabilityService';

const CURATED_CACHE_KEY = 'sw_curated_playlists_cache';
const SHELVES_CACHE_KEY = 'sw_curated_shelves_cache';

export interface PlaylistShelfData {
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
  playlists: Playlist[];
}

const THEME_ARTWORKS = {
  // More Like What You Like
  more_like_1: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80',
  more_like_2: 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=500&auto=format&fit=crop&q=80',
  more_like_3: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=500&auto=format&fit=crop&q=80',
  more_like_4: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=500&auto=format&fit=crop&q=80',

  // Jump Back In
  jump_1: 'https://images.unsplash.com/photo-1484876065684-b683cf17d276?w=500&auto=format&fit=crop&q=80',
  jump_2: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=500&auto=format&fit=crop&q=80',
  jump_3: 'https://images.unsplash.com/photo-1447430617419-95715602278e?w=500&auto=format&fit=crop&q=80',
  jump_4: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=500&auto=format&fit=crop&q=80',

  // Happy
  happy_1: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500&auto=format&fit=crop&q=80',
  happy_2: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=500&auto=format&fit=crop&q=80',
  happy_3: 'https://images.unsplash.com/photo-1506157786151-b8491531f063?w=500&auto=format&fit=crop&q=80',
  happy_4: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=500&auto=format&fit=crop&q=80',

  // Party
  party_1: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&auto=format&fit=crop&q=80',
  party_2: 'https://images.unsplash.com/photo-1545128485-c400e7702796?w=500&auto=format&fit=crop&q=80',
  party_3: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=500&auto=format&fit=crop&q=80',
  party_4: 'https://images.unsplash.com/photo-1496337589254-7e19d01cec44?w=500&auto=format&fit=crop&q=80',

  // Throwback
  throwback_1: 'https://images.unsplash.com/photo-1487180144351-b8472da7d491?w=500&auto=format&fit=crop&q=80',
  throwback_2: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=500&auto=format&fit=crop&q=80',
  throwback_3: 'https://images.unsplash.com/photo-1508700929628-666bc8bd84ea?w=500&auto=format&fit=crop&q=80',
  throwback_4: 'https://images.unsplash.com/photo-1520523839898-50712825e3a7?w=500&auto=format&fit=crop&q=80',

  // Bhojpuri Hits
  bhojpuri_1: 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=500&auto=format&fit=crop&q=80',
  bhojpuri_2: 'https://images.unsplash.com/photo-1516873240891-4bf014598ab4?w=500&auto=format&fit=crop&q=80',
  bhojpuri_3: 'https://images.unsplash.com/photo-1514533450685-4493e01d1fdc?w=500&auto=format&fit=crop&q=80',
  bhojpuri_4: 'https://images.unsplash.com/photo-1501612780327-45045538702b?w=500&auto=format&fit=crop&q=80',

  // Recommendations For Today
  rec_1: 'https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?w=500&auto=format&fit=crop&q=80',
  rec_2: 'https://images.unsplash.com/photo-1483412033650-1015ddeb83d1?w=500&auto=format&fit=crop&q=80',
  rec_3: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=500&auto=format&fit=crop&q=80',
  rec_4: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=500&auto=format&fit=crop&q=80',
};

/**
 * Resolves a guaranteed unique, high-quality artwork for a playlist card.
 * Avoids reusing duplicate album artworks across multiple playlists in the same shelf,
 * and skips generic studio logos (such as Saregama default logo, generic placeholders).
 */
function resolveUniquePlaylistArtwork(
  tracks: Song[],
  fallbackUrl: string,
  usedArtworks: Set<string>
): string {
  for (const track of tracks) {
    if (!track || !track.artwork) continue;
    const art = track.artwork.trim();
    if (!art || art.includes('placeholder')) continue;

    const normalized = art.split('?')[0].toLowerCase();
    
    // Ignore generic studio label logos / placeholders
    if (normalized.includes('saregama') && normalized.includes('soul')) continue;
    if (normalized.includes('default') || normalized.includes('blank')) continue;

    if (!usedArtworks.has(normalized)) {
      usedArtworks.add(normalized);
      return art;
    }
  }

  // Use the unique theme artwork fallback
  const fallbackNorm = fallbackUrl.split('?')[0].toLowerCase();
  usedArtworks.add(fallbackNorm);
  return fallbackUrl;
}

// In-memory lookup map for instant retrieval by playlist ID
const curatedPlaylistsMap = new Map<string, Playlist>();

export function getCuratedPlaylistById(id: string): Playlist | null {
  let pl: Playlist | null = null;
  if (curatedPlaylistsMap.has(id)) {
    pl = curatedPlaylistsMap.get(id) || null;
  } else {
    try {
      const raw = localStorage.getItem(CURATED_CACHE_KEY);
      if (raw) {
        const parsed: Record<string, Playlist> = JSON.parse(raw);
        if (parsed[id]) {
          pl = parsed[id];
          curatedPlaylistsMap.set(id, pl);
        }
      }
    } catch {}
  }
  if (pl) {
    const uniqueTracks = deduplicateSongs(pl.tracks);
    return {
      ...pl,
      tracks: uniqueTracks,
      totalDuration: uniqueTracks.reduce((acc, s) => acc + (s.duration || 0), 0),
    };
  }
  return null;
}

export function saveCuratedPlaylist(pl: Playlist) {
  curatedPlaylistsMap.set(pl.id, pl);
  try {
    const raw = localStorage.getItem(CURATED_CACHE_KEY);
    const parsed: Record<string, Playlist> = raw ? JSON.parse(raw) : {};
    parsed[pl.id] = pl;
    localStorage.setItem(CURATED_CACHE_KEY, JSON.stringify(parsed));
  } catch {}
}

export function getCachedShelves(languages?: string[]): PlaylistShelfData[] | null {
  try {
    const raw = localStorage.getItem(SHELVES_CACHE_KEY);
    if (raw) {
      const parsed: PlaylistShelfData[] = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        let valid = parsed;
        if (languages && languages.length > 0) {
          const hasBhojpuri = languages.some((l) => l.toLowerCase() === 'bhojpuri');
          const hasHindi = languages.some((l) => l.toLowerCase() === 'hindi');
          valid = parsed.filter((shelf) => {
            if (shelf.id === 'shelf_bhojpuri' && !hasBhojpuri) return false;
            if ((shelf.id === 'shelf_happy' || shelf.id === 'shelf_party' || shelf.id === 'shelf_throwback') && !hasHindi) return false;
            return true;
          });
        }
        valid.forEach((shelf) => {
          shelf.playlists.forEach((pl) => {
            curatedPlaylistsMap.set(pl.id, pl);
          });
        });
        return valid;
      }
    }
  } catch {}
  return null;
}

export function saveCachedShelves(shelves: PlaylistShelfData[]) {
  try {
    localStorage.setItem(SHELVES_CACHE_KEY, JSON.stringify(shelves));
    const plRecord: Record<string, Playlist> = {};
    shelves.forEach((shelf) => {
      shelf.playlists.forEach((pl) => {
        curatedPlaylistsMap.set(pl.id, pl);
        plRecord[pl.id] = pl;
      });
    });
    localStorage.setItem(CURATED_CACHE_KEY, JSON.stringify(plRecord));
  } catch {}
}

// ─── Deep Multi-Query Fetcher with Strict Language Isolation ─────────────────

async function fetchLanguageStrictPool(queries: string[], targetLang: string, minTarget = 30): Promise<Song[]> {
  const promises = queries.map(async (q) => {
    const [sRes, ytRes] = await Promise.allSettled([
      searchJioSaavn(q, 30),
      searchYouTubeMusic(q, 20),
    ]);
    const sSongs = sRes.status === 'fulfilled' ? sRes.value.songs : [];
    const ytSongs = ytRes.status === 'fulfilled' ? ytRes.value.songs : [];
    return [...sSongs, ...ytSongs];
  });

  const batches = await Promise.all(promises);
  const combined = deduplicateSongs(batches.flat());

  // Strictly filter by language classification & Spotify availability
  const filtered = combined.filter((song: Song) => isSongMatchingLanguage(song, targetLang));
  const verified = await filterSpotifyAvailableTracks(filtered);
  const ranked = sortByPopularityAndTrending(verified);
  return ranked.slice(0, Math.max(minTarget, 40));
}

// ─── Curated Shelves Generator ───────────────────────────────────────────────

interface ShelfSignals {
  languages: string[];
  favorites: Song[];
  recentlyPlayed: Song[];
  searchRecentlyPlayed: Song[];
  userPlaylists: Playlist[];
  topArtists: string[];
}

export async function generateSpotifyStyleShelves(signals: ShelfSignals): Promise<PlaylistShelfData[]> {
  const { languages, favorites, recentlyPlayed, searchRecentlyPlayed, userPlaylists } = signals;
  const validLangs = languages && languages.length > 0 ? languages : ['Hindi', 'International'];
  const hasBhojpuri = validLangs.some((l) => l.toLowerCase() === 'bhojpuri');

  // Top artists from signals or tracker
  const topArtists = signals.topArtists.length > 0
    ? signals.topArtists
    : userProfileTracker.getTopArtists(5);
  const primaryArtist = topArtists[0] || (favorites[0]?.artist) || 'Arijit Singh';
  const secondaryArtist = topArtists[1] || (recentlyPlayed[0]?.artist) || 'Pritam';

  // 1. Fetch Deep Track Pools with STRICT Language Separation
  const [
    hindiHappyPool,
    hindiPartyPool,
    hindiThrowbackPool,
    artistMixPool,
    chillAcousticPool,
    dailyMix1Pool,
    dailyMix2Pool,
    bhojpuriPool,
  ] = await Promise.allSettled([
    // Happy Hindi songs (strict Hindi)
    fetchLanguageStrictPool(
      ['Hindi happy feel good upbeat songs', 'Bollywood cheerful mood hits', 'Latest Hindi positive vibes songs'],
      'Hindi',
      40
    ),
    // Party Hindi songs (strict Hindi)
    fetchLanguageStrictPool(
      ['Hindi party dance club chartbusters 2025 2026', 'Bollywood DJ dance party songs', 'Latest Hindi dance club hits'],
      'Hindi',
      40
    ),
    // Throwback Hindi songs (strict Hindi)
    fetchLanguageStrictPool(
      ['90s Bollywood evergreen romantic Hindi classics', '2000s Hindi superhit melodies', 'Classic Bollywood nostalgia 90s'],
      'Hindi',
      40
    ),
    // Artist mix (strict artist language)
    fetchLanguageStrictPool(
      [`${primaryArtist} best songs hits`, `${primaryArtist} top tracks collection`, `${primaryArtist} latest hits`],
      'Hindi',
      35
    ),
    // Acoustic chill
    fetchLanguageStrictPool(
      ['Hindi acoustic unplugged songs', 'Soulful Bollywood acoustic melodies', 'Lo-Fi Hindi chill beats'],
      'Hindi',
      35
    ),
    // Daily Mix 1 & 2
    fetchLanguageStrictPool(
      [`${primaryArtist} songs`, 'Top Trending Hindi 2025', 'Bollywood Chartbusters'],
      'Hindi',
      35
    ),
    fetchLanguageStrictPool(
      [`${secondaryArtist} songs`, 'Latest Hindi Melodies 2025', 'Bollywood Love Songs'],
      'Hindi',
      35
    ),
    // Bhojpuri pool (strict Bhojpuri) - only fetched if user selected Bhojpuri during onboarding
    hasBhojpuri
      ? fetchLanguageStrictPool(
          ['Top Bhojpuri hits 2025 2026', 'Pawan Singh Khesari Lal Bhojpuri songs', 'Bhojpuri dance chartbusters', 'Bhojpuri romantic songs'],
          'Bhojpuri',
          40
        )
      : Promise.resolve([]),
  ]);

  const happyHindi = hindiHappyPool.status === 'fulfilled' ? hindiHappyPool.value : [];
  const partyHindi = hindiPartyPool.status === 'fulfilled' ? hindiPartyPool.value : [];
  const throwbackHindi = hindiThrowbackPool.status === 'fulfilled' ? hindiThrowbackPool.value : [];
  const artistMix = artistMixPool.status === 'fulfilled' ? artistMixPool.value : [];
  const chillAcoustic = chillAcousticPool.status === 'fulfilled' ? chillAcousticPool.value : [];
  const daily1 = dailyMix1Pool.status === 'fulfilled' ? dailyMix1Pool.value : [];
  const daily2 = dailyMix2Pool.status === 'fulfilled' ? dailyMix2Pool.value : [];
  const bhojpuriTracks = bhojpuriPool.status === 'fulfilled' ? bhojpuriPool.value : [];

  const usedArtworks = new Set<string>();

  // ───────────────────────────────────────────────────────────────────────────
  // 1. More Like What You Like Shelves (25-35 songs each)
  // ───────────────────────────────────────────────────────────────────────────
  const moreLikePlaylists: Playlist[] = [
    {
      id: 'curated_more_like_artist',
      title: `Mix: ${primaryArtist} & Similar`,
      description: 'Songs based on your listening',
      artwork: resolveUniquePlaylistArtwork(artistMix, THEME_ARTWORKS.more_like_1, usedArtworks),
      creator: 'Soundwave Curated',
      isUserCreated: false,
      tracks: artistMix.slice(0, 32),
      totalDuration: artistMix.slice(0, 32).reduce((acc, s) => acc + (s.duration || 0), 0),
    },
    {
      id: 'curated_more_like_chill',
      title: 'Acoustic & Unplugged',
      description: 'Soulful acoustic melodies & unplugged tracks',
      artwork: resolveUniquePlaylistArtwork(chillAcoustic, THEME_ARTWORKS.more_like_2, usedArtworks),
      creator: 'Soundwave Curated',
      isUserCreated: false,
      tracks: chillAcoustic.slice(0, 30),
      totalDuration: chillAcoustic.slice(0, 30).reduce((acc, s) => acc + (s.duration || 0), 0),
    },
    {
      id: 'curated_more_like_flow',
      title: 'Deep Flow & Lo-Fi',
      description: 'Relaxing beats and ambient focus sounds',
      artwork: resolveUniquePlaylistArtwork(chillAcoustic.slice(8), THEME_ARTWORKS.more_like_3, usedArtworks),
      creator: 'Soundwave Curated',
      isUserCreated: false,
      tracks: chillAcoustic.slice(10, 35),
      totalDuration: chillAcoustic.slice(10, 35).reduce((acc, s) => acc + (s.duration || 0), 0),
    },
    {
      id: 'curated_more_like_radar',
      title: 'Language Radar Mix',
      description: 'Trending songs based on your listening',
      artwork: resolveUniquePlaylistArtwork(happyHindi, THEME_ARTWORKS.more_like_4, usedArtworks),
      creator: 'Soundwave Curated',
      isUserCreated: false,
      tracks: happyHindi.slice(0, 30),
      totalDuration: happyHindi.slice(0, 30).reduce((acc, s) => acc + (s.duration || 0), 0),
    },
  ];

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Jump Back In Shelves (Based on listening history)
  // ───────────────────────────────────────────────────────────────────────────
  const jumpInBackCombined: Song[] = [];
  const seenJumpIds = new Set<string>();
  [...recentlyPlayed, ...searchRecentlyPlayed, ...favorites].forEach((s) => {
    if (!seenJumpIds.has(s.id)) {
      seenJumpIds.add(s.id);
      jumpInBackCombined.push(s);
    }
  });
  userPlaylists.forEach((pl) => {
    pl.tracks.forEach((s) => {
      if (!seenJumpIds.has(s.id)) {
        seenJumpIds.add(s.id);
        jumpInBackCombined.push(s);
      }
    });
  });

  const jumpBackInPlaylists: Playlist[] = [
    {
      id: 'curated_jump_recent_mix',
      title: 'Recently Played Mix',
      description: 'Resume your recent listening session',
      artwork: resolveUniquePlaylistArtwork(jumpInBackCombined, THEME_ARTWORKS.jump_1, usedArtworks),
      creator: 'Soundwave Personal',
      isUserCreated: false,
      tracks: jumpInBackCombined.slice(0, 30),
      totalDuration: jumpInBackCombined.slice(0, 30).reduce((acc, s) => acc + (s.duration || 0), 0),
    },
    {
      id: 'curated_jump_heavy_rotation',
      title: 'Heavy Rotation',
      description: 'Your most replayed songs & top picks',
      artwork: resolveUniquePlaylistArtwork(favorites.length > 0 ? favorites : jumpInBackCombined.slice(2), THEME_ARTWORKS.jump_2, usedArtworks),
      creator: 'Soundwave Personal',
      isUserCreated: false,
      tracks: favorites.length > 0 ? favorites.slice(0, 30) : happyHindi.slice(0, 25),
      totalDuration: (favorites.length > 0 ? favorites : happyHindi).slice(0, 30).reduce((acc, s) => acc + (s.duration || 0), 0),
    },
    {
      id: 'offline_backup_mix',
      title: 'Offline Backup Mix',
      description: 'Ready for offline listening anytime',
      artwork: resolveUniquePlaylistArtwork(jumpInBackCombined.slice(5), THEME_ARTWORKS.jump_3, usedArtworks),
      creator: 'Soundwave Offline',
      isUserCreated: false,
      tracks: jumpInBackCombined.slice(0, 25),
      totalDuration: jumpInBackCombined.slice(0, 25).reduce((acc, s) => acc + (s.duration || 0), 0),
    },
    {
      id: 'curated_jump_starred',
      title: 'Liked Songs Collection',
      description: 'All your starred favorite songs',
      artwork: resolveUniquePlaylistArtwork(favorites.slice(1), THEME_ARTWORKS.jump_4, usedArtworks),
      creator: 'Soundwave Personal',
      isUserCreated: false,
      tracks: favorites,
      totalDuration: favorites.reduce((acc, s) => acc + (s.duration || 0), 0),
    },
  ];

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Happy Mood Shelves (25-35 songs each, STRICT Hindi)
  // ───────────────────────────────────────────────────────────────────────────
  const happyPlaylists: Playlist[] = [
    {
      id: 'curated_happy_vibes',
      title: 'Happy Vibes',
      description: 'Feel-good Hindi songs to lift your mood',
      artwork: resolveUniquePlaylistArtwork(happyHindi, THEME_ARTWORKS.happy_1, usedArtworks),
      creator: 'Soundwave Curated',
      isUserCreated: false,
      tracks: happyHindi.slice(0, 32),
      totalDuration: happyHindi.slice(0, 32).reduce((acc, s) => acc + (s.duration || 0), 0),
    },
    {
      id: 'curated_happy_feel_good',
      title: 'Feel-Good Hits',
      description: 'Upbeat melodies and joyful rhythms',
      artwork: resolveUniquePlaylistArtwork(happyHindi.slice(4), THEME_ARTWORKS.happy_2, usedArtworks),
      creator: 'Soundwave Curated',
      isUserCreated: false,
      tracks: happyHindi.slice(6, 36),
      totalDuration: happyHindi.slice(6, 36).reduce((acc, s) => acc + (s.duration || 0), 0),
    },
    {
      id: 'curated_happy_morning',
      title: 'Morning Sunshine',
      description: 'Bright acoustic anthems to start your day',
      artwork: resolveUniquePlaylistArtwork(happyHindi.slice(8), THEME_ARTWORKS.happy_3, usedArtworks),
      creator: 'Soundwave Curated',
      isUserCreated: false,
      tracks: happyHindi.slice(10, 38),
      totalDuration: happyHindi.slice(10, 38).reduce((acc, s) => acc + (s.duration || 0), 0),
    },
    {
      id: 'curated_happy_pop',
      title: 'Joyful Anthems',
      description: 'Catchy, feel-great singalongs',
      artwork: resolveUniquePlaylistArtwork(happyHindi.slice(12), THEME_ARTWORKS.happy_4, usedArtworks),
      creator: 'Soundwave Curated',
      isUserCreated: false,
      tracks: happyHindi.slice(12, 40),
      totalDuration: happyHindi.slice(12, 40).reduce((acc, s) => acc + (s.duration || 0), 0),
    },
  ];

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Party Mix Shelves (25-35 songs each, STRICT Hindi)
  // ───────────────────────────────────────────────────────────────────────────
  const partyPlaylists: Playlist[] = [
    {
      id: 'curated_party_club',
      title: 'Club & Dance Party',
      description: 'High-energy Hindi party songs & club beats',
      artwork: resolveUniquePlaylistArtwork(partyHindi, THEME_ARTWORKS.party_1, usedArtworks),
      creator: 'Soundwave Curated',
      isUserCreated: false,
      tracks: partyHindi.slice(0, 32),
      totalDuration: partyHindi.slice(0, 32).reduce((acc, s) => acc + (s.duration || 0), 0),
    },
    {
      id: 'curated_party_bollywood',
      title: 'Bollywood Dance Night',
      description: 'Top dance floor bangers & DJ chartbusters',
      artwork: resolveUniquePlaylistArtwork(partyHindi.slice(4), THEME_ARTWORKS.party_2, usedArtworks),
      creator: 'Soundwave Curated',
      isUserCreated: false,
      tracks: partyHindi.slice(6, 36),
      totalDuration: partyHindi.slice(6, 36).reduce((acc, s) => acc + (s.duration || 0), 0),
    },
    {
      id: 'curated_party_edm',
      title: 'EDM Carnival',
      description: 'Heavy bass drops & festival dance beats',
      artwork: resolveUniquePlaylistArtwork(partyHindi.slice(8), THEME_ARTWORKS.party_3, usedArtworks),
      creator: 'Soundwave Curated',
      isUserCreated: false,
      tracks: partyHindi.slice(10, 38),
      totalDuration: partyHindi.slice(10, 38).reduce((acc, s) => acc + (s.duration || 0), 0),
    },
    {
      id: 'curated_party_hype',
      title: 'Late Night Hype',
      description: 'High-octane party tracks & remixes',
      artwork: resolveUniquePlaylistArtwork(partyHindi.slice(12), THEME_ARTWORKS.party_4, usedArtworks),
      creator: 'Soundwave Curated',
      isUserCreated: false,
      tracks: partyHindi.slice(14, 40),
      totalDuration: partyHindi.slice(14, 40).reduce((acc, s) => acc + (s.duration || 0), 0),
    },
  ];

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Throwback Shelves (25-35 songs each, STRICT Hindi)
  // ───────────────────────────────────────────────────────────────────────────
  const throwbackPlaylists: Playlist[] = [
    {
      id: 'curated_throwback_90s',
      title: '90s Golden Nostalgia',
      description: 'Classic Hindi hits and timeless 90s melodies',
      artwork: resolveUniquePlaylistArtwork(throwbackHindi, THEME_ARTWORKS.throwback_1, usedArtworks),
      creator: 'Soundwave Curated',
      isUserCreated: false,
      tracks: throwbackHindi.slice(0, 32),
      totalDuration: throwbackHindi.slice(0, 32).reduce((acc, s) => acc + (s.duration || 0), 0),
    },
    {
      id: 'curated_throwback_2000s',
      title: '2000s Bollywood Rewind',
      description: 'Iconic 2000s Bollywood chartbusters',
      artwork: resolveUniquePlaylistArtwork(throwbackHindi.slice(4), THEME_ARTWORKS.throwback_2, usedArtworks),
      creator: 'Soundwave Curated',
      isUserCreated: false,
      tracks: throwbackHindi.slice(6, 36),
      totalDuration: throwbackHindi.slice(6, 36).reduce((acc, s) => acc + (s.duration || 0), 0),
    },
    {
      id: 'curated_throwback_retro_pop',
      title: 'Retro Pop Classics',
      description: 'Timeless retro melodies that never fade',
      artwork: resolveUniquePlaylistArtwork(throwbackHindi.slice(8), THEME_ARTWORKS.throwback_3, usedArtworks),
      creator: 'Soundwave Curated',
      isUserCreated: false,
      tracks: throwbackHindi.slice(10, 38),
      totalDuration: throwbackHindi.slice(10, 38).reduce((acc, s) => acc + (s.duration || 0), 0),
    },
    {
      id: 'curated_throwback_evergreen',
      title: 'Evergreen Love Songs',
      description: 'Golden romantic melodies from the past',
      artwork: resolveUniquePlaylistArtwork(throwbackHindi.slice(12), THEME_ARTWORKS.throwback_4, usedArtworks),
      creator: 'Soundwave Curated',
      isUserCreated: false,
      tracks: throwbackHindi.slice(14, 40),
      totalDuration: throwbackHindi.slice(14, 40).reduce((acc, s) => acc + (s.duration || 0), 0),
    },
  ];

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Bhojpuri Hits Shelves (25-35 songs each, STRICT Bhojpuri)
  // ───────────────────────────────────────────────────────────────────────────
  const bhojpuriPlaylists: Playlist[] = [
    {
      id: 'curated_bhojpuri_top',
      title: 'Bhojpuri Hits',
      description: 'Popular Bhojpuri songs and folk melodies',
      artwork: resolveUniquePlaylistArtwork(bhojpuriTracks, THEME_ARTWORKS.bhojpuri_1, usedArtworks),
      creator: 'Soundwave Curated',
      isUserCreated: false,
      tracks: bhojpuriTracks.slice(0, 32),
      totalDuration: bhojpuriTracks.slice(0, 32).reduce((acc, s) => acc + (s.duration || 0), 0),
    },
    {
      id: 'curated_bhojpuri_dance',
      title: 'Bhojpuri Dance Dhamaka',
      description: 'High-energy Bhojpuri dance hits',
      artwork: resolveUniquePlaylistArtwork(bhojpuriTracks.slice(4), THEME_ARTWORKS.bhojpuri_2, usedArtworks),
      creator: 'Soundwave Curated',
      isUserCreated: false,
      tracks: bhojpuriTracks.slice(6, 36),
      totalDuration: bhojpuriTracks.slice(6, 36).reduce((acc, s) => acc + (s.duration || 0), 0),
    },
    {
      id: 'curated_bhojpuri_romantic',
      title: 'Bhojpuri Romantic Mix',
      description: 'Sweet romantic Bhojpuri melodies',
      artwork: resolveUniquePlaylistArtwork(bhojpuriTracks.slice(8), THEME_ARTWORKS.bhojpuri_3, usedArtworks),
      creator: 'Soundwave Curated',
      isUserCreated: false,
      tracks: bhojpuriTracks.slice(10, 38),
      totalDuration: bhojpuriTracks.slice(10, 38).reduce((acc, s) => acc + (s.duration || 0), 0),
    },
    {
      id: 'curated_bhojpuri_superstars',
      title: 'Bhojpuri Superstars',
      description: 'Pawan Singh, Khesari Lal & top chartbusters',
      artwork: resolveUniquePlaylistArtwork(bhojpuriTracks.slice(12), THEME_ARTWORKS.bhojpuri_4, usedArtworks),
      creator: 'Soundwave Curated',
      isUserCreated: false,
      tracks: bhojpuriTracks.slice(14, 40),
      totalDuration: bhojpuriTracks.slice(14, 40).reduce((acc, s) => acc + (s.duration || 0), 0),
    },
  ];

  // ───────────────────────────────────────────────────────────────────────────
  // 7. Recommendations For Today Shelves (25-35 songs each)
  // ───────────────────────────────────────────────────────────────────────────
  const recommendationsPlaylists: Playlist[] = [
    {
      id: 'curated_rec_daily_mix_1',
      title: `Daily Mix 1: ${primaryArtist}`,
      description: 'Picked for you today based on your favorites',
      artwork: resolveUniquePlaylistArtwork(daily1, THEME_ARTWORKS.rec_1, usedArtworks),
      creator: 'Made For You',
      isUserCreated: false,
      tracks: daily1.slice(0, 32),
      totalDuration: daily1.slice(0, 32).reduce((acc, s) => acc + (s.duration || 0), 0),
    },
    {
      id: 'curated_rec_daily_mix_2',
      title: `Daily Mix 2: ${secondaryArtist}`,
      description: 'Fresh daily rotation tailored for you',
      artwork: resolveUniquePlaylistArtwork(daily2, THEME_ARTWORKS.rec_2, usedArtworks),
      creator: 'Made For You',
      isUserCreated: false,
      tracks: daily2.slice(0, 32),
      totalDuration: daily2.slice(0, 32).reduce((acc, s) => acc + (s.duration || 0), 0),
    },
    {
      id: 'curated_rec_discover_weekly',
      title: 'Discover Weekly',
      description: 'Picked for you today from rising hits',
      artwork: resolveUniquePlaylistArtwork(happyHindi.slice(6), THEME_ARTWORKS.rec_3, usedArtworks),
      creator: 'Made For You',
      isUserCreated: false,
      tracks: happyHindi.slice(8, 38),
      totalDuration: happyHindi.slice(8, 38).reduce((acc, s) => acc + (s.duration || 0), 0),
    },
    {
      id: 'curated_rec_evening_chill',
      title: 'Daily Chill Station',
      description: 'Picked for you today for relaxing',
      artwork: resolveUniquePlaylistArtwork(chillAcoustic.slice(4), THEME_ARTWORKS.rec_4, usedArtworks),
      creator: 'Made For You',
      isUserCreated: false,
      tracks: chillAcoustic.slice(5, 35),
      totalDuration: chillAcoustic.slice(5, 35).reduce((acc, s) => acc + (s.duration || 0), 0),
    },
  ];

  const allShelves: PlaylistShelfData[] = [
    {
      id: 'shelf_more_like_you',
      title: 'More Like What You Like',
      subtitle: 'Songs based on your listening',
      playlists: moreLikePlaylists,
    },
    {
      id: 'shelf_jump_back_in',
      title: 'Jump In Back',
      subtitle: 'Pick up where you left off',
      playlists: jumpBackInPlaylists,
    },
    {
      id: 'shelf_happy',
      title: 'Happy',
      subtitle: 'Feel-good Hindi songs',
      playlists: happyPlaylists,
    },
    {
      id: 'shelf_party',
      title: 'Party',
      subtitle: 'High-energy Hindi party songs',
      playlists: partyPlaylists,
    },
    {
      id: 'shelf_throwback',
      title: 'Throwback',
      subtitle: 'Classic Hindi hits',
      playlists: throwbackPlaylists,
    },
    // Strictly ONLY include Bhojpuri shelf if user selected Bhojpuri during onboarding
    ...(hasBhojpuri && bhojpuriTracks.length > 0 ? [{
      id: 'shelf_bhojpuri',
      title: 'Bhojpuri Hits',
      subtitle: 'Popular Bhojpuri songs',
      playlists: bhojpuriPlaylists,
    }] : []),
    {
      id: 'shelf_recommendations',
      title: 'Recommendations For Today',
      subtitle: 'Picked for you today',
      badge: 'Daily Mix',
      playlists: recommendationsPlaylists,
    },
  ];

  // Guarantee all playlists in every shelf contain only unique, deduplicated songs
  allShelves.forEach((shelf) => {
    shelf.playlists = shelf.playlists.map((pl) => {
      const uTracks = deduplicateSongs(pl.tracks);
      return {
        ...pl,
        tracks: uTracks,
        totalDuration: uTracks.reduce((acc, s) => acc + (s.duration || 0), 0),
      };
    });
  });

  saveCachedShelves(allShelves);
  return allShelves;
}
