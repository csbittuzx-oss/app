// =============================================================================
//  HomeScreen — Soundwave Personalized Music Home Interface
//
//  Sections (Content Area):
//  1️⃣ Jump back in
//  2️⃣ Your top mixes
//  3️⃣ Recently played
//  4️⃣ Made for you
//  5️⃣ Charts
//  6️⃣ New releases for you
//  7️⃣ Recommended for today
//  8️⃣ Based on your recent listening
//  9️⃣ More like [artist name]
//  🔟 Albums featuring songs you like
//
//  Personalization & Adaptation Engine:
//  • Prioritizes onboarding language/genre selections first
//  • Real-time listening history tracking (plays, skips, completions, likes)
//  • Dynamic section re-ordering and content shifting as user taste evolves
// =============================================================================

import React, { useEffect, useState, useMemo, useCallback, useRef, useLayoutEffect } from 'react';
import { useApp } from '../state/AppContext';
import { usePlayer } from '../state/PlayerContext';
import { useHomeViewModelAutoLoad } from '../domain/viewmodels/useHomeViewModel';
import {
  getPersonalizedTrending,
  getPersonalizedNewReleases,
  getDailyRecommendations,
  deduplicateSongs,
} from '../data/repository/musicRepository';
import { generateSpotifyStyleShelves } from '../services/CuratedPlaylistsService';
import { userProfileTracker } from '../domain/recommendation/UserProfileTracker';
import { smartRecommendationEngine, classifySongContext } from '../domain/recommendation/SmartRecommendationEngine';
import type { Song, Playlist, Album } from '../data/models';
import { SongSquareCard } from '../components/cards/SongCard';
import { AlbumCard } from '../components/cards/AlbumCard';
import { SongOptionsBottomSheet } from '../components/shared/SongOptionsBottomSheet';
import { getGreeting } from '../core/utils';
import { CONFIG } from '../config';
import { resizeImageUrl } from '../core/utils/imageUtils';
import { searchJioSaavn } from '../data/api/saavnApi';

// ── Persistent Scroll Memory across tab switches ────────────────────────────
let persistentHomeScrollTop = 0;

export function resetHomeScrollPosition() {
  persistentHomeScrollTop = 0;
}

export function getHomeScrollPosition() {
  return persistentHomeScrollTop;
}

// ── Icons ───────────────────────────────────────────────────────────────────

function PlayIcon({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function EqBars() {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2.5, height: 14, width: 12 }} aria-hidden="true">
      {[0, 150, 80].map((delay, i) => (
        <div
          key={i}
          style={{
            width: 2.5,
            background: 'var(--color-accent)',
            borderRadius: 1.5,
            height: '100%',
            animation: `playEq 0.8s ease-in-out ${delay}ms infinite alternate`,
            transformOrigin: 'bottom',
          }}
        />
      ))}
    </div>
  );
}

