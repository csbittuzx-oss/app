// =============================================================================
//  HomeScreen — Soundwave Android Music Streaming Home Interface
//
//  Sections & Layout Hierarchy (in strict order):
//  1️⃣ SPEED DIAL & SMART RANDOMIZER (Top Section - 3x3 Paged Grid + Shuffle)
//  2️⃣ HERO "QUICK PICKS" CAROUSEL (Full-bleed 250x290dp cards + subtitle tag + accent bar)
//  3️⃣ "DAILY DISCOVER" CAROUSEL (320x340dp large cards + "Play All")
//  4️⃣ "KEEP LISTENING" (Recent Favorites - 2-Row Horizontal Scrolling Grid)
//  5️⃣ "FROM THE COMMUNITY" (160dp cards with 2x2 collage artwork)
//  6️⃣ "FORGOTTEN FAVORITES" (4-Row Snapping Horizontal Grid + "Play All")
//  7️⃣ "SIMILAR TO..." PERSONALIZED SHELVES (Dynamic top artist/album seeds + circular thumb)
//  8️⃣ DYNAMIC YOUTUBE MUSIC & TRENDING SHELVES (Charts 4-Row + New Releases 1-Row)
//  9️⃣ SHIMMER SKELETON LOADING (Animated placeholders during loading)
//  🔟 PULL-TO-REFRESH (SwipeRefresh gesture detection)
// =============================================================================

import React, {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
  useLayoutEffect,
  type TouchEvent,
} from 'react';
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

function MoreVertIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="5" r="1.5" fill="currentColor" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <circle cx="12" cy="19" r="1.5" fill="currentColor" />
    </svg>
  );
}

function RefreshIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
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

function SkeletonBox({
  width,
  height,
  borderRadius = 'var(--radius-md)',
}: {
  width: string | number;
  height: string | number;
  borderRadius?: string;
}) {
  return (
    <div
      className="skeleton"
      style={{
        width,
        height,
        borderRadius,
        flexShrink: 0,
      }}
    />
  );
}

function SkeletonRow({ width = 260 }: { width?: number }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: 8,
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        flexShrink: 0,
        width,
      }}
    >
      <SkeletonBox width={48} height={48} borderRadius="var(--radius-sm)" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <SkeletonBox width="70%" height={12} borderRadius="4px" />
        <SkeletonBox width="45%" height={10} borderRadius="4px" />
      </div>
    </div>
  );
}

// ── Section Animate-In Wrapper ──────────────────────────────────────────────
// Equivalent of Compose `animateItem()` — staggered fade+slide entrance per section

function AnimatedSection({
  children,
  delay = 0,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  style?: React.CSSProperties;
}) {
  return (
    <section
      style={{
        animation: `slideUp 380ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms both`,
        ...style,
      }}
    >
      {children}
    </section>
  );
}

// ── Section Header (shared) ─────────────────────────────────────────────────

function SectionHeader({
  title,
  subtitle,
  badge,
  onPlayAll,
  artistThumb,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  onPlayAll?: () => void;
  artistThumb?: string;
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
      <div style={{ flex: 1, minWidth: 0, paddingRight: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Circular artist thumbnail — shown in Section 7 "Similar To" */}
        {artistThumb && (
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              overflow: 'hidden',
              flexShrink: 0,
              border: '2px solid var(--color-accent)',
              boxShadow: '0 0 0 3px var(--color-accent-dim)',
            }}
          >
            <img
              src={resizeImageUrl(artistThumb, 128, 128)}
              alt=""
              width={44}
              height={44}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
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
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--color-accent-dim)',
                  color: 'var(--color-accent)',
                  flexShrink: 0,
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
                fontSize: 'var(--text-xs)',
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
      </div>

      {onPlayAll && (
        <button
          onClick={onPlayAll}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-full)',
            padding: '6px 14px',
            color: 'var(--color-text-primary)',
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'transform 120ms ease, background 120ms ease',
          }}
          onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.95)')}
          onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          onTouchStart={(e) => (e.currentTarget.style.transform = 'scale(0.95)')}
          onTouchEnd={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        >
          <PlayIcon size={12} color="var(--color-accent)" />
          Play All
        </button>
      )}
    </div>
  );
}

// ── Hero Carousel Subtitle Tag + Accent Indicator Bar ──────────────────────

