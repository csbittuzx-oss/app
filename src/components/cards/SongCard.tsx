import React, { useState, useRef, useCallback } from 'react';
import type { Song } from '../../data/models';
import { usePlayer } from '../../state/PlayerContext';
import { useApp } from '../../state/AppContext';
import { formatDuration } from '../../core/utils';
import { CONFIG } from '../../config';
import { showToast } from '../../core/utils/toast';
import { SongOptionsBottomSheet } from '../shared/SongOptionsBottomSheet';
import { resizeImageUrl } from '../../core/utils/imageUtils';

interface SongCardProps {
  song: Song;
  queue?: Song[];
  index?: number;
  showIndex?: boolean;
  compact?: boolean;
  playlistId?: string;
  onPlay?: () => void;
  onRemove?: () => void;
  disableSwipe?: boolean;
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? 'var(--color-accent)' : 'none'} aria-hidden="true">
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"
        stroke={filled ? 'var(--color-accent)' : 'var(--color-text-muted)'} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="5" r="1.5" fill="currentColor"/>
      <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
      <circle cx="12" cy="19" r="1.5" fill="currentColor"/>
    </svg>
  );
}

// Playback EQ animation (shown when this song is playing)
function EqBars() {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 16, width: 14 }} aria-hidden="true">
      {[0, 150, 80].map((delay, i) => (
        <div key={i} style={{
          width: 3, background: 'var(--color-accent)', borderRadius: 2,
          height: '100%',
          animation: `playEq 0.8s ease-in-out ${delay}ms infinite alternate`,
          transformOrigin: 'bottom',
        }} />
      ))}
    </div>
  );
}

