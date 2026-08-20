// =============================================================================
//  HomeScreen — Soundwave Android Music Streaming Home Interface
//
//  Sections & Layout Hierarchy (in strict order):
//  1️⃣ SPEED DIAL & SMART RANDOMIZER (Top Section - 3x3 Paged Grid + Shuffle)
//  2️⃣ HERO "QUICK PICKS" CAROUSEL (Full-bleed 250x290dp cards + glass play + EqBars)
//  3️⃣ "DAILY DISCOVER" CAROUSEL (5 seed songs + fresh matches + "Play All")
//  4️⃣ "KEEP LISTENING" (Recent Favorites - 2-Row Horizontal Scrolling Grid)
//  5️⃣ "FROM THE COMMUNITY" (160dp cards with 2x2 collage artwork)
//  6️⃣ "FORGOTTEN FAVORITES" (4-Row Snapping Horizontal Grid + "Play All")
//  7️⃣ "SIMILAR TO..." PERSONALIZED SHELVES (Dynamic top artist/album seeds)
//  8️⃣ DYNAMIC YOUTUBE MUSIC & TRENDING SHELVES (Charts 4-Row + New Releases 1-Row)
//  9️⃣ SHIMMER SKELETON LOADING (Animated placeholders during loading)
// =============================================================================

import React, { useEffect, useState, useMemo, useCallback, useRef, useLayoutEffect } from 'react';
import { useApp } from '../state/AppContext';
import { usePlayer } from '../state/PlayerContext';
import { useHomeViewModelAutoLoad } from '../domain/viewmodels/useHomeViewModel';
import {
  getPersonalizedRecommendForYou,
  deduplicateSongs,
} from '../data/repository/musicRepository';
import { generateSpotifyStyleShelves } from '../services/CuratedPlaylistsService';
import { userProfileTracker } from '../domain/recommendation/UserProfileTracker';
import { smartRecommendationEngine } from '../domain/recommendation/SmartRecommendationEngine';
import type { Song, Playlist } from '../data/models';
import { SongSquareCard } from '../components/cards/SongCard';
import { ArtistCard } from '../components/cards/ArtistCard';
import { AlbumCard } from '../components/cards/AlbumCard';
import { SongOptionsBottomSheet } from '../components/shared/SongOptionsBottomSheet';
import { getGreeting } from '../core/utils';
import { CONFIG } from '../config';
import { resizeImageUrl } from '../core/utils/imageUtils';
import { showToast } from '../core/utils/toast';

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

function ShuffleIcon({ size = 18, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="16 3 21 3 21 8" />
      <line x1="4" y1="20" x2="21" y2="3" />
      <polyline points="21 16 21 21 16 21" />
      <line x1="15" y1="15" x2="21" y2="21" />
      <line x1="4" y1="4" x2="9" y2="9" />
    </svg>
  );
}

function EqBars() {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2.5, height: 16, width: 14 }} aria-hidden="true">
      {[0, 150, 80].map((delay, i) => (
        <div
          key={i}
          style={{
            width: 3,
            background: 'var(--color-accent)',
            borderRadius: 2,
            height: '100%',
            animation: `playEq 0.8s ease-in-out ${delay}ms infinite alternate`,
            transformOrigin: 'bottom',
          }}
        />
      ))}
    </div>
  );
}

// ── Shimmer Skeleton Components ─────────────────────────────────────────────