function HeroSectionHeader({
  tag,
  title,
}: {
  tag: string;
  title: string;
}) {
  return (
    <div style={{ padding: '24px 20px 14px' }}>
      {/* Subtitle tag — e.g. "QUICK PICKS" */}
      <p
        style={{
          margin: '0 0 4px',
          fontSize: 10,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'var(--color-accent)',
        }}
      >
        {tag}
      </p>

      {/* Main bold headline */}
      <h2
        style={{
          margin: '0 0 10px',
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-xl)',
          fontWeight: 800,
          color: 'var(--color-text-primary)',
          letterSpacing: '-0.02em',
          lineHeight: 1.2,
        }}
      >
        {title}
      </h2>

      {/* Accent indicator bar */}
      <div
        style={{
          width: 40,
          height: 3,
          borderRadius: 2,
          background: 'var(--color-accent)',
          boxShadow: '0 0 8px rgba(245,158,11,0.5)',
        }}
      />
    </div>
  );
}

// ── Pull-to-Refresh Indicator ───────────────────────────────────────────────

function PullIndicator({ pullDistance, isRefreshing }: { pullDistance: number; isRefreshing: boolean }) {
  const opacity = Math.min(pullDistance / 60, 1);
  const scale = 0.6 + opacity * 0.4;
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: Math.min(pullDistance, 72),
        opacity,
        transform: `scale(${scale})`,
        transition: isRefreshing ? 'height 300ms ease' : 'none',
        pointerEvents: 'none',
        zIndex: 10,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: 'var(--shadow-md)',
          color: 'var(--color-accent)',
          animation: isRefreshing ? 'spin 0.8s linear infinite' : 'none',
        }}
      >
        <RefreshIcon size={18} />
      </div>
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
  const [similarShelves, setSimilarShelves] = useState<
    Array<{ title: string; subtitle: string; songs: Song[]; artistThumb?: string }>
  >([]);
  const [communityPlaylists, setCommunityPlaylists] = useState<Playlist[]>([]);
  const [isLocalLoading, setIsLocalLoading] = useState(true);

  // Pull-to-Refresh state
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const pullStartY = useRef(0);
  const isPulling = useRef(false);

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
      setTimeout(() => { isRestoringScroll.current = false; }, 80);
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

  // ── Pull-to-Refresh Touch Handlers ───────────────────────────────────────
  const handleTouchStart = useCallback((e: TouchEvent<HTMLDivElement>) => {
    const scrollEl = scrollRef.current;
    if (!scrollEl || scrollEl.scrollTop > 0) return;
    pullStartY.current = e.touches[0].clientY;
    isPulling.current = true;
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent<HTMLDivElement>) => {
    if (!isPulling.current || isRefreshing) return;
    const scrollEl = scrollRef.current;
    if (!scrollEl || scrollEl.scrollTop > 0) {
      isPulling.current = false;
      setPullDistance(0);
      return;
    }
    const delta = e.touches[0].clientY - pullStartY.current;
    if (delta > 0) {
      // Rubber-band damping: reduces pull distance with exponential resistance
      const damped = Math.pow(delta, 0.75);
      setPullDistance(Math.min(damped, 90));
    }
  }, [isRefreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling.current) return;
    isPulling.current = false;
    if (pullDistance >= 60) {
      setIsRefreshing(true);
      setPullDistance(50);
      try {
        await Promise.all([
          ytViewModel.refresh(),
          loadHomePipeline(),
        ]);
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, ytViewModel]);

  // ── 2-Phase Data Loading Engine ───────────────────────────────────────────
  const loadHomePipeline = useCallback(async () => {
    // PHASE 1: INSTANT LOCAL DATA LOADING (Zero Network Delay)
    const favorites = appState.favorites || [];
    const recentlyPlayed = appState.recentlyPlayed || [];

    // 1. Speed Dial & Quick Picks (From favorites + recently played)
    const localQuick = deduplicateSongs([...recentlyPlayed.slice(0, 10), ...favorites.slice(0, 10)]);
    setQuickPicks(localQuick.length > 0 ? localQuick : []);

    // 2. Keep Listening (Most played recently)
    const localKeep = deduplicateSongs([...recentlyPlayed, ...favorites]).slice(0, 14);
    setKeepListening(localKeep);

    // 3. Forgotten Favorites (Items played earlier in history)
    const recentIds = new Set(recentlyPlayed.slice(0, 6).map((s) => s.id));
    const forgotten = favorites.filter((s) => !recentIds.has(s.id));
    setForgottenFavorites(forgotten.length > 0 ? forgotten : favorites.slice(4, 20));

    setIsLocalLoading(false);

    // PHASE 2: PARALLEL NETWORK DATA LOADING
    if (!navigator.onLine) return;

    try {
      // Job 3 — Daily Discover: Seed from 5 random liked songs + smart recommendation engine
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

      // Job 4 — Community Playlists: Discovered through user's top played artists
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

      // Job 5 — Similar Recommendations: Artist & album seeds
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
                  artistThumb: shelf.seedSong?.artwork || shelf.songs[0]?.artwork,
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
  const speedDialRef = useRef<HTMLDivElement>(null);
  const swipeStartX = useRef(0);
  const swipeStartTime = useRef(0);

  const page1Items = speedDialItems.slice(0, 8);
  const page2Items = speedDialItems.slice(8, 17);
  const hasPage2 = page2Items.length > 0;

  // Touch swipe for HorizontalPager
  const handleSpeedDialTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    swipeStartX.current = e.touches[0].clientX;
    swipeStartTime.current = Date.now();
  };

  const handleSpeedDialTouchEnd = (e: TouchEvent<HTMLDivElement>) => {
    const deltaX = e.changedTouches[0].clientX - swipeStartX.current;
    const deltaT = Date.now() - swipeStartTime.current;
    const isSwipe = Math.abs(deltaX) > 40 && deltaT < 350;
    if (!isSwipe || !hasPage2) return;
    if (deltaX < 0 && speedDialPage === 0) setSpeedDialPage(1);
    else if (deltaX > 0 && speedDialPage === 1) setSpeedDialPage(0);
  };

  // ── Greeting Header ───────────────────────────────────────────────────────
  const greeting = getGreeting();

  // ── Hero carousel subtitle tags ───────────────────────────────────────────
  const heroVibeTag = useMemo(() => {
    const pool = quickPicks.slice(0, 8);
    if (pool.length === 0) return 'QUICK PICKS';
    const topGenre = pool[0]?.genre?.toUpperCase() || 'QUICK PICKS';
    const vibeLabels = [
      'LISTEN RIGHT NOW',
      'TOP PICKS FOR YOU',
      'YOUR SOUND',
      'FEEL THE BEAT',
      topGenre,
    ];
    return vibeLabels[Math.floor(Date.now() / 86400000) % vibeLabels.length];
  }, [quickPicks.length]);

  const heroTitle = useMemo(() => {
    if (quickPicks.length === 0) return 'Your Top Tracks';
    const top = quickPicks[0];
    return top.title.length > 24 ? top.title.slice(0, 24) + '…' : top.title;
  }, [quickPicks]);

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="scroll-area"
      style={{
        flex: 1,
        paddingBottom: 'var(--content-bottom-pad, 120px)',
        overflowY: 'auto',
        overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch',
        position: 'relative',
      }}
    >
      {/* ── Pull-to-Refresh Indicator ── */}
      {(pullDistance > 0 || isRefreshing) && (
        <PullIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
      )}

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
              borderRadius: 'var(--radius-md)',
              objectFit: 'cover',
              border: '1px solid var(--color-border)',
            }}
          />
          <div>
            <p
              style={{
                margin: 0,
                fontSize: 'var(--text-xs)',
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
                fontSize: 'var(--text-xl)',
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
          1️⃣ SPEED DIAL & SMART RANDOMIZER
          3x3 Paged Horizontal Grid with HorizontalPager swipe + indicator dots
      ═════════════════════════════════════════════════════════════════════ */}
      <AnimatedSection delay={0} style={{ padding: '0 20px 16px' }}>
        <div
          ref={speedDialRef}
          onTouchStart={handleSpeedDialTouchStart}
          onTouchEnd={handleSpeedDialTouchEnd}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 8,
            transition: 'opacity 200ms ease',
          }}
        >
          {(speedDialPage === 0 ? page1Items : page2Items).map((song, i) => {
            const isCurrent = playerState.currentSong?.id === song.id;
            const isPlaying = isCurrent && playerState.isPlaying;

            return (
              <div
                key={song.id}
                onClick={() => playSong(song, speedDialItems, speedDialPage === 0 ? i : i + 8)}
                onContextMenu={(e) => { e.preventDefault(); triggerLongPress(song); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 8px',
                  background: isCurrent
                    ? 'var(--color-accent-dim)'
                    : 'var(--color-surface)',
                  border: isCurrent
                    ? '1px solid var(--color-accent)'
                    : '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  overflow: 'hidden',
                  position: 'relative',
                  minHeight: 52,
                  transition: 'transform 120ms ease, background 150ms ease',
                }}
                onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.97)')}
                onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                onTouchStart={(e) => (e.currentTarget.style.transform = 'scale(0.97)')}
                onTouchEnd={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              >
                <img
                  src={resizeImageUrl(song.artwork, 128, 128)}
                  alt={song.title}
                  width={38}
                  height={38}
                  loading="lazy"
                  style={{
                    borderRadius: 'var(--radius-sm)',
                    objectFit: 'cover',
                    flexShrink: 0,
                  }}
                  onError={(e) => { (e.target as HTMLImageElement).src = CONFIG.ARTWORK_PLACEHOLDER; }}
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
                  <div style={{ marginRight: 2, flexShrink: 0 }}>
                    <EqBars />
                  </div>
                )}
              </div>
            );
          })}

          {/* Slot 9: Smart Randomizer Button (Page 1 only) */}
          {speedDialPage === 0 && (
            <button
              onClick={handleSmartRandomize}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px',
                background: 'linear-gradient(135deg, var(--color-accent) 0%, #EA580C 100%)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                overflow: 'hidden',
                minHeight: 52,
                color: '#FFFFFF',
                boxShadow: '0 4px 14px rgba(245,158,11,0.38)',
                transition: 'transform 150ms ease',
              }}
              onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.96)')}
              onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              onTouchStart={(e) => (e.currentTarget.style.transform = 'scale(0.96)')}
              onTouchEnd={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(255,255,255,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transform: isRandomizing ? 'rotate(180deg)' : 'none',
                  transition: 'transform 300ms var(--ease-spring)',
                }}
              >
                <ShuffleIcon size={18} color="#FFFFFF" />
              </div>
              <div style={{ textAlign: 'left', minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: '11.5px', fontWeight: 700, lineHeight: 1.2 }}>Shuffle Mix</p>
                <p style={{ margin: 0, fontSize: '10px', opacity: 0.85, whiteSpace: 'nowrap' }}>Smart Random</p>
              </div>
            </button>
          )}
        </div>

        {/* HorizontalPager indicator dots */}
        {hasPage2 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 10 }}>
            {[0, 1].map((page) => (
              <div
                key={page}
                onClick={() => setSpeedDialPage(page)}
                style={{
                  width: speedDialPage === page ? 20 : 6,
                  height: 6,
                  borderRadius: 3,
                  background: speedDialPage === page ? 'var(--color-accent)' : 'var(--color-border)',
                  cursor: 'pointer',
                  transition: 'all 220ms var(--ease-spring)',
                  boxShadow: speedDialPage === page ? '0 0 6px rgba(245,158,11,0.5)' : 'none',
                }}
              />
            ))}
          </div>
        )}
      </AnimatedSection>

      {/* ═════════════════════════════════════════════════════════════════════
          2️⃣ HERO "QUICK PICKS" CAROUSEL
          250x290dp cards — subtitle tag, accent bar, glass play badge, gradient scrim
      ═════════════════════════════════════════════════════════════════════ */}
      <AnimatedSection delay={60}>
        <HeroSectionHeader tag={heroVibeTag} title={heroTitle} />

        <div
          style={{
            display: 'flex',
            gap: 16,
            overflowX: 'auto',
            padding: '0 20px 8px',
            scrollSnapType: 'x mandatory',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
          }}
        >
          {isLocalLoading && quickPicks.length === 0 ? (
            [0, 1, 2].map((k) => (
              <SkeletonBox key={k} width={250} height={290} borderRadius="var(--radius-lg)" />
            ))
          ) : (
            quickPicks.slice(0, 8).map((song, i) => {
              const isCurrent = playerState.currentSong?.id === song.id;
              const isPlaying = isCurrent && playerState.isPlaying;

              return (
                <div
                  key={song.id}
                  onClick={() => playSong(song, quickPicks, i)}
                  onContextMenu={(e) => { e.preventDefault(); triggerLongPress(song); }}
                  style={{
                    flexShrink: 0,
                    width: 250,
                    height: 290,
                    borderRadius: 'var(--radius-lg)',
                    position: 'relative',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    scrollSnapAlign: 'start',
                    boxShadow: isCurrent
                      ? '0 8px 28px rgba(245,158,11,0.3)'
                      : '0 8px 24px rgba(0,0,0,0.45)',
                    border: isCurrent
                      ? '2px solid var(--color-accent)'
                      : '1px solid var(--color-border)',
                    transition: 'transform 180ms ease, box-shadow 180ms ease',
                  }}
                  onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.98)')}
                  onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                  onTouchStart={(e) => (e.currentTarget.style.transform = 'scale(0.98)')}
                  onTouchEnd={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                >
                  {/* Full-bleed high-res artwork */}
                  <img
                    src={resizeImageUrl(song.artworkLg || song.artwork, 800, 800)}
                    alt={song.title}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    onError={(e) => { (e.target as HTMLImageElement).src = CONFIG.ARTWORK_PLACEHOLDER; }}
                  />

                  {/* Deep multi-stop gradient scrim for text legibility */}
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background:
                        'linear-gradient(to top, rgba(0,0,0,0.96) 0%, rgba(0,0,0,0.58) 40%, rgba(0,0,0,0.1) 70%, transparent 100%)',
                      pointerEvents: 'none',
                    }}
                  />

                  {/* Top-left circular glass Play Badge (32dp) */}
                  <div
                    style={{
                      position: 'absolute',
                      top: 14,
                      left: 14,
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      background: 'rgba(255,255,255,0.22)',
                      backdropFilter: 'blur(16px) saturate(180%)',
                      WebkitBackdropFilter: 'blur(16px) saturate(180%)',
                      border: '1px solid rgba(255,255,255,0.35)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: isCurrent ? 'var(--color-accent)' : '#FFFFFF',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
                    }}
                  >
                    <PlayIcon size={18} color={isCurrent ? 'var(--color-accent)' : '#FFFFFF'} />
                  </div>

                  {/* Top-right active Volume Equalizer badge */}
                  {isPlaying && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 14,
                        right: 14,
                        padding: '6px 10px',
                        background: 'rgba(0,0,0,0.65)',
                        backdropFilter: 'blur(8px)',
                        WebkitBackdropFilter: 'blur(8px)',
                        borderRadius: 'var(--radius-full)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <EqBars />
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-accent)' }}>
                        NOW
                      </span>
                    </div>
                  )}

                  {/* Bottom-aligned bold title & artist subtitle */}
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
                        fontFamily: 'var(--font-display)',
                        textShadow: '0 2px 8px rgba(0,0,0,0.6)',
                      }}
                    >
                      {song.title}
                    </h3>
                    <p
                      style={{
                        margin: '5px 0 0',
                        fontSize: '13px',
                        color: 'rgba(255,255,255,0.78)',
                        fontWeight: 500,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        textShadow: '0 1px 4px rgba(0,0,0,0.5)',
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
      </AnimatedSection>

      {/* ═════════════════════════════════════════════════════════════════════
          3️⃣ "DAILY DISCOVER" CAROUSEL
          HorizontalMultiBrowseCarousel — 320x340dp large artwork cards
      ═════════════════════════════════════════════════════════════════════ */}
      <AnimatedSection delay={100}>
        <SectionHeader
          title="Your Daily Discover"
          subtitle="Fresh picks tailored to your listening habits"
          badge="Daily"
          onPlayAll={
            dailyDiscover.length > 0
              ? () => playSong(dailyDiscover[0], dailyDiscover, 0)
              : undefined
          }
        />

        <div
          style={{
            display: 'flex',
            gap: 14,
            overflowX: 'auto',
            padding: '0 20px 8px',
            scrollSnapType: 'x mandatory',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
          }}
        >
          {dailyDiscover.length === 0 ? (
            [0, 1, 2].map((k) => (
              <SkeletonBox key={k} width={220} height={260} borderRadius="var(--radius-lg)" />
            ))
          ) : (
            dailyDiscover.map((song, i) => {
              const isCurrent = playerState.currentSong?.id === song.id;
              const isPlaying = isCurrent && playerState.isPlaying;

              return (
                <div
                  key={song.id}
                  onClick={() => playSong(song, dailyDiscover, i)}
                  onContextMenu={(e) => { e.preventDefault(); triggerLongPress(song); }}
                  style={{
                    flexShrink: 0,
                    width: 220,
                    height: 260,
                    borderRadius: 'var(--radius-lg)',
                    position: 'relative',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    scrollSnapAlign: 'start',
                    boxShadow: isCurrent
                      ? '0 6px 24px rgba(245,158,11,0.28)'
                      : '0 4px 16px rgba(0,0,0,0.4)',
                    border: isCurrent
                      ? '2px solid var(--color-accent)'
                      : '1px solid var(--color-border)',
                    transition: 'transform 160ms ease',
                  }}
                  onTouchStart={(e) => (e.currentTarget.style.transform = 'scale(0.97)')}
                  onTouchEnd={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                >
                  {/* Large artwork showcase */}
                  <img
                    src={resizeImageUrl(song.artworkLg || song.artwork, 600, 600)}
                    alt={song.title}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    onError={(e) => { (e.target as HTMLImageElement).src = CONFIG.ARTWORK_PLACEHOLDER; }}
                  />

                  {/* Gradient scrim */}
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, transparent 55%)',
                      pointerEvents: 'none',
                    }}
                  />

                  {/* EQ bars if active */}
                  {isPlaying && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 12,
                        right: 12,
                        padding: '5px 9px',
                        background: 'rgba(0,0,0,0.6)',
                        backdropFilter: 'blur(8px)',
                        borderRadius: 'var(--radius-full)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                      }}
                    >
                      <EqBars />
                    </div>
                  )}

                  {/* Track info */}
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 14,
                      left: 14,
                      right: 14,
                      pointerEvents: 'none',
                    }}
                  >
                    <p
                      style={{
                        margin: 0,
                        fontSize: '14px',
                        fontWeight: 700,
                        color: isCurrent ? 'var(--color-accent)' : '#FFF',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        lineHeight: 1.3,
                      }}
                    >
                      {song.title}
                    </p>
                    <p
                      style={{
                        margin: '4px 0 0',
                        fontSize: '12px',
                        color: 'rgba(255,255,255,0.72)',
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
      </AnimatedSection>

      {/* ═════════════════════════════════════════════════════════════════════
          4️⃣ "KEEP LISTENING" — LazyHorizontalGrid 2 fixed rows
          Mix of most played albums, artists, songs from past 2 weeks
      ═════════════════════════════════════════════════════════════════════ */}
      {(keepListening.length > 0 || isLocalLoading) && (
        <AnimatedSection delay={140}>
          <SectionHeader
            title="Keep Listening"
            subtitle="Jump back into your recent sessions"
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
              scrollbarWidth: 'none',
            }}
          >
            {isLocalLoading && keepListening.length === 0
              ? [0, 1, 2, 3, 4, 5].map((k) => <SkeletonRow key={k} width={260} />)
              : keepListening.map((song, i) => {
                  const isCurrent = playerState.currentSong?.id === song.id;
                  const isPlaying = isCurrent && playerState.isPlaying;

                  return (
                    <div
                      key={song.id}
                      onClick={() => playSong(song, keepListening, i)}
                      onContextMenu={(e) => { e.preventDefault(); triggerLongPress(song); }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: 8,
                        background: 'var(--color-surface)',
                        border: isCurrent
                          ? '1px solid var(--color-accent)'
                          : '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                        overflow: 'hidden',
                        transition: 'transform 120ms ease',
                      }}
                      onTouchStart={(e) => (e.currentTarget.style.transform = 'scale(0.97)')}
                      onTouchEnd={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                    >
                      <img
                        src={resizeImageUrl(song.artwork, 160, 160)}
                        alt={song.title}
                        width={48}
                        height={48}
                        loading="lazy"
                        style={{ borderRadius: 'var(--radius-sm)', objectFit: 'cover', flexShrink: 0 }}
                        onError={(e) => { (e.target as HTMLImageElement).src = CONFIG.ARTWORK_PLACEHOLDER; }}
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
        </AnimatedSection>
      )}

      {/* ═════════════════════════════════════════════════════════════════════
          5️⃣ "FROM THE COMMUNITY" — LazyRow 160dp cards with 2x2 collage
      ═════════════════════════════════════════════════════════════════════ */}
      {(communityPlaylists.length > 0 || !isLocalLoading) && (
        <AnimatedSection delay={180}>
          <SectionHeader
            title="From the Community"
            subtitle="Playlists curated by your favourite artists' fans"
            badge="Popular"
          />

          <div
            style={{
              display: 'flex',
              gap: 14,
              overflowX: 'auto',
              padding: '0 20px 8px',
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'none',
            }}
          >
            {communityPlaylists.length === 0 ? (
              [0, 1, 2].map((k) => (
                <SkeletonBox key={k} width={160} height={200} borderRadius="var(--radius-lg)" />
              ))
            ) : (
              communityPlaylists.map((playlist) => {
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
                    onTouchStart={(e) => (e.currentTarget.style.opacity = '0.85')}
                    onTouchEnd={(e) => (e.currentTarget.style.opacity = '1')}
                  >
                    {/* 2×2 collage artwork grid */}
                    <div
                      style={{
                        width: 160,
                        height: 160,
                        borderRadius: 'var(--radius-lg)',
                        overflow: 'hidden',
                        position: 'relative',
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        boxShadow: 'var(--shadow-md)',
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
                          onError={(e) => { (e.target as HTMLImageElement).src = CONFIG.ARTWORK_PLACEHOLDER; }}
                        />
                      )}

                      {/* Accent play button overlay */}
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
                          boxShadow: 'var(--shadow-md)',
                        }}
                      >
                        <PlayIcon size={14} color="var(--color-accent-on)" />
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
              })
            )}
          </div>
        </AnimatedSection>
      )}

      {/* ═════════════════════════════════════════════════════════════════════
          6️⃣ "FORGOTTEN FAVORITES" — LazyHorizontalGrid 4 rows + snap fling
          rememberSnapFlingBehavior equivalent via scroll-snap-type
      ═════════════════════════════════════════════════════════════════════ */}
      {forgottenFavorites.length > 0 && (
        <AnimatedSection delay={220}>
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
              scrollbarWidth: 'none',
              // rememberSnapFlingBehavior equivalent
              scrollSnapType: 'x mandatory',
            }}
          >
            {forgottenFavorites.map((song, i) => {
              const isCurrent = playerState.currentSong?.id === song.id;
              const isPlaying = isCurrent && playerState.isPlaying;

              return (
                <div
                  key={song.id}
                  onClick={() => playSong(song, forgottenFavorites, i)}
                  onContextMenu={(e) => { e.preventDefault(); triggerLongPress(song); }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: 8,
                    background: 'var(--color-surface)',
                    border: isCurrent
                      ? '1px solid var(--color-accent)'
                      : '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    scrollSnapAlign: 'start',
                    transition: 'transform 120ms ease',
                  }}
                  onTouchStart={(e) => (e.currentTarget.style.transform = 'scale(0.97)')}
                  onTouchEnd={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                >
                  <img
                    src={resizeImageUrl(song.artwork, 160, 160)}
                    alt={song.title}
                    width={44}
                    height={44}
                    loading="lazy"
                    style={{ borderRadius: 'var(--radius-sm)', objectFit: 'cover', flexShrink: 0 }}
                    onError={(e) => { (e.target as HTMLImageElement).src = CONFIG.ARTWORK_PLACEHOLDER; }}
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

                  {/* 3-dots context menu button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); triggerLongPress(song); }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--color-text-muted)',
                      cursor: 'pointer',
                      padding: '4px',
                      borderRadius: 'var(--radius-full)',
                      display: 'flex',
                      alignItems: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {isPlaying ? <EqBars /> : <MoreVertIcon size={18} />}
                  </button>
                </div>
              );
            })}
          </div>
        </AnimatedSection>
      )}

      {/* ═════════════════════════════════════════════════════════════════════
          7️⃣ "SIMILAR TO..." PERSONALIZED SHELVES
          Circular artist thumbnail + LazyRow of 10 similar songs
      ═════════════════════════════════════════════════════════════════════ */}
      {similarShelves.map((shelf, idx) => (
        <AnimatedSection key={idx} delay={260}>
          <SectionHeader
            title={shelf.title}
            subtitle={shelf.subtitle}
            onPlayAll={() => playSong(shelf.songs[0], shelf.songs, 0)}
            artistThumb={shelf.artistThumb}
          />

          <div
            style={{
              display: 'flex',
              gap: 14,
              overflowX: 'auto',
              padding: '0 20px 8px',
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'none',
            }}
          >
            {shelf.songs.map((song, i) => (
              <div
                key={song.id}
                onContextMenu={(e) => { e.preventDefault(); triggerLongPress(song); }}
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
        </AnimatedSection>
      ))}

      {/* ═════════════════════════════════════════════════════════════════════
          8️⃣ DYNAMIC YOUTUBE MUSIC & TRENDING SHELVES
          • Song-only sections → 4-row horizontal grid (LazyHorizontalGrid)
          • Mixed / Album sections → horizontal card carousels (LazyRow)
          • Trending Charts (4-row + ranked numbers)
          • New Release Albums (1-row AlbumCard carousel)
      ═════════════════════════════════════════════════════════════════════ */}

      {/* Dynamic home sections from YouTube InnerTube homePage.sections */}
      {ytViewModel.getHomeSections().slice(0, 6).map((section, sIdx) => {
        // Determine if section has album/playlist items (mixed) or songs only
        const hasSongItems = section.items.some((item) => item.type === 'song');
        const hasAlbumItems = section.items.some(
          (item) => item.type === 'album' || item.type === 'playlist'
        );
        const isMixed = hasAlbumItems || (!hasSongItems && section.items.length > 0);

        const sectionSongs = hasSongItems
          ? section.items
              .filter((item) => item.type === 'song')
              .map((item) => ({
                id: `yt_${item.id}`,
                title: item.title || 'Unknown',
                artist:
                  (item as any).artists?.map((a: any) => a.name).join(', ') ||
                  (item as any).artist ||
                  'Unknown Artist',
                album: (item as any).album || '',
                artwork: item.thumbnail || CONFIG.ARTWORK_PLACEHOLDER,
                artworkLg: item.thumbnail,
                previewUrl: null as null,
                duration: (item as any).duration || 0,
                provider: 'youtube' as const,
              }))
          : [];

        return (
          <AnimatedSection key={sIdx} delay={300 + sIdx * 40}>
            <SectionHeader
              title={section.title || 'Recommended'}
              subtitle={
                section.items.length > 0
                  ? `${section.items.length} tracks`
                  : undefined
              }
              onPlayAll={
                sectionSongs.length > 0
                  ? () => playSong(sectionSongs[0], sectionSongs, 0)
                  : undefined
              }
            />

            {isMixed ? (
              // Mixed / album sections — horizontal LazyRow carousels
              <div
                style={{
                  display: 'flex',
                  gap: 14,
                  overflowX: 'auto',
                  padding: '0 20px 8px',
                  WebkitOverflowScrolling: 'touch',
                  scrollbarWidth: 'none',
                }}
              >
                {section.items.slice(0, 12).map((item) => {
                  const album = {
                    id: item.id || '',
                    title: item.title || 'Unknown',
                    artist:
                      (item as any).artists?.map((a: any) => a.name).join(', ') ||
                      (item as any).artist ||
                      'Unknown',
                    artwork: item.thumbnail || CONFIG.ARTWORK_PLACEHOLDER,
                    provider: 'youtube' as const,
                  };
                  return (
                    <AlbumCard
                      key={item.id}
                      album={album}
                      size={144}
                    />
                  );
                })}
              </div>
            ) : (
              // Song-only sections — 4-row LazyHorizontalGrid
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
                  scrollbarWidth: 'none',
                }}
              >
                {sectionSongs.slice(0, 16).map((song, i) => {
                  const isCurrent = playerState.currentSong?.id === song.id;
                  const isPlaying = isCurrent && playerState.isPlaying;

                  return (
                    <div
                      key={song.id}
                      onClick={() => playSong(song, sectionSongs, i)}
                      onContextMenu={(e) => { e.preventDefault(); triggerLongPress(song); }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: 8,
                        background: 'var(--color-surface)',
                        border: isCurrent
                          ? '1px solid var(--color-accent)'
                          : '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                        transition: 'transform 120ms ease',
                      }}
                      onTouchStart={(e) => (e.currentTarget.style.transform = 'scale(0.97)')}
                      onTouchEnd={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                    >
                      <img
                        src={resizeImageUrl(song.artwork, 160, 160)}
                        alt={song.title}
                        width={44}
                        height={44}
                        loading="lazy"
                        style={{ borderRadius: 'var(--radius-sm)', objectFit: 'cover', flexShrink: 0 }}
                        onError={(e) => { (e.target as HTMLImageElement).src = CONFIG.ARTWORK_PLACEHOLDER; }}
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
            )}
          </AnimatedSection>
        );
      })}

      {/* YouTube Trending & Daily Charts — 4-row horizontal grid with ranked numbers */}
      {ytViewModel.chartsPage?.topSongs && ytViewModel.chartsPage.topSongs.length > 0 && (
        <AnimatedSection delay={380}>
          <SectionHeader
            title="Trending Charts"
            subtitle="Today's top songs in India & Worldwide"
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
              scrollbarWidth: 'none',
            }}
          >
            {ytViewModel.getTrendingSongs().map((song, i) => {
              const isCurrent = playerState.currentSong?.id === song.id;
              const isPlaying = isCurrent && playerState.isPlaying;

              return (
                <div
                  key={song.id}
                  onClick={() => playSong(song, ytViewModel.getTrendingSongs(), i)}
                  onContextMenu={(e) => { e.preventDefault(); triggerLongPress(song); }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: 8,
                    background: 'var(--color-surface)',
                    border: isCurrent
                      ? '1px solid var(--color-accent)'
                      : '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    transition: 'transform 120ms ease',
                  }}
                  onTouchStart={(e) => (e.currentTarget.style.transform = 'scale(0.97)')}
                  onTouchEnd={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                >
                  {/* Chart rank number */}
                  <span
                    style={{
                      width: 24,
                      fontSize: '13px',
                      fontWeight: 800,
                      color: i < 3 ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                      textAlign: 'center',
                      fontFamily: 'var(--font-display)',
                      flexShrink: 0,
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
                    style={{ borderRadius: 'var(--radius-sm)', objectFit: 'cover', flexShrink: 0 }}
                    onError={(e) => { (e.target as HTMLImageElement).src = CONFIG.ARTWORK_PLACEHOLDER; }}
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
        </AnimatedSection>
      )}

      {/* New Release Albums — 1-row AlbumCard horizontal LazyRow */}
      {ytViewModel.explorePage?.newReleaseAlbums &&
        ytViewModel.explorePage.newReleaseAlbums.length > 0 && (
          <AnimatedSection delay={420}>
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
                scrollbarWidth: 'none',
              }}
            >
              {ytViewModel.getNewReleaseAlbums().map((album) => (
                <AlbumCard key={album.id} album={album} size={144} />
              ))}
            </div>
          </AnimatedSection>
        )}

      {/* Top Artists */}
      {userTopArtists.length > 0 && (
        <AnimatedSection delay={460} style={{ marginTop: 12 }}>
          <SectionHeader
            title="Favourite Artists"
            subtitle="Artists you listen to the most"
          />

          <div
            style={{
              display: 'flex',
              gap: 16,
              overflowX: 'auto',
              padding: '0 20px 8px',
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'none',
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
        </AnimatedSection>
      )}

      {/* ── Context Menu Bottom Sheet (Long Press / 3-dots) ── */}
      {selectedSongForMenu && (
        <SongOptionsBottomSheet
          song={selectedSongForMenu}
          onClose={() => setSelectedSongForMenu(null)}
        />
      )}
    </div>
  );
}