export function SongCard({
  song,
  queue,
  index = 0,
  showIndex = false,
  compact = false,
  playlistId,
  onPlay,
  onRemove,
  disableSwipe = false,
}: SongCardProps) {
  const { playSong, addToQueue, state: playerState } = usePlayer();
  const { isFavorite, toggleFavorite, addRecentlyPlayed, removeFromPlaylist } = useApp();
  const isCurrentSong = playerState.currentSong?.id === song.id;
  const isPlaying = isCurrentSong && playerState.isPlaying;
  const liked = isFavorite(song.id);

  // Swipe Gesture State
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isRemoved, setIsRemoved] = useState(false);
  const [showOptionsSheet, setShowOptionsSheet] = useState(false);

  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);
  const isHorizontalSwipeRef = useRef<boolean | null>(null);
  const hasTriggeredHapticRef = useRef(false);

  const handlePlay = () => {
    if (Math.abs(dragX) > 10) return; // ignore click if drag gesture
    playSong(song, queue, index);
    addRecentlyPlayed(song);
    if (onPlay) onPlay();
  };

  // ─── Touch Gesture Handlers ───────────────────────────────────────────────

  const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    if (disableSwipe) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    touchStartXRef.current = clientX;
    touchStartYRef.current = clientY;
    isHorizontalSwipeRef.current = null;
    hasTriggeredHapticRef.current = false;
    setIsDragging(true);
  };

  const handleTouchMove = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (disableSwipe || !isDragging) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const dx = clientX - touchStartXRef.current;
    const dy = clientY - touchStartYRef.current;

    // Detect direction on first significant movement
    if (isHorizontalSwipeRef.current === null) {
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
        isHorizontalSwipeRef.current = Math.abs(dx) > Math.abs(dy);
      }
    }

    if (!isHorizontalSwipeRef.current) return;

    // Apply friction to swipe drag
    const friction = 0.65;
    const clampedX = dx * friction;
    setDragX(clampedX);

    // Haptic feedback when crossing action threshold (+70px or -70px)
    const threshold = 70;
    if (Math.abs(clampedX) >= threshold && !hasTriggeredHapticRef.current) {
      hasTriggeredHapticRef.current = true;
      try {
        if ('vibrate' in navigator) navigator.vibrate(25);
      } catch {
        // ignore
      }
    } else if (Math.abs(clampedX) < threshold && hasTriggeredHapticRef.current) {
      hasTriggeredHapticRef.current = false;
    }
  }, [disableSwipe, isDragging]);

  const handleTouchEnd = useCallback(() => {
    if (disableSwipe || !isDragging) return;
    setIsDragging(false);

    const threshold = 65;

    // 1. SWIPE RIGHT -> Add to Next Queue
    if (dragX >= threshold) {
      addToQueue(song);
      showToast(`Added "${song.title}" to Play Next`, 'success');
      try {
        if ('vibrate' in navigator) navigator.vibrate([30]);
      } catch {
        // ignore
      }
    }
    // 2. SWIPE LEFT -> Remove from Playlist or Liked Songs
    else if (dragX <= -threshold) {
      if (onRemove) {
        setIsRemoved(true);
        setTimeout(() => onRemove(), 220);
        showToast(`Removed "${song.title}"`, 'danger');
      } else if (playlistId) {
        setIsRemoved(true);
        setTimeout(() => removeFromPlaylist(playlistId, song.id), 220);
        showToast(`Removed from playlist`, 'danger');
      } else if (liked) {
        toggleFavorite(song);
        showToast(`Removed "${song.title}" from Liked Songs`, 'danger');
      } else {
        showToast(`Song unliked`, 'info');
      }
      try {
        if ('vibrate' in navigator) navigator.vibrate([30]);
      } catch {
        // ignore
      }
    }

    // Reset position smoothly
    setDragX(0);
    isHorizontalSwipeRef.current = null;
  }, [disableSwipe, isDragging, dragX, song, addToQueue, onRemove, playlistId, liked, removeFromPlaylist, toggleFavorite]);

  if (isRemoved) {
    return (
      <div style={{
        height: 0,
        opacity: 0,
        overflow: 'hidden',
        transition: 'all 220ms ease-out',
        margin: 0,
        padding: 0,
      }} />
    );
  }

  const isSwipingRight = dragX > 0;
  const isSwipingLeft = dragX < 0;
  const isThresholdMet = Math.abs(dragX) >= 65;

  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: isCurrentSong ? 'var(--radius-md)' : 'var(--radius-sm)',
        marginBottom: 2,
        touchAction: 'pan-y',
        background: 'transparent',
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {/* ─── Swipe Right Reveal (Green: Add to Next in Queue) ─── */}
      {isSwipingRight && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(90deg, #10B981 0%, #059669 100%)',
            display: 'flex',
            alignItems: 'center',
            paddingLeft: Math.min(24, Math.max(12, dragX * 0.25)),
            gap: 8,
            color: '#FFFFFF',
            zIndex: 1,
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            transform: `scale(${isThresholdMet ? 1.12 : 0.95})`,
            transition: 'transform 120ms ease-out',
            fontWeight: 700,
            fontSize: 'var(--text-xs)',
            letterSpacing: '0.02em',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="16" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <polyline points="18 15 21 18 18 21" />
            </svg>
            <span>PLAY NEXT</span>
          </div>
        </div>
      )}

      {/* ─── Swipe Left Reveal (Red: Remove / Unlike) ─── */}
      {isSwipingLeft && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(90deg, #DC2626 0%, #EF4444 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingRight: Math.min(24, Math.max(12, -dragX * 0.25)),
            gap: 8,
            color: '#FFFFFF',
            zIndex: 1,
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            transform: `scale(${isThresholdMet ? 1.12 : 0.95})`,
            transition: 'transform 120ms ease-out',
            fontWeight: 700,
            fontSize: 'var(--text-xs)',
            letterSpacing: '0.02em',
          }}>
            <span>{playlistId || onRemove ? 'REMOVE' : 'UNLIKE'}</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
          </div>
        </div>
      )}

      {/* ─── Foreground Song Row ─── */}
      <div
        id={`song-card-${song.id}`}
        style={{
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: compact ? '8px 0' : '10px 0',
          cursor: 'pointer',
          transform: `translate3d(${dragX}px, 0, 0)`,
          transition: isDragging ? 'none' : 'transform 260ms cubic-bezier(0.2, 0.9, 0.3, 1.2), background 150ms ease',
          background: isCurrentSong
            ? 'var(--color-accent-dim)'
            : Math.abs(dragX) > 0
            ? 'var(--color-surface)'
            : 'transparent',
          paddingLeft: isCurrentSong ? 8 : (Math.abs(dragX) > 0 ? 8 : 0),
          paddingRight: isCurrentSong ? 8 : (Math.abs(dragX) > 0 ? 8 : 0),
          borderRadius: isCurrentSong ? 'var(--radius-md)' : 'var(--radius-sm)',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
        onClick={handlePlay}
        role="button"
        tabIndex={0}
        aria-label={`Play ${song.title} by ${song.artist}. Swipe right to play next, swipe left to remove.`}
        onKeyDown={(e) => e.key === 'Enter' && handlePlay()}
      >
        {/* Index or EQ bars */}
        {showIndex && (
          <div style={{ width: 20, textAlign: 'center', flexShrink: 0 }}>
            {isPlaying
              ? <EqBars />
              : <span style={{ fontSize: 'var(--text-sm)', color: isCurrentSong ? 'var(--color-accent)' : 'var(--color-text-muted)', fontWeight: 500 }}>
                  {index + 1}
                </span>
            }
          </div>
        )}

        {/* Artwork */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <img
            src={resizeImageUrl(song.artworkLg || song.artwork, 544, 544)}
            alt={`${song.album} artwork`}
            width={compact ? 44 : 52}
            height={compact ? 44 : 52}
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).src = CONFIG.ARTWORK_PLACEHOLDER; }}
            style={{
              borderRadius: 'var(--radius-md)',
              objectFit: 'cover',
              display: 'block',
              filter: isCurrentSong ? 'brightness(0.85)' : 'none',
              pointerEvents: 'none',
            }}
          />
          {isPlaying && !showIndex && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 'var(--radius-md)', background: 'rgba(0,0,0,0.4)',
            }}>
              <EqBars />
            </div>
          )}
        </div>

        {/* Title & Artist */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            margin: 0,
            fontSize: 'var(--text-md)',
            fontWeight: isCurrentSong ? 600 : 500,
            color: isCurrentSong ? 'var(--color-accent)' : 'var(--color-text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {song.title}
          </p>
          <p style={{
            margin: 0,
            fontSize: 'var(--text-sm)',
            color: 'var(--color-text-secondary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {song.artist}
          </p>
        </div>

        {/* Duration */}
        {!compact && (
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', flexShrink: 0 }}>
            {formatDuration(song.duration)}
          </span>
        )}

        {/* Favorite */}
        <button
          id={`like-${song.id}`}
          aria-label={liked ? 'Remove from favorites' : 'Add to favorites'}
          aria-pressed={liked}
          className="btn-icon"
          style={{ minWidth: 'auto', padding: 6, opacity: liked ? 1 : 0.5 }}
          onClick={(e) => { e.stopPropagation(); toggleFavorite(song); }}
        >
          <HeartIcon filled={liked} />
        </button>

        {/* More options */}
        <button
          id={`more-${song.id}`}
          aria-label="More options"
          className="btn-icon"
          style={{ minWidth: 'auto', padding: 6 }}
          onClick={(e) => {
            e.stopPropagation();
            setShowOptionsSheet(true);
          }}
        >
          <MoreIcon />
        </button>
      </div>

      {/* ── Song Options Bottom Sheet Modal ── */}
      {showOptionsSheet && (
        <SongOptionsBottomSheet
          song={song}
          playlistId={playlistId}
          onRemoveFromCurrentList={onRemove}
          onClose={() => setShowOptionsSheet(false)}
        />
      )}
    </div>
  );
}

// ─── Horizontal Album-style card (square, used in scrollable rows) ───

interface AlbumStyleCardProps {
  song: Song;
  queue?: Song[];
  index?: number;
  size?: number;
}

export function SongSquareCard({ song, queue, index = 0, size = 144 }: AlbumStyleCardProps) {
  const { playSong, state: playerState } = usePlayer();
  const { addRecentlyPlayed } = useApp();
  const isCurrentSong = playerState.currentSong?.id === song.id;
  const isPlaying = isCurrentSong && playerState.isPlaying;

  const handlePlay = () => {
    playSong(song, queue, index);
    addRecentlyPlayed(song);
  };

  return (
    <div
      id={`song-sq-${song.id}`}
      style={{ display: 'flex', flexDirection: 'column', gap: 8, width: size, flexShrink: 0, cursor: 'pointer' }}
      onClick={handlePlay}
      role="button"
      tabIndex={0}
      aria-label={`Play ${song.title}`}
      onKeyDown={(e) => e.key === 'Enter' && handlePlay()}
    >
      <div style={{ position: 'relative' }}>
        <img
          src={resizeImageUrl(song.artworkLg || song.artwork, 544, 544)}
          alt={`${song.album} artwork`}
          width={size}
          height={size}
          loading="lazy"
          onError={(e) => { (e.target as HTMLImageElement).src = CONFIG.ARTWORK_PLACEHOLDER; }}
          style={{
            borderRadius: 'var(--radius-lg)',
            objectFit: 'cover',
            display: 'block',
            width: size,
            height: size,
            filter: isCurrentSong ? 'brightness(0.75)' : 'none',
            transition: 'filter 200ms var(--ease-standard)',
          }}
        />
        {isPlaying && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 'var(--radius-lg)',
          }}>
            <div style={{ background: 'rgba(0,0,0,0.5)', borderRadius: '50%', padding: 12 }}>
              <EqBars />
            </div>
          </div>
        )}
      </div>
      <div>
        <p style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 600, color: isCurrentSong ? 'var(--color-accent)' : 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {song.title}
        </p>
        <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {song.artist}
        </p>
      </div>
    </div>
  );
}