function SectionHeader({
  title,
  subtitle,
  badge,
  onPlayAll,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  onPlayAll?: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        padding: '24px 20px 12px',
      }}
    >
      <div style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 'var(--text-lg, 18px)',
              fontWeight: 700,
              color: 'var(--color-text-primary)',
              fontFamily: 'var(--font-display)',
              letterSpacing: '-0.02em',
            }}
          >
            {title}
          </h2>
          {badge && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                padding: '2px 7px',
                borderRadius: 'var(--radius-full, 9999px)',
                background: 'var(--color-accent-subtle, rgba(249, 115, 22, 0.16))',
                color: 'var(--color-accent)',
              }}
            >
              {badge}
            </span>
          )}
        </div>
        {subtitle && (
          <p
            style={{
              margin: '3px 0 0',
              fontSize: 'var(--text-xs, 12px)',
              color: 'var(--color-text-secondary)',
              fontWeight: 400,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {subtitle}
          </p>
        )}
      </div>

      {onPlayAll && (
        <button
          onClick={onPlayAll}
          className="btn-play-all"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'var(--color-surface-2, rgba(255,255,255,0.08))',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-full, 9999px)',
            padding: '6px 14px',
            color: 'var(--color-text-primary)',
            fontSize: 'var(--text-xs, 12px)',
            fontWeight: 600,
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'transform 120ms ease, background 120ms ease',
          }}
          onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.95)')}
          onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        >
          <PlayIcon size={12} color="var(--color-accent)" />
          Play All
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  MAIN HOME SCREEN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function HomeScreen({ isVisible = true }: { isVisible?: boolean }) {
  const { state: appState, nav: { navigate } } = useApp();
  const { playSong, state: playerState } = usePlayer();
  const ytViewModel = useHomeViewModelAutoLoad();

  const scrollRef = useRef<HTMLDivElement>(null);
  const isRestoringScroll = useRef<boolean>(false);

  // ── 1. User Preferences & Dynamic Language Adaptation ─────────────────────
  // Baseline: Onboarding language selections
  const onboardingLanguages = useMemo(() => {
    return appState.musicLanguages && appState.musicLanguages.length > 0
      ? appState.musicLanguages
      : ['Hindi', 'International'];
  }, [appState.musicLanguages]);

  // Compute live listening shifts from recent history (last 50 plays + favorites)
  const dynamicLanguages = useMemo(() => {
    const langScores: Record<string, number> = {};

    // 1. Give strong initial baseline weight to user's onboarding choices
    onboardingLanguages.forEach((lang) => {
      langScores[lang] = 50;
    });

    // 2. Score recently played tracks (recent plays weighted 3x, 2x, 1x)
    const recents = appState.recentlyPlayed || [];
    recents.forEach((song, idx) => {
      const ctx = classifySongContext(song);
      const weight = idx < 10 ? 6 : idx < 25 ? 3 : 1;
      langScores[ctx.language] = (langScores[ctx.language] || 0) + weight;
    });

    // 3. Score favorites
    const favs = appState.favorites || [];
    favs.forEach((song) => {
      const ctx = classifySongContext(song);
      langScores[ctx.language] = (langScores[ctx.language] || 0) + 4;
    });

    // Sort languages by highest total active affinity
    const sorted = Object.entries(langScores)
      .sort(([, a], [, b]) => b - a)
      .map(([lang]) => lang);

    return sorted.length > 0 ? sorted : onboardingLanguages;
  }, [onboardingLanguages, appState.recentlyPlayed.length, appState.favorites.length]);

  // Primary active language
  const primaryLanguage = dynamicLanguages[0] || 'Hindi';

  // Context Bottom Sheet state for long-press
  const [selectedSongForMenu, setSelectedSongForMenu] = useState<Song | null>(null);

  // ── 2. Data States for the 10 Sections ─────────────────────────────────────
  const [jumpBackInTracks, setJumpBackInTracks] = useState<Song[]>([]);
  const [topMixPlaylists, setTopMixPlaylists] = useState<Playlist[]>([]);
  const [madeForYouPlaylists, setMadeForYouPlaylists] = useState<Playlist[]>([]);
  const [chartsTracks, setChartsTracks] = useState<Song[]>([]);
  const [newReleasesList, setNewReleasesList] = useState<Song[]>([]);
  const [recommendedTodayTracks, setRecommendedTodayTracks] = useState<Song[]>([]);
  const [basedOnRecentTracks, setBasedOnRecentTracks] = useState<{ seedTitle: string; songs: Song[] } | null>(null);
  const [moreLikeArtistData, setMoreLikeArtistData] = useState<{ artistName: string; songs: Song[] } | null>(null);
  const [albumsFeaturingLiked, setAlbumsFeaturingLiked] = useState<Album[]>([]);

  // User's top artist from listening intelligence
  const topArtistName = useMemo(() => {
    const profileArtists = userProfileTracker.getTopArtists(3);
    if (profileArtists && profileArtists.length > 0) return profileArtists[0];
    if (appState.recentlyPlayed.length > 0) return appState.recentlyPlayed[0].artist;
    if (appState.favorites.length > 0) return appState.favorites[0].artist;
    return primaryLanguage === 'Punjabi'
      ? 'Diljit Dosanjh'
      : primaryLanguage === 'International'
      ? 'The Weeknd'
      : primaryLanguage === 'Bhojpuri'
      ? 'Pawan Singh'
      : 'Arijit Singh';
  }, [appState.recentlyPlayed.length, appState.favorites.length, primaryLanguage]);

  // Long-press Haptic Handler
  const triggerLongPress = useCallback((song: Song) => {
    if ('vibrate' in navigator) {
      try { navigator.vibrate(30); } catch {}
    }
    setSelectedSongForMenu(song);
  }, []);

  // ── 3. Scroll Memory Restoration ──────────────────────────────────────────
  const restoreScrollPosition = useCallback(() => {
    if (!scrollRef.current || persistentHomeScrollTop <= 0) return;
    const el = scrollRef.current;
    isRestoringScroll.current = true;
    const prevBehavior = el.style.scrollBehavior;
    el.style.scrollBehavior = 'auto';
    el.scrollTop = persistentHomeScrollTop;
    requestAnimationFrame(() => {
      if (el && persistentHomeScrollTop > 0) {
        el.scrollTop = persistentHomeScrollTop;
        el.style.scrollBehavior = prevBehavior;
      }
      setTimeout(() => {
        isRestoringScroll.current = false;
      }, 80);
    });
  }, []);

  useLayoutEffect(() => {
    if (isVisible) restoreScrollPosition();
  }, [isVisible, restoreScrollPosition]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (isRestoringScroll.current) return;
    const top = e.currentTarget.scrollTop;
    if (top >= 0) persistentHomeScrollTop = top;
  };

  // ── 4. Comprehensive Section Data Pipeline ────────────────────────────────
  const loadHomePipeline = useCallback(async () => {
    const favorites = appState.favorites || [];
    const recentlyPlayed = appState.recentlyPlayed || [];

    // ── SECTION 1: JUMP BACK IN ──
    const localJump = deduplicateSongs([
      ...recentlyPlayed.slice(0, 10),
      ...favorites.slice(0, 10),
    ]);
    setJumpBackInTracks(localJump);

    // ── SECTION 10: ALBUMS FEATURING SONGS YOU LIKE ──
    const albumMap = new Map<string, Album>();
    [...favorites, ...recentlyPlayed].forEach((s) => {
      if (s.album && !albumMap.has(s.album)) {
        albumMap.set(s.album, {
          id: `album_${s.album.toLowerCase().replace(/\s+/g, '_')}`,
          title: s.album,
          artist: s.artist,
          artwork: s.artworkLg || s.artwork,
          provider: s.provider || 'saavn',
          year: s.year || undefined,
        });
      }
    });
    setAlbumsFeaturingLiked(Array.from(albumMap.values()).slice(0, 12));

    // ── ASYNC NETWORK PIPELINE ──
    if (!navigator.onLine) return;

    try {
      // ── SECTION 2: YOUR TOP MIXES & SECTION 4: MADE FOR YOU ──
      generateSpotifyStyleShelves({
        languages: dynamicLanguages,
        favorites,
        recentlyPlayed,
        searchRecentlyPlayed: appState.searchRecentlyPlayed,
        userPlaylists: appState.userPlaylists,
        topArtists: [topArtistName],
      })
        .then((shelves) => {
          if (shelves && shelves.length > 0) {
            const mixes: Playlist[] = [];
            if (shelves[0]) mixes.push(...shelves[0].playlists);
            if (shelves[1]) mixes.push(...shelves[1].playlists.slice(0, 2));
            setTopMixPlaylists(mixes.slice(0, 8));

            const madeForYou: Playlist[] = [];
            for (let i = 2; i < shelves.length; i++) {
              madeForYou.push(...shelves[i].playlists);
            }
            setMadeForYouPlaylists(madeForYou.slice(0, 8));
          }
        })
        .catch(() => {});

      // ── SECTION 5: CHARTS ──
      getPersonalizedTrending(dynamicLanguages, 20)
        .then((tracks) => {
          if (tracks && tracks.length > 0) {
            setChartsTracks(deduplicateSongs(tracks).slice(0, 16));
          }
        })
        .catch(() => {});

      // ── SECTION 6: NEW RELEASES FOR YOU ──
      getPersonalizedNewReleases(dynamicLanguages, 16)
        .then((tracks) => {
          if (tracks && tracks.length > 0) {
            setNewReleasesList(deduplicateSongs(tracks).slice(0, 14));
          }
        })
        .catch(() => {});

      // ── SECTION 7: RECOMMENDED FOR TODAY ──
      getDailyRecommendations(dynamicLanguages, [topArtistName], 16)
        .then((tracks) => {
          if (tracks && tracks.length > 0) {
            setRecommendedTodayTracks(deduplicateSongs(tracks).slice(0, 14));
          }
        })
        .catch(() => {});

      // ── SECTION 8: BASED ON YOUR RECENT LISTENING ──
      if (recentlyPlayed.length > 0 || favorites.length > 0) {
        smartRecommendationEngine
          .getBecauseYouListenedTo({
            recentlyPlayed,
            favorites,
            languages: dynamicLanguages,
          })
          .then((shelf) => {
            if (shelf && shelf.songs.length > 0) {
              setBasedOnRecentTracks({
                seedTitle: shelf.subtitle.replace(/^Because you (listened to|like)\s*/i, '') || recentlyPlayed[0]?.title || 'Recent Songs',
                songs: deduplicateSongs(shelf.songs).slice(0, 12),
              });
            }
          })
          .catch(() => {});
      }

      // ── SECTION 9: MORE LIKE [ARTIST NAME] ──
      if (topArtistName) {
        searchJioSaavn(`${topArtistName} songs`, 15)
          .then((res) => {
            if (res?.songs && res.songs.length > 0) {
              setMoreLikeArtistData({
                artistName: topArtistName,
                songs: deduplicateSongs(res.songs).slice(0, 12),
              });
            }
          })
          .catch(() => {});
      }
    } catch (e) {
      console.warn('[HomeScreen] Pipeline network fetch error:', e);
    }
  }, [dynamicLanguages.join(','), appState.favorites.length, appState.recentlyPlayed.length, topArtistName]);

  useEffect(() => {
    loadHomePipeline();
  }, [loadHomePipeline]);

  const greeting = getGreeting();

  // Helper to open a playlist
  const handleOpenPlaylist = (playlist: Playlist) => {
    if (scrollRef.current) {
      persistentHomeScrollTop = scrollRef.current.scrollTop;
    }
    navigate('playlist', { playlistId: playlist.id, playlist });
  };

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="scroll-area"
      style={{
        flex: 1,
        paddingBottom: 'var(--content-bottom-pad, 120px)',
        overflowY: 'auto',
        overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {/* ── App Top Header (Preserved Exactly) ── */}
      <header
        style={{
          padding: '20px 20px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img
            src="/logo.png"
            alt="Soundwave Logo"
            width={40}
            height={40}
            style={{
              borderRadius: 'var(--radius-md, 10px)',
              objectFit: 'cover',
              border: '1px solid var(--color-border)',
            }}
          />
          <div>
            <p
              style={{
                margin: 0,
                fontSize: 'var(--text-xs, 12px)',
                color: 'var(--color-text-secondary)',
                fontWeight: 500,
              }}
            >
              {greeting}
            </p>
            <h1
              style={{
                margin: 0,
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--text-xl, 22px)',
                color: 'var(--color-text-primary)',
                lineHeight: 1.2,
                fontWeight: 800,
              }}
            >
              Soundwave
            </h1>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => navigate('search')}
            className="btn-icon"
            aria-label="Search"
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-text-primary)',
              cursor: 'pointer',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>
        </div>
      </header>

      {/* ═════════════════════════════════════════════════════════════════════
          1️⃣ SECTION: JUMP BACK IN
          Horizontal snap carousel of user's active rotations & quick-resumes
      ═════════════════════════════════════════════════════════════════════ */}
      {jumpBackInTracks.length > 0 && (
        <section>
          <SectionHeader
            title="Jump back in"
            subtitle="Pick up right where you left off"
            badge="Resume"
            onPlayAll={() => playSong(jumpBackInTracks[0], jumpBackInTracks, 0)}
          />

          <div
            style={{
              display: 'flex',
              gap: 14,
              overflowX: 'auto',
              padding: '0 20px 8px',
              scrollSnapType: 'x mandatory',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {jumpBackInTracks.slice(0, 10).map((song, i) => {
              const isCurrent = playerState.currentSong?.id === song.id;
              const isPlaying = isCurrent && playerState.isPlaying;

              return (
                <div
                  key={song.id}
                  onClick={() => playSong(song, jumpBackInTracks, i)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    triggerLongPress(song);
                  }}
                  style={{
                    flexShrink: 0,
                    width: 156,
                    cursor: 'pointer',
                    scrollSnapAlign: 'start',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      width: 156,
                      height: 156,
                      borderRadius: 'var(--radius-lg, 16px)',
                      overflow: 'hidden',
                      position: 'relative',
                      background: 'var(--color-surface)',
                      border: isCurrent
                        ? '2px solid var(--color-accent)'
                        : '1px solid var(--color-border)',
                      boxShadow: '0 6px 18px rgba(0, 0, 0, 0.35)',
                    }}
                  >
                    <img
                      src={resizeImageUrl(song.artworkLg || song.artwork, 544, 544)}
                      alt={song.title}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        display: 'block',
                      }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = CONFIG.ARTWORK_PLACEHOLDER;
                      }}
                    />

                    {/* Gradient shadow overlay */}
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 50%)',
                        pointerEvents: 'none',
                      }}
                    />

                    {/* Play Badge */}
                    <div
                      style={{
                        position: 'absolute',
                        right: 8,
                        bottom: 8,
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        background: isCurrent ? 'var(--color-accent)' : 'rgba(255, 255, 255, 0.85)',
                        color: isCurrent ? 'var(--color-accent-on, #FFFFFF)' : '#000000',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.35)',
                      }}
                    >
                      {isPlaying ? <EqBars /> : <PlayIcon size={15} color={isCurrent ? '#FFFFFF' : '#000000'} />}
                    </div>
                  </div>

                  <div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: '13px',
                        fontWeight: 600,
                        color: isCurrent ? 'var(--color-accent)' : 'var(--color-text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {song.title}
                    </p>
                    <p
                      style={{
                        margin: '2px 0 0',
                        fontSize: '11.5px',
                        color: 'var(--color-text-secondary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {song.artist}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ═════════════════════════════════════════════════════════════════════
          2️⃣ SECTION: YOUR TOP MIXES
          Spotify-style daily and genre mix capsules based on listening patterns
      ═════════════════════════════════════════════════════════════════════ */}
      {topMixPlaylists.length > 0 && (
        <section>
          <SectionHeader
            title="Your top mixes"
            subtitle="Personalized mixes tailored to your favorite genres and moods"
            badge="Top Mixes"
          />

          <div
            style={{
              display: 'flex',
              gap: 14,
              overflowX: 'auto',
              padding: '0 20px 8px',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {topMixPlaylists.map((playlist) => {
              const art = playlist.artwork || (playlist.tracks[0]?.artwork ?? '');
              return (
                <div
                  key={playlist.id}
                  onClick={() => handleOpenPlaylist(playlist)}
                  style={{
                    width: 154,
                    flexShrink: 0,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      width: 154,
                      height: 154,
                      borderRadius: 'var(--radius-lg, 16px)',
                      overflow: 'hidden',
                      position: 'relative',
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      boxShadow: '0 6px 18px rgba(0, 0, 0, 0.35)',
                    }}
                  >
                    <img
                      src={resizeImageUrl(art, 544, 544)}
                      alt={playlist.title}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = CONFIG.ARTWORK_PLACEHOLDER;
                      }}
                    />

                    {/* Gradient label overlay */}
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.2) 50%, transparent 100%)',
                        pointerEvents: 'none',
                      }}
                    />

                    {/* Bottom Play Badge */}
                    <div
                      style={{
                        position: 'absolute',
                        right: 8,
                        bottom: 8,
                        width: 34,
                        height: 34,
                        borderRadius: '50%',
                        background: 'var(--color-accent)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
                        color: '#FFFFFF',
                      }}
                    >
                      <PlayIcon size={14} color="var(--color-accent-on, #FFFFFF)" />
                    </div>
                  </div>

                  <div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: '13px',
                        fontWeight: 700,
                        color: 'var(--color-text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {playlist.title}
                    </p>
                    <p
                      style={{
                        margin: '2px 0 0',
                        fontSize: '11.5px',
                        color: 'var(--color-text-secondary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {playlist.creator || 'Daily Mix'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ═════════════════════════════════════════════════════════════════════
          3️⃣ SECTION: RECENTLY PLAYED
          2-Row Horizontal Snapping Grid of recent tracks
      ═════════════════════════════════════════════════════════════════════ */}
      {appState.recentlyPlayed && appState.recentlyPlayed.length > 0 && (
        <section>
          <SectionHeader
            title="Recently played"
            subtitle="Your recent track listening history"
            onPlayAll={() => playSong(appState.recentlyPlayed[0], appState.recentlyPlayed, 0)}
          />

          <div
            style={{
              display: 'grid',
              gridTemplateRows: 'repeat(2, auto)',
              gridAutoFlow: 'column',
              gridAutoColumns: '260px',
              gap: 10,
              overflowX: 'auto',
              padding: '0 20px 8px',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {deduplicateSongs(appState.recentlyPlayed).slice(0, 12).map((song, i) => {
              const isCurrent = playerState.currentSong?.id === song.id;
              const isPlaying = isCurrent && playerState.isPlaying;

              return (
                <div
                  key={song.id}
                  onClick={() => playSong(song, appState.recentlyPlayed, i)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    triggerLongPress(song);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: 8,
                    background: 'var(--color-surface)',
                    border: isCurrent
                      ? '1px solid var(--color-accent)'
                      : '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md, 10px)',
                    cursor: 'pointer',
                    overflow: 'hidden',
                  }}
                >
                  <img
                    src={resizeImageUrl(song.artwork, 160, 160)}
                    alt={song.title}
                    width={48}
                    height={48}
                    loading="lazy"
                    style={{
                      borderRadius: 'var(--radius-sm, 6px)',
                      objectFit: 'cover',
                      flexShrink: 0,
                    }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = CONFIG.ARTWORK_PLACEHOLDER;
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        margin: 0,
                        fontSize: '13px',
                        fontWeight: 600,
                        color: isCurrent ? 'var(--color-accent)' : 'var(--color-text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {song.title}
                    </p>
                    <p
                      style={{
                        margin: '2px 0 0',
                        fontSize: '11.5px',
                        color: 'var(--color-text-secondary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {song.artist}
                    </p>
                  </div>
                  {isPlaying && <EqBars />}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ═════════════════════════════════════════════════════════════════════
          4️⃣ SECTION: MADE FOR YOU
          AI-curated customized playlists and listening capsules
      ═════════════════════════════════════════════════════════════════════ */}
      {madeForYouPlaylists.length > 0 && (
        <section>
          <SectionHeader
            title="Made for you"
            subtitle="Curated discovery playlists tuned to your unique taste profile"
            badge="For You"
          />

          <div
            style={{
              display: 'flex',
              gap: 14,
              overflowX: 'auto',
              padding: '0 20px 8px',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {madeForYouPlaylists.map((playlist) => {
              const thumbs = playlist.tracks.slice(0, 4).map((t) => t.artwork).filter(Boolean);

              return (
                <div
                  key={playlist.id}
                  onClick={() => handleOpenPlaylist(playlist)}
                  style={{
                    width: 154,
                    flexShrink: 0,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      width: 154,
                      height: 154,
                      borderRadius: 'var(--radius-lg, 16px)',
                      overflow: 'hidden',
                      position: 'relative',
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.35)',
                    }}
                  >
                    {thumbs.length >= 4 ? (
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(2, 1fr)',
                          width: '100%',
                          height: '100%',
                        }}
                      >
                        {thumbs.slice(0, 4).map((thumb, idx) => (
                          <img
                            key={idx}
                            src={resizeImageUrl(thumb, 200, 200)}
                            alt=""
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ))}
                      </div>
                    ) : (
                      <img
                        src={resizeImageUrl(playlist.artwork || thumbs[0], 544, 544)}
                        alt={playlist.title}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = CONFIG.ARTWORK_PLACEHOLDER;
                        }}
                      />
                    )}

                    <div
                      style={{
                        position: 'absolute',
                        right: 8,
                        bottom: 8,
                        width: 34,
                        height: 34,
                        borderRadius: '50%',
                        background: 'var(--color-accent)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
                        color: '#FFFFFF',
                      }}
                    >
                      <PlayIcon size={14} color="var(--color-accent-on, #FFFFFF)" />
                    </div>
                  </div>

                  <div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: '13px',
                        fontWeight: 600,
                        color: 'var(--color-text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {playlist.title}
                    </p>
                    <p
                      style={{
                        margin: '2px 0 0',
                        fontSize: '11.5px',
                        color: 'var(--color-text-secondary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {playlist.creator || 'Custom Mix'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ═════════════════════════════════════════════════════════════════════
          5️⃣ SECTION: CHARTS
          Top 100 / Trending Charts with numbered rankings & "Play All"
      ═════════════════════════════════════════════════════════════════════ */}
      {(chartsTracks.length > 0 || (ytViewModel.chartsPage?.topSongs && ytViewModel.chartsPage.topSongs.length > 0)) && (
        <section>
          <SectionHeader
            title="Charts"
            subtitle={`Top trending songs in ${primaryLanguage} & India`}
            badge="Top 100"
            onPlayAll={() => {
              const list = chartsTracks.length > 0 ? chartsTracks : ytViewModel.getTrendingSongs();
              if (list.length > 0) playSong(list[0], list, 0);
            }}
          />

          <div
            style={{
              display: 'grid',
              gridTemplateRows: 'repeat(4, auto)',
              gridAutoFlow: 'column',
              gridAutoColumns: '290px',
              gap: 10,
              overflowX: 'auto',
              padding: '0 20px 8px',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {(chartsTracks.length > 0 ? chartsTracks : ytViewModel.getTrendingSongs()).slice(0, 16).map((song, i) => {
              const isCurrent = playerState.currentSong?.id === song.id;
              const isPlaying = isCurrent && playerState.isPlaying;
              const chartList = chartsTracks.length > 0 ? chartsTracks : ytViewModel.getTrendingSongs();

              return (
                <div
                  key={song.id}
                  onClick={() => playSong(song, chartList, i)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    triggerLongPress(song);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: 8,
                    background: 'var(--color-surface)',
                    border: isCurrent
                      ? '1px solid var(--color-accent)'
                      : '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md, 10px)',
                    cursor: 'pointer',
                  }}
                >
                  <span
                    style={{
                      width: 22,
                      fontSize: '13px',
                      fontWeight: 800,
                      color: i < 3 ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                      textAlign: 'center',
                    }}
                  >
                    {i + 1}
                  </span>
                  <img
                    src={resizeImageUrl(song.artwork, 160, 160)}
                    alt={song.title}
                    width={44}
                    height={44}
                    loading="lazy"
                    style={{
                      borderRadius: 'var(--radius-sm, 6px)',
                      objectFit: 'cover',
                      flexShrink: 0,
                    }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = CONFIG.ARTWORK_PLACEHOLDER;
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        margin: 0,
                        fontSize: '13px',
                        fontWeight: 600,
                        color: isCurrent ? 'var(--color-accent)' : 'var(--color-text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {song.title}
                    </p>
                    <p
                      style={{
                        margin: '2px 0 0',
                        fontSize: '11px',
                        color: 'var(--color-text-secondary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {song.artist}
                    </p>
                  </div>
                  {isPlaying && <EqBars />}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ═════════════════════════════════════════════════════════════════════
          6️⃣ SECTION: NEW RELEASES FOR YOU
          Freshly dropped songs & albums in user's favorite language
      ═════════════════════════════════════════════════════════════════════ */}
      {newReleasesList.length > 0 && (
        <section>
          <SectionHeader
            title="New releases for you"
            subtitle={`Fresh tracks and singles just dropped in ${primaryLanguage}`}
            badge="New"
            onPlayAll={() => playSong(newReleasesList[0], newReleasesList, 0)}
          />

          <div
            style={{
              display: 'flex',
              gap: 14,
              overflowX: 'auto',
              padding: '0 20px 8px',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {newReleasesList.map((song, i) => (
              <div
                key={song.id}
                onContextMenu={(e) => {
                  e.preventDefault();
                  triggerLongPress(song);
                }}
              >
                <SongSquareCard
                  song={song}
                  queue={newReleasesList}
                  index={i}
                  size={144}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ═════════════════════════════════════════════════════════════════════
          7️⃣ SECTION: RECOMMENDED FOR TODAY
          Contextual day-and-time personalized track picks
      ═════════════════════════════════════════════════════════════════════ */}
      {recommendedTodayTracks.length > 0 && (
        <section>
          <SectionHeader
            title="Recommended for today"
            subtitle="Handpicked tracks for your daily listening flow"
            badge="Today"
            onPlayAll={() => playSong(recommendedTodayTracks[0], recommendedTodayTracks, 0)}
          />

          <div
            style={{
              display: 'flex',
              gap: 14,
              overflowX: 'auto',
              padding: '0 20px 8px',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {recommendedTodayTracks.map((song, i) => (
              <div
                key={song.id}
                onContextMenu={(e) => {
                  e.preventDefault();
                  triggerLongPress(song);
                }}
              >
                <SongSquareCard
                  song={song}
                  queue={recommendedTodayTracks}
                  index={i}
                  size={148}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ═════════════════════════════════════════════════════════════════════
          8️⃣ SECTION: BASED ON YOUR RECENT LISTENING
          Dynamic recommendations connected to a recent track/artist seed
      ═════════════════════════════════════════════════════════════════════ */}
      {basedOnRecentTracks && basedOnRecentTracks.songs.length > 0 && (
        <section>
          <SectionHeader
            title="Based on your recent listening"
            subtitle={`Inspired by "${basedOnRecentTracks.seedTitle}"`}
            badge="Inspired"
            onPlayAll={() => playSong(basedOnRecentTracks.songs[0], basedOnRecentTracks.songs, 0)}
          />

          <div
            style={{
              display: 'flex',
              gap: 14,
              overflowX: 'auto',
              padding: '0 20px 8px',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {basedOnRecentTracks.songs.map((song, i) => (
              <div
                key={song.id}
                onContextMenu={(e) => {
                  e.preventDefault();
                  triggerLongPress(song);
                }}
              >
                <SongSquareCard
                  song={song}
                  queue={basedOnRecentTracks.songs}
                  index={i}
                  size={144}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ═════════════════════════════════════════════════════════════════════
          9️⃣ SECTION: MORE LIKE [ARTIST NAME]
          Artist-specific recommendation shelf for the user's #1 favorite artist
      ═════════════════════════════════════════════════════════════════════ */}
      {moreLikeArtistData && moreLikeArtistData.songs.length > 0 && (
        <section>
          <SectionHeader
            title={`More like ${moreLikeArtistData.artistName}`}
            subtitle={`Fans of ${moreLikeArtistData.artistName} also love these tracks`}
            badge="Artist Mix"
            onPlayAll={() => playSong(moreLikeArtistData.songs[0], moreLikeArtistData.songs, 0)}
          />

          <div
            style={{
              display: 'flex',
              gap: 14,
              overflowX: 'auto',
              padding: '0 20px 8px',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {moreLikeArtistData.songs.map((song, i) => (
              <div
                key={song.id}
                onContextMenu={(e) => {
                  e.preventDefault();
                  triggerLongPress(song);
                }}
              >
                <SongSquareCard
                  song={song}
                  queue={moreLikeArtistData.songs}
                  index={i}
                  size={144}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ═════════════════════════════════════════════════════════════════════
          🔟 SECTION: ALBUMS FEATURING SONGS YOU LIKE
          Full albums containing user's favorited / most-replayed songs
      ═════════════════════════════════════════════════════════════════════ */}
      {albumsFeaturingLiked.length > 0 && (
        <section style={{ marginBottom: 16 }}>
          <SectionHeader
            title="Albums featuring songs you like"
            subtitle="Full albums containing your top tracks"
            badge="Albums"
          />

          <div
            style={{
              display: 'flex',
              gap: 14,
              overflowX: 'auto',
              padding: '0 20px 8px',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {albumsFeaturingLiked.map((album) => (
              <AlbumCard key={album.id} album={album} size={144} />
            ))}
          </div>
        </section>
      )}

      {/* ── Context Menu Bottom Sheet (Long Press on track) ── */}
      {selectedSongForMenu && (
        <SongOptionsBottomSheet
          song={selectedSongForMenu}
          onClose={() => setSelectedSongForMenu(null)}
        />
      )}
    </div>
  );
}