function SkeletonBox({ width, height, borderRadius = 'var(--radius-md)' }: { width: string | number; height: string | number; borderRadius?: string }) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius,
        background: 'linear-gradient(90deg, var(--color-surface) 25%, var(--color-surface-2, rgba(255,255,255,0.06)) 50%, var(--color-surface) 75%)',
        backgroundSize: '200% 100%',
        animation: 'skeletonShimmer 1.5s infinite ease-in-out',
      }}
    />
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

  const languages = useMemo(() => {
    return appState.musicLanguages && appState.musicLanguages.length > 0
      ? appState.musicLanguages
      : ['Hindi', 'International'];
  }, [appState.musicLanguages]);

  // Context Bottom Sheet state
  const [selectedSongForMenu, setSelectedSongForMenu] = useState<Song | null>(null);

  // ── Phase 1 & 2 Local / Remote Data States ────────────────────────────────
  const [quickPicks, setQuickPicks] = useState<Song[]>([]);
  const [dailyDiscover, setDailyDiscover] = useState<Song[]>([]);
  const [keepListening, setKeepListening] = useState<Song[]>([]);
  const [forgottenFavorites, setForgottenFavorites] = useState<Song[]>([]);
  const [similarShelves, setSimilarShelves] = useState<Array<{ title: string; subtitle: string; songs: Song[] }>>([]);
  const [communityPlaylists, setCommunityPlaylists] = useState<Playlist[]>([]);
  const [isLocalLoading, setIsLocalLoading] = useState(true);

  // Top artists from user profile tracker
  const userTopArtists = useMemo(() => {
    return userProfileTracker.getTopArtists(6);
  }, [appState.recentlyPlayed.length, appState.favorites.length]);

  // ── Long-press Haptic Handler ─────────────────────────────────────────────
  const triggerLongPress = useCallback((song: Song) => {
    if ('vibrate' in navigator) {
      try { navigator.vibrate(30); } catch {}
    }
    setSelectedSongForMenu(song);
  }, []);

  // ── Scroll Restoration (instant layout effect) ────────────────────────────
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

  // ── 2-Phase Data Loading Engine ───────────────────────────────────────────
  const loadHomePipeline = useCallback(async () => {
    // PHASE 1: INSTANT LOCAL DATA LOADING (Zero Network Delay)
    const favorites = appState.favorites || [];
    const recentlyPlayed = appState.recentlyPlayed || [];

    // 1. Speed Dial & Quick Picks (From favorites + recently played)
    const localQuick = deduplicateSongs([...recentlyPlayed.slice(0, 10), ...favorites.slice(0, 10)]);
    setQuickPicks(localQuick.length > 0 ? localQuick : []);

    // 2. Keep Listening (Most played recently)
    const localKeep = deduplicateSongs([...recentlyPlayed, ...favorites]).slice(0, 12);
    setKeepListening(localKeep);

    // 3. Forgotten Favorites (Items played earlier in history)
    const recentIds = new Set(recentlyPlayed.slice(0, 6).map((s) => s.id));
    const forgotten = favorites.filter((s) => !recentIds.has(s.id));
    setForgottenFavorites(forgotten.length > 0 ? forgotten : favorites.slice(4, 16));

    setIsLocalLoading(false);

    // PHASE 2: PARALLEL NETWORK DATA LOADING
    if (!navigator.onLine) return;

    try {
      // 1. Daily Discover: Seed from 5 random liked songs + smart recommendation engine
      const discoverSeeds = favorites.length > 0 ? favorites : recentlyPlayed;
      if (discoverSeeds.length > 0) {
        smartRecommendationEngine
          .getDiscoverSomethingNew(languages)
          .then((tracks) => {
            if (tracks && tracks.length > 0) {
              setDailyDiscover(deduplicateSongs(tracks).slice(0, 15));
            }
          })
          .catch(() => {});
      } else {
        getPersonalizedRecommendForYou(languages, recentlyPlayed, favorites, 15)
          .then((tracks) => setDailyDiscover(deduplicateSongs(tracks)))
          .catch(() => {});
      }

      // 2. Community Playlists: Discovered through user's top played artists
      generateSpotifyStyleShelves({
        languages,
        favorites,
        recentlyPlayed,
        searchRecentlyPlayed: appState.searchRecentlyPlayed,
        userPlaylists: appState.userPlaylists,
        topArtists: userTopArtists,
      })
        .then((shelves) => {
          const allPlaylists: Playlist[] = [];
          for (const sh of shelves) {
            allPlaylists.push(...sh.playlists);
          }
          if (allPlaylists.length > 0) {
            setCommunityPlaylists(allPlaylists.slice(0, 10));
          }
        })
        .catch(() => {});

      // 3. Similar Recommendations: Artist & album seeds
      if (recentlyPlayed.length > 0 || favorites.length > 0) {
        smartRecommendationEngine
          .getBecauseYouListenedTo({
            recentlyPlayed,
            favorites,
            languages,
          })
          .then((shelf) => {
            if (shelf && shelf.songs.length > 0) {
              setSimilarShelves([
                {
                  title: shelf.title,
                  subtitle: shelf.subtitle,
                  songs: deduplicateSongs(shelf.songs).slice(0, 10),
                },
              ]);
            }
          })
          .catch(() => {});
      }
    } catch (e) {
      console.warn('[HomeScreen] Phase 2 network dispatch error:', e);
    }
  }, [languages.join(','), appState.favorites.length, appState.recentlyPlayed.length, userTopArtists.join(',')]);

  useEffect(() => {
    loadHomePipeline();
  }, [loadHomePipeline]);

  // ── Smart Randomizer Action ───────────────────────────────────────────────
  const [isRandomizing, setIsRandomizing] = useState(false);

  const handleSmartRandomize = useCallback(() => {
    setIsRandomizing(true);
    if ('vibrate' in navigator) {
      try { navigator.vibrate([20, 50, 20]); } catch {}
    }

    const pool = deduplicateSongs([
      ...appState.favorites,
      ...appState.recentlyPlayed,
      ...quickPicks,
      ...dailyDiscover,
    ]);

    if (pool.length === 0) {
      showToast('No tracks found to randomize. Play some songs first!', 'info');
      setIsRandomizing(false);
      return;
    }

    const randomIndex = Math.floor(Math.random() * pool.length);
    const chosenSong = pool[randomIndex];

    setTimeout(() => {
      playSong(chosenSong, pool, randomIndex);
      setIsRandomizing(false);
      showToast(`Playing "${chosenSong.title}"`, 'success');
    }, 300);
  }, [appState.favorites, appState.recentlyPlayed, quickPicks, dailyDiscover, playSong]);

  // ── Speed Dial 3x3 Paged Grid Items ───────────────────────────────────────
  const speedDialItems = useMemo(() => {
    const rawList = deduplicateSongs([
      ...appState.favorites,
      ...appState.recentlyPlayed,
      ...quickPicks,
    ]);
    return rawList.slice(0, 17);
  }, [appState.favorites, appState.recentlyPlayed, quickPicks]);

  const [speedDialPage, setSpeedDialPage] = useState(0);

  const page1Items = speedDialItems.slice(0, 8);
  const page2Items = speedDialItems.slice(8, 17);
  const hasPage2 = page2Items.length > 0;

  // ── Greeting Header ───────────────────────────────────────────────────────
  const greeting = getGreeting();

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
      {/* ── App Top Header ── */}
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
          1️⃣ SPEED DIAL & SMART RANDOMIZER (Top Section)
          3x3 Paged Horizontal Grid with Smart Randomizer on Slot 9
      ═════════════════════════════════════════════════════════════════════ */}
      <section style={{ padding: '0 20px 16px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 8,
          }}
        >
          {(speedDialPage === 0 ? page1Items : page2Items).map((song, i) => {
            const isCurrent = playerState.currentSong?.id === song.id;
            const isPlaying = isCurrent && playerState.isPlaying;

            return (
              <div
                key={song.id}
                onClick={() => playSong(song, speedDialItems, i)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  triggerLongPress(song);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 8px',
                  background: isCurrent
                    ? 'var(--color-accent-subtle, rgba(249, 115, 22, 0.12))'
                    : 'var(--color-surface)',
                  border: isCurrent
                    ? '1px solid var(--color-accent)'
                    : '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md, 10px)',
                  cursor: 'pointer',
                  overflow: 'hidden',
                  position: 'relative',
                  minHeight: 52,
                  transition: 'transform 120ms ease, background 150ms ease',
                }}
                onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.97)')}
                onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              >
                <img
                  src={resizeImageUrl(song.artwork, 128, 128)}
                  alt={song.title}
                  width={38}
                  height={38}
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
                      fontSize: '11.5px',
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
                      margin: 0,
                      fontSize: '10px',
                      color: 'var(--color-text-secondary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {song.artist}
                  </p>
                </div>
                {isPlaying && (
                  <div style={{ marginRight: 2 }}>
                    <EqBars />
                  </div>
                )}
              </div>
            );
          })}

          {/* Slot 9: Smart Randomizer Button (on Page 1) */}
          {speedDialPage === 0 && (
            <button
              onClick={handleSmartRandomize}
              className="speed-dial-randomizer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px',
                background: 'linear-gradient(135deg, var(--color-accent) 0%, #EA580C 100%)',
                border: 'none',
                borderRadius: 'var(--radius-md, 10px)',
                cursor: 'pointer',
                overflow: 'hidden',
                minHeight: 52,
                color: 'var(--color-accent-on, #FFFFFF)',
                boxShadow: '0 4px 14px rgba(249, 115, 22, 0.35)',
                transition: 'transform 150ms ease',
              }}
              onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.96)')}
              onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 'var(--radius-sm, 6px)',
                  background: 'rgba(255,255,255,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transform: isRandomizing ? 'rotate(180deg)' : 'none',
                  transition: 'transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1)',
                }}
              >
                <ShuffleIcon size={18} color="#FFFFFF" />
              </div>
              <div style={{ textAlign: 'left', minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: '11.5px', fontWeight: 700, lineHeight: 1.2 }}>
                  Shuffle Mix
                </p>
                <p style={{ margin: 0, fontSize: '10px', opacity: 0.85, whiteSpace: 'nowrap' }}>
                  Smart Random
                </p>
              </div>
            </button>
          )}
        </div>

        {/* Pager Dots (if multiple pages exist) */}
        {hasPage2 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 10 }}>
            <div
              onClick={() => setSpeedDialPage(0)}
              style={{
                width: speedDialPage === 0 ? 18 : 6,
                height: 6,
                borderRadius: 3,
                background: speedDialPage === 0 ? 'var(--color-accent)' : 'var(--color-border)',
                cursor: 'pointer',
                transition: 'all 200ms ease',
              }}
            />
            <div
              onClick={() => setSpeedDialPage(1)}
              style={{
                width: speedDialPage === 1 ? 18 : 6,
                height: 6,
                borderRadius: 3,
                background: speedDialPage === 1 ? 'var(--color-accent)' : 'var(--color-border)',
                cursor: 'pointer',
                transition: 'all 200ms ease',
              }}
            />
          </div>
        )}
      </section>

      {/* ═════════════════════════════════════════════════════════════════════
          2️⃣ HERO "QUICK PICKS" CAROUSEL
          Horizontal Snap Carousel (250x290dp) with glass Play badge & gradient scrim
      ═════════════════════════════════════════════════════════════════════ */}
      <section>
        <SectionHeader
          title="Quick Picks"
          subtitle="Listen right where you left off"
          badge="Top Pick"
        />

        <div
          style={{
            display: 'flex',
            gap: 16,
            overflowX: 'auto',
            padding: '0 20px 8px',
            scrollSnapType: 'x mandatory',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {isLocalLoading && quickPicks.length === 0 ? (
            [0, 1, 2].map((k) => (
              <div key={k} style={{ flexShrink: 0, width: 250, height: 290 }}>
                <SkeletonBox width={250} height={290} borderRadius="var(--radius-lg, 16px)" />
              </div>
            ))
          ) : (
            quickPicks.slice(0, 8).map((song, i) => {
              const isCurrent = playerState.currentSong?.id === song.id;
              const isPlaying = isCurrent && playerState.isPlaying;

              return (
                <div
                  key={song.id}
                  onClick={() => playSong(song, quickPicks, i)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    triggerLongPress(song);
                  }}
                  style={{
                    flexShrink: 0,
                    width: 250,
                    height: 290,
                    borderRadius: 'var(--radius-lg, 16px)',
                    position: 'relative',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    scrollSnapAlign: 'start',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
                    border: isCurrent
                      ? '2px solid var(--color-accent)'
                      : '1px solid var(--color-border)',
                    transition: 'transform 180ms ease',
                  }}
                  onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.98)')}
                  onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                >
                  {/* Full-bleed high-res artwork */}
                  <img
                    src={resizeImageUrl(song.artworkLg || song.artwork, 800, 800)}
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

                  {/* Deep Vertical Gradient Scrim for text readability */}
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background:
                        'linear-gradient(to top, rgba(0,0,0,0.94) 0%, rgba(0,0,0,0.5) 45%, transparent 75%)',
                      pointerEvents: 'none',
                    }}
                  />

                  {/* Top-Left Circular Glass Play Badge */}
                  <div
                    style={{
                      position: 'absolute',
                      top: 14,
                      left: 14,
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      background: 'rgba(255, 255, 255, 0.22)',
                      backdropFilter: 'blur(16px) saturate(180%)',
                      WebkitBackdropFilter: 'blur(16px) saturate(180%)',
                      border: '1px solid rgba(255, 255, 255, 0.35)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: isCurrent ? 'var(--color-accent)' : '#FFFFFF',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.35)',
                    }}
                  >
                    <PlayIcon size={18} color={isCurrent ? 'var(--color-accent)' : '#FFFFFF'} />
                  </div>

                  {/* Top-Right Equalizer indicator if actively playing */}
                  {isPlaying && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 14,
                        right: 14,
                        padding: '6px 10px',
                        background: 'rgba(0, 0, 0, 0.65)',
                        backdropFilter: 'blur(8px)',
                        borderRadius: 'var(--radius-full, 9999px)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <EqBars />
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-accent)' }}>
                        PLAYING
                      </span>
                    </div>
                  )}

                  {/* Bottom-Left Track Details */}
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 16,
                      left: 16,
                      right: 16,
                      pointerEvents: 'none',
                    }}
                  >
                    <h3
                      style={{
                        margin: 0,
                        fontSize: '17px',
                        fontWeight: 800,
                        color: isCurrent ? 'var(--color-accent)' : '#FFFFFF',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        lineHeight: 1.25,
                      }}
                    >
                      {song.title}
                    </h3>
                    <p
                      style={{
                        margin: '4px 0 0',
                        fontSize: '13px',
                        color: 'rgba(255, 255, 255, 0.78)',
                        fontWeight: 500,
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
            })
          )}
        </div>
      </section>

      {/* ═════════════════════════════════════════════════════════════════════
          3️⃣ "DAILY DISCOVER" CAROUSEL
          Freshly paired matching tracks with "Play All" button
      ═════════════════════════════════════════════════════════════════════ */}
      {dailyDiscover.length > 0 && (
        <section>
          <SectionHeader
            title="Daily Discover"
            subtitle="Fresh discoveries tailored to your listening habits"
            badge="Discovery"
            onPlayAll={() => playSong(dailyDiscover[0], dailyDiscover, 0)}
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
            {dailyDiscover.map((song, i) => (
              <div
                key={song.id}
                onContextMenu={(e) => {
                  e.preventDefault();
                  triggerLongPress(song);
                }}
              >
                <SongSquareCard
                  song={song}
                  queue={dailyDiscover}
                  index={i}
                  size={150}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ═════════════════════════════════════════════════════════════════════
          4️⃣ "KEEP LISTENING" (Recent Favorites)
          2-Row Horizontal Scrolling Grid
      ═════════════════════════════════════════════════════════════════════ */}
      {keepListening.length > 0 && (
        <section>
          <SectionHeader
            title="Keep Listening"
            subtitle="Your recent rotations & favorites"
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
            {keepListening.map((song, i) => {
              const isCurrent = playerState.currentSong?.id === song.id;
              const isPlaying = isCurrent && playerState.isPlaying;

              return (
                <div
                  key={song.id}
                  onClick={() => playSong(song, keepListening, i)}
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
          5️⃣ "FROM THE COMMUNITY" (Trending Public Playlists)
          Horizontal Carousel of 160dp cards with 2x2 collage artwork
      ═════════════════════════════════════════════════════════════════════ */}
      {communityPlaylists.length > 0 && (
        <section>
          <SectionHeader
            title="From the Community"
            subtitle="Trending community playlists"
            badge="Popular"
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
            {communityPlaylists.map((playlist) => {
              const thumbs = playlist.tracks.slice(0, 4).map((t) => t.artwork).filter(Boolean);

              return (
                <div
                  key={playlist.id}
                  onClick={() => navigate('playlist', { playlistId: playlist.id, playlist })}
                  style={{
                    width: 160,
                    flexShrink: 0,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  {/* 2x2 Collage Artwork or Single Artwork */}
                  <div
                    style={{
                      width: 160,
                      height: 160,
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

                    {/* Glass Play Overlay Badge */}
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
                        color: '#000000',
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
                      {playlist.creator || 'Soundwave Community'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ═════════════════════════════════════════════════════════════════════
          6️⃣ "FORGOTTEN FAVORITES" (Classic Gems)
          4-Row Snapping Horizontal Grid with "Play All" button
      ═════════════════════════════════════════════════════════════════════ */}
      {forgottenFavorites.length > 0 && (
        <section>
          <SectionHeader
            title="Forgotten Favorites"
            subtitle="Rediscover tracks you used to love"
            badge="Rediscover"
            onPlayAll={() => playSong(forgottenFavorites[0], forgottenFavorites, 0)}
          />

          <div
            style={{
              display: 'grid',
              gridTemplateRows: 'repeat(4, auto)',
              gridAutoFlow: 'column',
              gridAutoColumns: '280px',
              gap: 10,
              overflowX: 'auto',
              padding: '0 20px 8px',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {forgottenFavorites.map((song, i) => {
              const isCurrent = playerState.currentSong?.id === song.id;
              const isPlaying = isCurrent && playerState.isPlaying;

              return (
                <div
                  key={song.id}
                  onClick={() => playSong(song, forgottenFavorites, i)}
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
          7️⃣ "SIMILAR TO..." PERSONALIZED SHELVES
          Dynamic horizontal recommendations based on user's top artist / album
      ═════════════════════════════════════════════════════════════════════ */}
      {similarShelves.map((shelf, idx) => (
        <section key={idx}>
          <SectionHeader
            title={shelf.title}
            subtitle={shelf.subtitle}
            onPlayAll={() => playSong(shelf.songs[0], shelf.songs, 0)}
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
            {shelf.songs.map((song, i) => (
              <div
                key={song.id}
                onContextMenu={(e) => {
                  e.preventDefault();
                  triggerLongPress(song);
                }}
              >
                <SongSquareCard
                  song={song}
                  queue={shelf.songs}
                  index={i}
                  size={144}
                />
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* ═════════════════════════════════════════════════════════════════════
          8️⃣ DYNAMIC YOUTUBE MUSIC & TRENDING SHELVES
          • Trending Songs & Charts (4-Row horizontal grid with "Play All")
          • New Release Albums (1-Row horizontal card carousel)
      ═════════════════════════════════════════════════════════════════════ */}
      {/* YouTube Trending & Daily Charts */}
      {ytViewModel.chartsPage?.topSongs && ytViewModel.chartsPage.topSongs.length > 0 && (
        <section>
          <SectionHeader
            title="YouTube Music Top Charts"
            subtitle="Today's top trending songs in India & Worldwide"
            badge="Trending"
            onPlayAll={() => {
              const songs = ytViewModel.getTrendingSongs();
              if (songs.length > 0) playSong(songs[0], songs, 0);
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
            {ytViewModel.getTrendingSongs().map((song, i) => {
              const isCurrent = playerState.currentSong?.id === song.id;
              const isPlaying = isCurrent && playerState.isPlaying;

              return (
                <div
                  key={song.id}
                  onClick={() => playSong(song, ytViewModel.getTrendingSongs(), i)}
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

      {/* YouTube New Release Albums */}
      {ytViewModel.explorePage?.newReleaseAlbums && ytViewModel.explorePage.newReleaseAlbums.length > 0 && (
        <section>
          <SectionHeader
            title="New Releases"
            subtitle="Fresh albums and singles just dropped"
            badge="New"
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
            {ytViewModel.getNewReleaseAlbums().map((album) => (
              <AlbumCard key={album.id} album={album} size={144} />
            ))}
          </div>
        </section>
      )}

      {/* Top Artists from Intelligence */}
      {userTopArtists.length > 0 && (
        <section style={{ marginTop: 12 }}>
          <SectionHeader
            title="Favorite Artists"
            subtitle="Artists you listen to the most"
          />

          <div
            style={{
              display: 'flex',
              gap: 16,
              overflowX: 'auto',
              padding: '0 20px 8px',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {userTopArtists.map((artistName) => (
              <ArtistCard
                key={artistName}
                artist={{
                  id: `artist_${artistName}`,
                  name: artistName,
                  image: '',
                  provider: 'saavn',
                }}
                size={84}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Context Menu Bottom Sheet (Long Press) ── */}
      {selectedSongForMenu && (
        <SongOptionsBottomSheet
          song={selectedSongForMenu}
          onClose={() => setSelectedSongForMenu(null)}
        />
      )}
    </div>
  );
}
