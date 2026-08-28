import { usePlayer } from '../../state/PlayerContext';

interface TVMiniPlayerProps {
  onOpenFullPlayer: () => void;
}

export function TVMiniPlayer({ onOpenFullPlayer }: TVMiniPlayerProps) {
  const { state, togglePlay } = usePlayer();
  const song = state.currentSong;

  if (!song || state.showFullPlayer) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '28px',
        right: '48px',
        width: '420px',
        background: 'rgba(24, 24, 28, 0.95)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: '16px',
        boxShadow: '0 16px 40px rgba(0, 0, 0, 0.7)',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        zIndex: 40,
      }}
    >
      {/* Artwork */}
      <img
        src={song.artworkLg || song.artwork || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=200'}
        alt={song.title}
        style={{
          width: 52,
          height: 52,
          borderRadius: 10,
          objectFit: 'cover',
          flexShrink: 0,
        }}
      />

      {/* Info & Click Area */}
      <div
        id="tv-miniplayer-info"
        data-tv-focus="true"
        data-tv-section="miniplayer"
        tabIndex={0}
        onClick={onOpenFullPlayer}
        className="tv-focusable"
        style={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '4px 8px',
          borderRadius: '8px',
        }}
      >
        <span
          style={{
            fontSize: '15px',
            fontWeight: 700,
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
            fontSize: '13px',
            color: '#A1A1AA',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {song.artist}
        </span>
      </div>

      {/* Play/Pause Button */}
      <button
        id="tv-miniplayer-toggle"
        data-tv-focus="true"
        data-tv-section="miniplayer"
        tabIndex={0}
        onClick={togglePlay}
        className="tv-focusable"
        style={{
          width: 44,
          height: 44,
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
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" rx="1.5" />
            <rect x="14" y="4" width="4" height="16" rx="1.5" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 2 }}>
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        )}
      </button>
    </div>
  );
}
