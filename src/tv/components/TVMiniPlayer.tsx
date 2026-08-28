import { usePlayer } from '../../state/PlayerContext';

interface TVMiniPlayerProps {
  onOpenFullPlayer: () => void;
}

export function TVMiniPlayer({ onOpenFullPlayer }: TVMiniPlayerProps) {
  const { state, togglePlay } = usePlayer();
  const song = state.currentSong;

  if (!song) return null;

  return (
    <aside
      aria-label="Media Player"
      style={{
        position: 'fixed',
        bottom: 'var(--tv-safe-bottom, 16px)',
        right: 'var(--tv-safe-right, 24px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        background: 'rgba(18, 19, 26, 0.95)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '12px',
        padding: '5px 12px 5px 6px',
        gap: '10px',
        boxShadow: '0 6px 20px rgba(0, 0, 0, 0.6), 0 0 16px rgba(99, 102, 241, 0.2)',
        maxWidth: '300px',
        boxSizing: 'border-box',
      }}
    >
      {/* Clickable Area to open Full Player */}
      <button
        id="tv-mini-player-open"
        data-tv-focus="true"
        data-tv-section="mini-player"
        tabIndex={0}
        onClick={onOpenFullPlayer}
        className="tv-focusable"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '9px',
          background: 'transparent',
          border: 'none',
          padding: '2px',
          color: '#FFFFFF',
          textAlign: 'left',
          flex: 1,
          minWidth: 0,
        }}
      >
        <img
          src={song.artwork || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100'}
          alt={song.title}
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '6px',
            objectFit: 'cover',
            flexShrink: 0,
          }}
        />

        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1, overflow: 'hidden' }}>
          <span
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: '#FFFFFF',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {song.title}
          </span>
          <span
            style={{
              fontSize: '10px',
              color: '#A1A1AA',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {song.artist}
          </span>
        </div>
      </button>

      {/* Mini Play / Pause Button */}
      <button
        id="tv-mini-player-toggle"
        data-tv-focus="true"
        data-tv-section="mini-player"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          togglePlay();
        }}
        className="tv-focusable"
        style={{
          width: '30px',
          height: '30px',
          borderRadius: '50%',
          background: 'var(--tv-accent)',
          border: 'none',
          color: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {state.isPlaying ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 1 }}>
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        )}
      </button>
    </aside>
  );
}
