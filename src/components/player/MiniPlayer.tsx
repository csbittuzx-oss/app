import { usePlayer } from '../../state/PlayerContext';
import { CONFIG } from '../../config';
import { resizeImageUrl } from '../../core/utils/imageUtils';
import './MiniPlayer.css';

export function MiniPlayer() {
  const { state, togglePlay, next, openFullPlayer } = usePlayer();
  const { currentSong, isPlaying, progress, isLoading } = state;

  if (!currentSong) return null;

  return (
    <div className="mini-player-root">
      <div
        id="mini-player"
        className="mini-player-island"
        onClick={openFullPlayer}
        role="button"
        aria-label={`Now playing: ${currentSong.title} by ${currentSong.artist}. Tap to expand player.`}
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && openFullPlayer()}
      >
        {/* Inset Progress Bar along bottom */}
        <div className="mini-player-progress-track" aria-hidden="true">
          <div
            className="mini-player-progress-fill"
            style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
          />
        </div>

        {/* Artwork */}
        <img
          key={currentSong.id}
          src={resizeImageUrl(currentSong.artworkLg || currentSong.artwork, 160, 160)}
          alt={`${currentSong.album} artwork`}
          width={42}
          height={42}
          loading="eager"
          decoding="async"
          className="mini-player-art"
          onError={(e) => { (e.target as HTMLImageElement).src = CONFIG.ARTWORK_PLACEHOLDER; }}
        />

        {/* Song info */}
        <div className="mini-player-info">
          <p className="mini-player-title">
            {currentSong.title}
          </p>
          <p className="mini-player-artist">
            {currentSong.artist}
          </p>
        </div>

        {/* Controls */}
        <div
          className="mini-player-actions"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Play/Pause */}
          <button
            id="mini-player-play-btn"
            className="mini-player-btn-play"
            aria-label={isPlaying ? 'Pause' : 'Play'}
            onClick={(e) => { e.stopPropagation(); togglePlay(); }}
            type="button"
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
            className="mini-player-btn-next"
            aria-label="Next track"
            onClick={(e) => { e.stopPropagation(); next(); }}
            type="button"
          >
            <NextIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────

function PlayIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <polygon points="6 3 20 12 6 21 6 3" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="4" width="4" height="16" rx="1.2" />
      <rect x="14" y="4" width="4" height="16" rx="1.2" />
    </svg>
  );
}

function NextIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <polygon points="5 4 15 12 5 20 5 4" fill="currentColor" stroke="none" />
      <line x1="19" y1="5" x2="19" y2="19" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function LoadingSpinner({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      style={{ animation: 'spin 1s linear infinite' }}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  );
}
