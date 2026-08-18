import React, { useState, useEffect, useRef } from 'react';
import { usePlayer } from '../../state/PlayerContext';
import { useApp } from '../../state/AppContext';
import { getLyrics } from '../../data/api/lyricsApi';
import { NowPlayingMenuSheet } from './NowPlayingMenuSheet';
import type { Lyrics } from '../../data/models';
import { formatDuration } from '../../core/utils';
import { CONFIG } from '../../config';
import { extractArtworkTheme, DEFAULT_DARK_ARTWORK_THEME, type ExtractedArtworkTheme } from '../../core/utils/colorExtractor';

// ─── SVG Icons ────────────────────────────────────────────────────────────────

const icons = {
  close: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><polyline points="6 9 12 15 18 9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  menu: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <line x1="4" y1="6" x2="20" y2="6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <line x1="4" y1="18" x2="20" y2="18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  ),
  prev: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><polygon points="19 20 9 12 19 4 19 20" fill="currentColor"/><line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>,
  next: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><polygon points="5 4 15 12 5 20 5 4" fill="currentColor"/><line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>,
  play: <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg>,
  pause: <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>,
  heart: (filled: boolean) => <svg width="22" height="22" viewBox="0 0 24 24" fill={filled ? 'var(--color-accent)' : 'none'} aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" stroke={filled ? 'var(--color-accent)' : 'currentColor'} strokeWidth="1.75"/></svg>,
  shuffle: (on: boolean) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ color: on ? 'var(--color-accent)' : 'currentColor' }} aria-hidden="true"><polyline points="16 3 21 3 21 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/><line x1="4" y1="20" x2="21" y2="3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/><polyline points="21 16 21 21 16 21" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/><line x1="15" y1="9" x2="21" y2="15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/><line x1="4" y1="4" x2="9" y2="9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  repeat: (mode: string) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ color: mode !== 'off' ? 'var(--color-accent)' : 'currentColor' }} aria-hidden="true">
      <polyline points="17 1 21 5 17 9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M3 11V9a4 4 0 014-4h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
      <polyline points="7 23 3 19 7 15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M21 13v2a4 4 0 01-4 4H3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
      {mode === 'one' && <text x="12" y="14" textAnchor="middle" fontSize="7" fill="var(--color-accent)" fontWeight="bold">1</text>}
    </svg>
  ),
  queue: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/><line x1="8" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/><line x1="8" y1="18" x2="21" y2="18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/><circle cx="3" cy="6" r="1.5" fill="currentColor"/><circle cx="3" cy="12" r="1.5" fill="currentColor"/><circle cx="3" cy="18" r="1.5" fill="currentColor"/></svg>,
  lyrics: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  loading: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ animation: 'spin 0.8s linear infinite' }}><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0110 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>,
};

