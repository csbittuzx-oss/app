import { usePlayer } from '../../state/PlayerContext';
import { CONFIG } from '../../config';
import { resizeImageUrl } from '../../core/utils/imageUtils';

export function MiniPlayer() {
  const { state, togglePlay, next, openFullPlayer } = usePlayer();
  const { currentSong, isPlaying, progress, isLoading } = state;

  if (!currentSong) return null;

  return (
    <div
      id="mini-player"
      style={{
        background: 'var(--color-surface)',
        borderTop: '1px solid var(--color-border)',
        padding: '0 16px',
        height: 64,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexShrink: 0,
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
      }}
      onClick={openFullPlayer}
      role="button"
      aria-label={`Now playing: ${currentSong.title} by ${currentSong.artist}. Tap to expand player.`}
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && openFullPlayer()}
    >
      {/* Progress bar at top */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: 'var(--color-border)',
      }}>
        <div style={{
          height: '100%',
          width: `${progress * 100}%`,
          background: 'var(--color-accent)',
          transition: 'width 1s linear',
          borderRadius: 1,
        }} aria-hidden="true" />
      </div>

      {/* Artwork */}
      <img
        key={currentSong.id}
        src={resizeImageUrl(currentSong.artworkLg || currentSong.artwork, 544, 544)}
        alt={`${currentSong.album} artwork`}
        width={44}
        height={44}
        loading="eager"
        onError={(e) => { (e.target as HTMLImageElement).src = CONFIG.ARTWORK_PLACEHOLDER; }}
        style={{
          borderRadius: 'var(--radius-md)',
          objectFit: 'cover',
          flexShrink: 0,
          animation: isPlaying ? 'none' : 'none',
          boxShadow: 'var(--shadow-sm)',
        }}
      />

      {/* Song info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          margin: 0, fontSize: 'var(--text-base)', fontWeight: 600,
          color: 'var(--color-text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {currentSong.title}
        </p>
        <p style={{
          margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {currentSong.artist}
        </p>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Play/Pause */}
        <button
          id="mini-player-play-btn"
          aria-label={isPlaying ? 'Pause' : 'Play'}
          onClick={(e) => { e.stopPropagation(); togglePlay(); }}
          style={{
            background: 'var(--color-accent)',
            border: 'none',
            borderRadius: '50%',
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--color-accent-on)',
            flexShrink: 0,
            transition: 'transform 150ms var(--ease-spring)',
          }}
          onMouseDown={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.9)'; }}
          onMouseUp={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
        >
          {isLoading
            ? <LoadingSpinner size={16} />
            : isPlaying
              ? <PauseIcon />
              : <PlayIcon />
          }
        </button>

        {/* Next */}
        <button
          id="mini-player-next-btn"
          aria-label="Next track"
          onClick={(e) => { e.stopPropagation(); next(); }}
          className="btn-icon"
          style={{ minWidth: 40, minHeight: 40, padding: 8 }}
        >
          <NextIcon />
        </button>
      </div>
    </div>
  );
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────

function PlayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <polygon points="5 3 19 12 5 21 5 3"/>
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="4" width="4" height="16" rx="1"/>
      <rect x="14" y="4" width="4" height="16" rx="1"/>
    </svg>
  );
}

function NextIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <polygon points="5 4 15 12 5 20 5 4" fill="currentColor"/>
      <line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

function LoadingSpinner({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"
      style={{ animation: 'spin 0.8s linear infinite' }}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.25"/>
      <path d="M12 2a10 10 0 0110 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  );
}