export function FullPlayer() {
  const { state, playSong, togglePlay, next, previous, seek, seekToTime, toggleShuffle, toggleRepeat, closeFullPlayer, openQueue } = usePlayer();
  const { isFavorite, toggleFavorite, state: appState } = useApp();
  const { currentSong, isPlaying, progress, currentTime, duration, isLoading, shuffle, repeat, queue, queueIndex, error } = state;
  const isDark = appState.theme === 'dark';

  const [artworkTheme, setArtworkTheme] = useState<ExtractedArtworkTheme>(DEFAULT_DARK_ARTWORK_THEME);

  // Dynamically extract dominant background colors from currently playing song's artwork
  useEffect(() => {
    if (!currentSong) return;
    const artworkUrl = currentSong.artworkLg || currentSong.artwork;
    let isCancelled = false;

    extractArtworkTheme(artworkUrl).then((theme) => {
      if (!isCancelled) {
        setArtworkTheme(theme);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [currentSong?.id, currentSong?.artwork, currentSong?.artworkLg]);

  const [showMenuSheet, setShowMenuSheet] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [lyrics, setLyrics] = useState<Lyrics | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricsError, setLyricsError] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragProgress, setDragProgress] = useState(0);
  const progressRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  const lyricsContainerRef = useRef<HTMLDivElement | null>(null);
  const isUserScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<any>(null);

  // ── Gestures State ──
  const [dismissOffsetY, setDismissOffsetY] = useState(0);
  const [isDraggingDismiss, setIsDraggingDismiss] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const rootTouchStartPosRef = useRef({ x: 0, y: 0, time: 0 });
  const isRootDraggingRef = useRef(false);

  // Artwork swipe gestures state
  const [artworkOffsetX, setArtworkOffsetX] = useState(0);
  const [isDraggingArtwork, setIsDraggingArtwork] = useState(false);
  const artworkTouchStartPosRef = useRef({ x: 0, y: 0, time: 0 });
  const artworkGestureModeRef = useRef<'none' | 'horizontal' | 'dismiss'>('none');
  const artworkMovedRef = useRef(false);

  const liked = currentSong ? isFavorite(currentSong.id) : false;

  // Root container touch handlers (Swipe down to close Now Playing)
  const handleRootTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    if (isClosing) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('button, [role="slider"], #player-progress-bar, input, .btn-icon, .btn-ghost, #full-player-menu-sheet, #now-playing-artwork-card, .artwork-touch-area')) {
      isRootDraggingRef.current = false;
      return;
    }

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    rootTouchStartPosRef.current = { x: clientX, y: clientY, time: Date.now() };
    isRootDraggingRef.current = false;
  };

  const handleRootTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (isClosing || !rootTouchStartPosRef.current.time) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const dx = clientX - rootTouchStartPosRef.current.x;
    const dy = clientY - rootTouchStartPosRef.current.y;

    // Check if touching inside lyrics container while scrolled down
    if (showLyrics && lyricsContainerRef.current && lyricsContainerRef.current.scrollTop > 0) {
      return;
    }

    if (!isRootDraggingRef.current) {
      if (dy > 8 && dy > Math.abs(dx)) {
        isRootDraggingRef.current = true;
        setIsDraggingDismiss(true);
      }
    }

    if (isRootDraggingRef.current) {
      if (dy > 0) {
        const clampedDy = dy > 200 ? 200 + (dy - 200) * 0.55 : dy;
        setDismissOffsetY(clampedDy);
      } else {
        setDismissOffsetY(0);
      }
    }
  };

  const handleRootTouchEnd = () => {
    if (isRootDraggingRef.current) {
      const elapsed = Math.max(1, Date.now() - rootTouchStartPosRef.current.time);
      const velocity = dismissOffsetY / elapsed;

      // Threshold: >110px or quick flick downward (>0.45px/ms & >35px)
      if (dismissOffsetY >= 110 || (velocity > 0.45 && dismissOffsetY > 35)) {
        setIsClosing(true);
        setTimeout(() => {
          closeFullPlayer();
        }, 220);
      } else {
        setDismissOffsetY(0);
        setIsDraggingDismiss(false);
      }
      isRootDraggingRef.current = false;
    }
    rootTouchStartPosRef.current = { x: 0, y: 0, time: 0 };
  };

  // Swipe gesture handlers specifically for Album Artwork
  const handleArtworkTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    if (isClosing) return;
    e.stopPropagation();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    artworkTouchStartPosRef.current = { x: clientX, y: clientY, time: Date.now() };
    artworkGestureModeRef.current = 'none';
    artworkMovedRef.current = false;
    setIsDraggingArtwork(true);
  };

  const handleArtworkTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (isClosing) return;
    e.stopPropagation();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const dx = clientX - artworkTouchStartPosRef.current.x;
    const dy = clientY - artworkTouchStartPosRef.current.y;

    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      artworkMovedRef.current = true;
    }

    if (artworkGestureModeRef.current === 'none') {
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 6) {
        artworkGestureModeRef.current = 'horizontal';
      } else if (dy > 8 && dy > Math.abs(dx)) {
        artworkGestureModeRef.current = 'dismiss';
        setIsDraggingArtwork(false);
        setIsDraggingDismiss(true);
      }
    }

    if (artworkGestureModeRef.current === 'horizontal') {
      // Elastic resistance
      const clampedDx = Math.abs(dx) > 140
        ? Math.sign(dx) * (140 + (Math.abs(dx) - 140) * 0.35)
        : dx;
      setArtworkOffsetX(clampedDx);
    } else if (artworkGestureModeRef.current === 'dismiss') {
      if (dy > 0) {
        const clampedDy = dy > 200 ? 200 + (dy - 200) * 0.55 : dy;
        setDismissOffsetY(clampedDy);
      } else {
        setDismissOffsetY(0);
      }
    }
  };

  const handleArtworkTouchEnd = (e?: React.TouchEvent | React.MouseEvent) => {
    if (e) e.stopPropagation();

    if (artworkGestureModeRef.current === 'horizontal') {
      // Swipe left (artworkOffsetX <= -40) -> NEXT track
      if (artworkOffsetX <= -40) {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(30);
        }
        next();
      }
      // Swipe right (artworkOffsetX >= 40) -> PREVIOUS track
      else if (artworkOffsetX >= 40) {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(30);
        }
        previous(true);
      }
      setArtworkOffsetX(0);
      setIsDraggingArtwork(false);
      artworkGestureModeRef.current = 'none';
    } else if (artworkGestureModeRef.current === 'dismiss') {
      const elapsed = Math.max(1, Date.now() - artworkTouchStartPosRef.current.time);
      const velocity = dismissOffsetY / elapsed;
      if (dismissOffsetY >= 110 || (velocity > 0.45 && dismissOffsetY > 35)) {
        setIsClosing(true);
        setTimeout(() => {
          closeFullPlayer();
        }, 220);
      } else {
        setDismissOffsetY(0);
        setIsDraggingDismiss(false);
      }
      artworkGestureModeRef.current = 'none';
      setIsDraggingArtwork(false);
    } else {
      setArtworkOffsetX(0);
      setIsDraggingArtwork(false);
      artworkGestureModeRef.current = 'none';
    }
  };

  // Fetch lyrics with multi-tiered LRCLIB & JioSaavn engine
  useEffect(() => {
    if (!currentSong || !showLyrics) return;
    setLyrics(null);
    setLyricsError(false);
    setLyricsLoading(true);
    getLyrics(currentSong.artist, currentSong.title, currentSong.duration)
      .then((l) => {
        setLyrics(l);
        setLyricsError(!l || l.lines.length === 0);
      })
      .catch(() => setLyricsError(true))
      .finally(() => setLyricsLoading(false));
  }, [currentSong, showLyrics]);

  // Compute active lyric line index based on playback timestamp
  const activeLineIndex = React.useMemo(() => {
    if (!lyrics || !lyrics.synced || lyrics.lines.length === 0) return -1;
    let active = -1;
    for (let i = 0; i < lyrics.lines.length; i++) {
      const lineTime = lyrics.lines[i].time ?? 0;
      if (lineTime <= currentTime + 0.25) {
        active = i;
      } else {
        break;
      }
    }
    return active;
  }, [lyrics, currentTime]);

  // Auto-scroll the active lyric line to viewport center smoothly without whole list jumping
  useEffect(() => {
    if (activeLineIndex >= 0 && lyricsContainerRef.current && !isUserScrollingRef.current) {
      const container = lyricsContainerRef.current;
      const activeEl = lineRefs.current[activeLineIndex];
      if (activeEl) {
        const targetScrollTop = activeEl.offsetTop - (container.clientHeight / 2) + (activeEl.clientHeight / 2);
        container.scrollTo({
          top: Math.max(0, targetScrollTop),
          behavior: 'smooth',
        });
      }
    }
  }, [activeLineIndex]);

  const handleLyricsUserScroll = () => {
    isUserScrollingRef.current = true;
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      isUserScrollingRef.current = false;
    }, 2800);
  };

  if (!currentSong) return null;

  const displayProgress = isDragging ? dragProgress : progress;
  const displayTime = isDragging ? dragProgress * duration : currentTime;

  // ─── Progress bar drag handling ───────────────────────────────────────────
  const handleProgressInteraction = (e: React.MouseEvent | React.TouchEvent) => {
    if (!progressRef.current) return;
    const rect = progressRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const p = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setDragProgress(p);
    seek(p);
  };

  return (
    <div
      id="full-player"
      onTouchStart={handleRootTouchStart}
      onTouchMove={handleRootTouchMove}
      onTouchEnd={handleRootTouchEnd}
      onTouchCancel={handleRootTouchEnd}
      onMouseDown={handleRootTouchStart}
      onMouseMove={handleRootTouchMove}
      onMouseUp={handleRootTouchEnd}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: isDark ? artworkTheme.gradient : 'var(--color-bg)',
        display: 'flex', flexDirection: 'column',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        transform: isClosing
          ? 'translate3d(0, 100%, 0)'
          : dismissOffsetY > 0
          ? `translate3d(0, ${dismissOffsetY}px, 0)`
          : 'translate3d(0, 0, 0)',
        opacity: isClosing ? 0 : dismissOffsetY > 0 ? Math.max(0.65, 1 - (dismissOffsetY / 600)) : 1,
        borderRadius: dismissOffsetY > 0 ? `${Math.min(28, dismissOffsetY * 0.18)}px` : '0px',
        animation: !isClosing && dismissOffsetY === 0 ? 'slideUp 350ms var(--ease-decelerate)' : 'none',
        transition: (isDraggingDismiss || isDraggingArtwork)
          ? 'background 650ms cubic-bezier(0.2, 0.8, 0.2, 1)'
          : isClosing
          ? 'transform 220ms var(--ease-decelerate), opacity 220ms ease, border-radius 220ms ease, background 650ms cubic-bezier(0.2, 0.8, 0.2, 1)'
          : 'transform 280ms cubic-bezier(0.2, 0.9, 0.3, 1), opacity 280ms ease, border-radius 280ms ease, background 650ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        overflow: 'hidden',
        willChange: 'transform, opacity, border-radius',
        touchAction: 'pan-x pan-y',
      }}
    >
      {/* Background artwork dynamic atmospheric glow */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: -1,
        background: isDark
          ? artworkTheme.ambientGlow
          : `radial-gradient(ellipse at 50% 30%, rgba(245,158,11,0.08) 0%, transparent 65%)`,
        transition: 'background 650ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        pointerEvents: 'none',
      }} aria-hidden="true" />

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px 8px' }}>
        <button id="full-player-close-btn" aria-label="Collapse player" onClick={closeFullPlayer} className="btn-icon" style={{ minWidth: 44, minHeight: 44 }}>
          {icons.close}
        </button>
        <div style={{ textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>
            Now Playing
          </p>
        </div>
        <button
          id="full-player-menu-btn"
          aria-label="Track options menu"
          onClick={() => setShowMenuSheet(true)}
          className="btn-icon"
          style={{ minWidth: 44, minHeight: 44, color: 'var(--color-text-primary)' }}
        >
          {icons.menu}
        </button>
      </div>

      {/* ── Main content ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0 24px', overflow: 'hidden' }}>

        {/* Artwork or Lyrics */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 0 }}>
          {!showLyrics ? (
            /* Artwork with Pause/Play Morphing & Swipe Gesture Support */
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                padding: '16px 0',
                userSelect: 'none',
                touchAction: 'none',
              }}
              onTouchStart={handleArtworkTouchStart}
              onTouchMove={handleArtworkTouchMove}
              onTouchEnd={handleArtworkTouchEnd}
              onTouchCancel={handleArtworkTouchEnd}
              onMouseDown={handleArtworkTouchStart}
              onMouseMove={handleArtworkTouchMove}
              onMouseUp={handleArtworkTouchEnd}
              onMouseLeave={handleArtworkTouchEnd}
            >
              <div
                id="now-playing-artwork-card"
                onClick={(e) => {
                  if (artworkMovedRef.current) {
                    e.stopPropagation();
                    return;
                  }
                  togglePlay();
                }}
                style={{
                  position: 'relative',
                  width: 'min(280px, calc(100vw - 80px))',
                  height: 'min(280px, calc(100vw - 80px))',
                  borderRadius: isPlaying ? 'var(--radius-xl, 20px)' : '50%',
                  overflow: 'hidden',
                  boxShadow: isPlaying
                    ? '0 20px 60px rgba(0,0,0,0.6), var(--shadow-accent)'
                    : '0 16px 44px rgba(0,0,0,0.5), 0 0 0 2px var(--color-border)',
                  transform: `translate3d(${artworkOffsetX}px, 0, 0) rotate(${artworkOffsetX * 0.04}deg) scale(${isPlaying ? 1 : 0.92})`,
                  transition: isDraggingArtwork
                    ? 'none'
                    : 'border-radius 420ms cubic-bezier(0.2, 0.8, 0.2, 1), transform 420ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 420ms cubic-bezier(0.2, 0.8, 0.2, 1)',
                  cursor: isDraggingArtwork ? 'grabbing' : 'pointer',
                  userSelect: 'none',
                }}
              >
                <img
                  key={currentSong.id}
                  src={currentSong.artworkLg || currentSong.artwork}
                  alt={`${currentSong.album} artwork`}
                  loading="eager"
                  onError={(e) => { (e.target as HTMLImageElement).src = CONFIG.ARTWORK_PLACEHOLDER; }}
                  style={{
                    display: 'block',
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    pointerEvents: 'none',
                    animation: 'scaleIn 300ms var(--ease-spring)',
                  }}
                />

                {/* Paused State: Subtle Pause SVG Icon Overlay centered on top of circular artwork */}
                <div
                  id="now-playing-pause-overlay"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(0, 0, 0, 0.32)',
                    backdropFilter: 'blur(2px)',
                    WebkitBackdropFilter: 'blur(2px)',
                    opacity: !isPlaying && !isLoading ? 1 : 0,
                    pointerEvents: 'none',
                    transition: 'opacity 320ms cubic-bezier(0.2, 0.8, 0.2, 1), transform 320ms cubic-bezier(0.2, 0.8, 0.2, 1)',
                    transform: !isPlaying && !isLoading ? 'scale(1)' : 'scale(0.8)',
                  }}
                >
                  <div
                    style={{
                      width: 54,
                      height: 54,
                      borderRadius: '50%',
                      background: 'rgba(0, 0, 0, 0.65)',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                      border: '1px solid rgba(255, 255, 255, 0.25)',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#FFFFFF',
                    }}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <rect x="6" y="5" width="4" height="14" rx="1.5"/>
                      <rect x="14" y="5" width="4" height="14" rx="1.5"/>
                    </svg>
                  </div>
                </div>

                {/* Swipe Action Overlay Indicator */}
                {Math.abs(artworkOffsetX) > 20 && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'rgba(0, 0, 0, 0.45)',
                      backdropFilter: 'blur(6px)',
                      WebkitBackdropFilter: 'blur(6px)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      color: '#FFFFFF',
                      opacity: Math.min(1, Math.abs(artworkOffsetX) / 70),
                      transition: 'opacity 120ms ease',
                      pointerEvents: 'none',
                    }}
                  >
                    <div
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: '50%',
                        background: Math.abs(artworkOffsetX) >= 50 ? 'var(--color-accent)' : 'rgba(255,255,255,0.22)',
                        color: Math.abs(artworkOffsetX) >= 50 ? 'var(--color-accent-on)' : '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transform: `scale(${Math.min(1.2, 0.85 + (Math.abs(artworkOffsetX) / 50) * 0.35)})`,
                        transition: 'transform 120ms ease, background 120ms ease',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                      }}
                    >
                      {artworkOffsetX < 0 ? icons.next : icons.prev}
                    </div>
                    <span style={{
                      fontSize: 'var(--text-xs)',
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      textShadow: '0 2px 8px rgba(0,0,0,0.6)',
                    }}>
                      {artworkOffsetX < 0 ? 'Next' : 'Previous'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Real-time Synced Lyrics panel */
            <div
              ref={lyricsContainerRef}
              onScroll={handleLyricsUserScroll}
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '140px 0 180px',
                scrollbarWidth: 'none',
                WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)',
                maskImage: 'linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)',
              }}
            >
              {lyricsLoading && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, gap: 12, color: 'var(--color-text-muted)' }}>
                  {icons.loading}
                  <span style={{ fontSize: 'var(--text-sm)' }}>Synchronizing lyrics...</span>
                </div>
              )}
              {lyricsError && !lyricsLoading && (
                <div style={{ textAlign: 'center', padding: '48px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    background: 'var(--color-surface-2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--color-text-muted)',
                    marginBottom: 16,
                  }}>
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                      <path d="M9 18V5l12-2v13" />
                      <circle cx="6" cy="18" r="3" />
                      <circle cx="18" cy="16" r="3" />
                    </svg>
                  </div>
                  <p style={{ color: 'var(--color-text-primary)', fontSize: 'var(--text-base)', fontWeight: 600, margin: 0 }}>
                    Lyrics Not Available
                  </p>
                  <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)', marginTop: 6, maxWidth: 240, lineHeight: 1.5 }}>
                    Lyrics for this track haven't been synchronized yet. Enjoy the music!
                  </p>
                  <button
                    onClick={() => {
                      if (!currentSong) return;
                      setLyricsError(false);
                      setLyricsLoading(true);
                      getLyrics(currentSong.artist, currentSong.title, currentSong.duration)
                        .then((l) => {
                          setLyrics(l);
                          setLyricsError(!l || l.lines.length === 0);
                        })
                        .catch(() => setLyricsError(true))
                        .finally(() => setLyricsLoading(false));
                    }}
                    className="btn-ghost"
                    style={{
                      marginTop: 14,
                      fontSize: 'var(--text-xs)',
                      padding: '8px 16px',
                      color: 'var(--color-accent)',
                      background: 'var(--color-accent-dim)',
                      borderRadius: 'var(--radius-full)',
                    }}
                  >
                    Retry Loading
                  </button>
                </div>
              )}
              {lyrics && lyrics.lines.map((line, i) => {
                const isActive = lyrics.synced ? i === activeLineIndex : false;
                const isPast = lyrics.synced && activeLineIndex >= 0 && i < activeLineIndex;

                return (
                  <p
                    key={i}
                    ref={(el) => { lineRefs.current[i] = el; }}
                    onClick={() => {
                      if (line.time !== undefined) {
                        seekToTime(line.time);
                      }
                    }}
                    style={{
                      margin: 0,
                      padding: lyrics.synced ? (isActive ? '14px 0' : '8px 0') : '8px 0',
                      fontFamily: 'var(--font-lyrics)',
                      fontSize: lyrics.synced
                        ? isActive
                          ? 'clamp(2rem, 5.8vw, 2.75rem)'
                          : 'clamp(1.2rem, 3.8vw, 1.55rem)'
                        : 'clamp(1.3rem, 4.2vw, 1.65rem)',
                      fontWeight: lyrics.synced ? (isActive ? 800 : 700) : 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.025em',
                      lineHeight: lyrics.synced ? (isActive ? 1.14 : 1.22) : 1.35,
                      color: !lyrics.synced
                        ? 'var(--color-text-primary)'
                        : isActive
                        ? 'var(--color-text-primary)'
                        : isPast
                        ? 'var(--color-text-secondary)'
                        : 'var(--color-text-muted)',
                      opacity: !lyrics.synced ? 0.95 : isActive ? 1 : isPast ? 0.22 : 0.28,
                      transform: lyrics.synced
                        ? isActive
                          ? 'translate3d(0, 0, 0) scale(1)'
                          : isPast
                          ? 'translate3d(0, -6px, 0) scale(0.96)'
                          : 'translate3d(0, 6px, 0) scale(0.96)'
                        : 'none',
                      transformOrigin: 'left center',
                      cursor: line.time !== undefined ? 'pointer' : 'default',
                      transition: 'transform 380ms cubic-bezier(0.25, 1, 0.5, 1), opacity 380ms ease, color 380ms ease, text-shadow 380ms ease',
                      willChange: 'transform, opacity, color',
                      textShadow: lyrics.synced && isActive
                        ? '0 4px 28px rgba(245, 158, 11, 0.4), 0 0 16px rgba(255, 255, 255, 0.15)'
                        : 'none',
                      userSelect: 'none',
                    }}
                  >
                    {line.text}
                  </p>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Song Meta ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
            <h2 style={{
              margin: 0,
              fontSize: 'var(--text-xl)',
              fontWeight: 700,
              color: 'var(--color-text-primary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              fontFamily: 'var(--font-body)',
            }}>
              {currentSong.title}
            </h2>
            <p style={{
              margin: '2px 0 0',
              fontSize: 'var(--text-base)',
              color: 'var(--color-text-secondary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {currentSong.artist}
            </p>
          </div>
          <button
            id="full-player-heart-btn"
            aria-label={liked ? 'Remove from favorites' : 'Add to favorites'}
            aria-pressed={liked}
            onClick={() => toggleFavorite(currentSong)}
            className="btn-icon"
            style={{ minWidth: 48, minHeight: 48, color: liked ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}
          >
            {icons.heart(liked)}
          </button>
        </div>

        {/* ── Error message with retry action ── */}
        {error && !isPlaying && !isLoading && (
          <div
            id="player-error-banner"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 'var(--radius-md, 10px)',
              padding: '6px 12px',
              marginBottom: 10,
            }}
          >
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-error)', fontWeight: 500 }}>
              {error}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (currentSong) playSong(currentSong, queue, queueIndex);
              }}
              style={{
                background: 'var(--color-error)',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: 'var(--radius-sm, 6px)',
                padding: '2px 8px',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* ── Progress Bar ── */}
        <div style={{ marginBottom: 16 }}>
          <div
            ref={progressRef}
            id="player-progress-bar"
            role="slider"
            aria-label="Playback position"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(displayProgress * 100)}
            style={{
              height: 4, background: 'var(--color-surface-2)', borderRadius: 2,
              cursor: 'pointer', position: 'relative',
              touchAction: 'none',
            }}
            onMouseDown={(e) => { setIsDragging(true); handleProgressInteraction(e); }}
            onMouseMove={(e) => { if (isDragging) handleProgressInteraction(e); }}
            onMouseUp={() => setIsDragging(false)}
            onTouchStart={(e) => { setIsDragging(true); handleProgressInteraction(e); }}
            onTouchMove={(e) => { if (isDragging) handleProgressInteraction(e); }}
            onTouchEnd={() => setIsDragging(false)}
          >
            <div style={{
              height: '100%',
              width: `${displayProgress * 100}%`,
              background: 'var(--color-accent)',
              borderRadius: 2,
              transition: isDragging ? 'none' : 'width 1s linear',
            }} />
            {/* Scrubber thumb */}
            <div style={{
              position: 'absolute',
              top: '50%',
              left: `${displayProgress * 100}%`,
              transform: 'translate(-50%, -50%)',
              width: isDragging ? 16 : 12,
              height: isDragging ? 16 : 12,
              borderRadius: '50%',
              background: 'var(--color-accent)',
              transition: isDragging ? 'none' : 'width 200ms var(--ease-standard), height 200ms var(--ease-standard)',
              boxShadow: 'var(--shadow-sm)',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              {formatDuration(displayTime)}
            </span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              {duration > 0 ? `-${formatDuration(duration - displayTime)}` : '0:00'}
            </span>
          </div>
        </div>

        {/* ── Main Controls ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          {/* Shuffle */}
          <button
            id="player-shuffle-btn"
            aria-label={shuffle ? 'Disable shuffle' : 'Enable shuffle'}
            aria-pressed={shuffle}
            onClick={toggleShuffle}
            className="btn-icon"
            style={{ minWidth: 48, minHeight: 48, color: shuffle ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}
          >
            {icons.shuffle(shuffle)}
          </button>

          {/* Previous */}
          <button
            id="player-prev-btn"
            aria-label="Previous track"
            onClick={() => previous()}
            className="btn-icon"
            style={{ minWidth: 52, minHeight: 52, color: 'var(--color-text-primary)' }}
          >
            {icons.prev}
          </button>

          {/* Play/Pause */}
          <button
            id="player-play-btn"
            aria-label={isPlaying ? 'Pause' : 'Play'}
            onClick={togglePlay}
            style={{
              width: 68, height: 68, borderRadius: '50%',
              background: 'var(--color-accent)',
              border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--color-accent-on)',
              boxShadow: 'var(--shadow-accent)',
              transition: 'transform 150ms var(--ease-spring)',
              flexShrink: 0,
            }}
            onMouseDown={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.93)'; }}
            onMouseUp={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
          >
            {isLoading ? icons.loading : isPlaying ? icons.pause : icons.play}
          </button>

          {/* Next */}
          <button
            id="player-next-btn"
            aria-label="Next track"
            onClick={next}
            className="btn-icon"
            style={{ minWidth: 52, minHeight: 52, color: 'var(--color-text-primary)' }}
          >
            {icons.next}
          </button>

          {/* Repeat */}
          <button
            id="player-repeat-btn"
            aria-label={`Repeat mode: ${repeat}`}
            onClick={toggleRepeat}
            className="btn-icon"
            style={{ minWidth: 48, minHeight: 48, color: repeat !== 'off' ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}
          >
            {icons.repeat(repeat)}
          </button>
        </div>

        {/* ── Secondary controls ── */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, paddingBottom: 16 }}>
          <button
            id="player-lyrics-btn"
            aria-label={showLyrics ? 'Hide lyrics' : 'Show lyrics'}
            aria-pressed={showLyrics}
            onClick={() => setShowLyrics(!showLyrics)}
            className="btn-ghost"
            style={{
              fontSize: 'var(--text-xs)', gap: 6, fontWeight: 500,
              color: showLyrics ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              background: showLyrics ? 'var(--color-accent-dim)' : 'transparent',
              padding: '8px 16px',
            }}
          >
            {icons.lyrics}
            Lyrics
          </button>
          <button
            id="player-queue-sec-btn"
            aria-label="View queue"
            onClick={openQueue}
            className="btn-ghost"
            style={{ fontSize: 'var(--text-xs)', gap: 6, fontWeight: 500, color: 'var(--color-text-secondary)', padding: '8px 16px' }}
          >
            {icons.queue}
            Queue
          </button>
        </div>

        {/* Provider note */}
        {currentSong.provider === 'youtube' && (
          <p style={{ textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--color-accent)', paddingBottom: 8, opacity: 0.9 }}>
            YouTube Music HD Stream
          </p>
        )}

        {currentSong.provider === 'itunes' && (
          <p style={{ textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', paddingBottom: 8 }}>
            30s preview via iTunes
          </p>
        )}
        {currentSong.provider === 'jamendo' && (
          <p style={{ textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', paddingBottom: 8 }}>
            Full track — Creative Commons via Jamendo
          </p>
        )}
      </div>

      {/* ── Half-Screen Track Options & Sleep Timer Bottom Sheet ── */}
      {showMenuSheet && (
        <NowPlayingMenuSheet onClose={() => setShowMenuSheet(false)} />
      )}
    </div>
  );
}
