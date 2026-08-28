import { useEffect } from 'react';
import { usePlayer } from '../../state/PlayerContext';
import { formatDuration } from '../../core/utils';
import { tvFocusManager } from '../focus/TVFocusManager';

interface TVPlayerScreenProps {
  onClose: () => void;
}

export function TVPlayerScreen({ onClose }: TVPlayerScreenProps) {
  const {
    state,
    togglePlay,
    next,
    previous,
    seekToTime,
    toggleShuffle,
    toggleRepeat,
  } = usePlayer();

  const song = state.currentSong;

  // Register back button handler to close full player
  useEffect(() => {
    return tvFocusManager.registerBackHandler(() => {
      onClose();
      return true;
    });
  }, [onClose]);

  if (!song) {
    return (
      <div
        style={{
          flex: 1,
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#71717A',
          fontSize: '13px',
          padding: 'var(--tv-safe-top) var(--tv-safe-right) var(--tv-safe-bottom) var(--tv-safe-left)',
          boxSizing: 'border-box',
        }}
      >
        <span>No song currently selected. Select a song from Home or Search.</span>
      </div>
    );
  }

  const duration = state.duration || song.duration || 180;
  const currentTime = state.currentTime || 0;
  const progressRatio = duration > 0 ? currentTime / duration : 0;

  const handleSeekDelta = (deltaSec: number) => {
    const target = Math.max(0, Math.min(duration, currentTime + deltaSec));
    seekToTime(target);
  };

  return (
    <div
      style={{
        flex: 1,
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        padding: 'var(--tv-safe-top) var(--tv-safe-right) var(--tv-safe-bottom) var(--tv-safe-left)',
        gap: 'clamp(20px, 3vw, 36px)',
        background: '#090A0F',
        boxSizing: 'border-box',
      }}
    >
      {/* ── Ambient Background Glow ── */}
      <div
        style={{
          position: 'absolute',
          top: '-15%',
          left: '-10%',
          width: '50vw',
          height: '50vw',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 65%)',
          filter: 'blur(70px)',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />

      {/* ── Left Column: Compact Album Artwork & Metadata ── */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          zIndex: 2,
          gap: '12px',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: 'clamp(140px, 15vw, 190px)',
            height: 'clamp(140px, 15vw, 190px)',
            borderRadius: '12px',
            overflow: 'hidden',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.7), 0 0 16px rgba(99, 102, 241, 0.2)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            flexShrink: 0,
          }}
        >
          <img
            src={song.artworkLg || song.artwork || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500'}
            alt={song.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>

        {/* Title & Artist */}
        <div style={{ textAlign: 'center', width: '100%', minWidth: 0 }}>
          <h1
            style={{
              fontSize: 'clamp(15px, 1.5vw, 18px)',
              fontWeight: 700,
              color: '#FFFFFF',
              margin: '0 0 2px 0',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {song.title}
          </h1>
          <p
            style={{
              fontSize: '12px',
              color: '#A1A1AA',
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {song.artist} {song.album ? `• ${song.album}` : ''}
          </p>
        </div>

        {/* ── Seekable TV Progress Bar ── */}
        <div style={{ width: '100%', maxWidth: '360px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div
            id="tv-player-seekbar"
            data-tv-focus="true"
            data-tv-section="player-controls"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') {
                handleSeekDelta(-5);
                e.preventDefault();
              } else if (e.key === 'ArrowRight') {
                handleSeekDelta(5);
                e.preventDefault();
              }
            }}
            className="tv-focusable"
            style={{
              width: '100%',
              height: '6px',
              borderRadius: '3px',
              background: 'rgba(255, 255, 255, 0.12)',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <div
              style={{
                width: `${Math.min(100, Math.max(0, progressRatio * 100))}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #6366F1, #A855F7)',
                borderRadius: '3px',
                transition: 'width 0.2s linear',
              }}
            />
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '10px',
              color: '#71717A',
              fontWeight: 500,
            }}
          >
            <span>{formatDuration(currentTime)}</span>
            <span>{formatDuration(duration)}</span>
          </div>
        </div>

        {/* ── Compact Transport Controls ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
          data-tv-section="player-controls"
        >
          {/* Shuffle */}
          <button
            id="tv-btn-shuffle"
            data-tv-focus="true"
            data-tv-section="player-controls"
            tabIndex={0}
            onClick={toggleShuffle}
            className={`tv-focusable ${state.shuffle ? 'active' : ''}`}
            style={{
              background: state.shuffle ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255, 255, 255, 0.05)',
              border: 'none',
              borderRadius: '50%',
              width: 32,
              height: 32,
              color: state.shuffle ? '#818CF8' : '#71717A',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M16 3h5v5" />
              <path d="M4 20L21 3" />
              <path d="M21 16v5h-5" />
              <path d="M15 15l6 6" />
              <path d="M4 4l5 5" />
            </svg>
          </button>

          {/* Previous */}
          <button
            id="tv-btn-prev"
            data-tv-focus="true"
            data-tv-section="player-controls"
            tabIndex={0}
            onClick={() => previous(true)}
            className="tv-focusable"
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: 'none',
              borderRadius: '50%',
              width: 36,
              height: 36,
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="19 20 9 12 19 4 19 20" />
              <line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" strokeWidth="3" />
            </svg>
          </button>

          {/* Play/Pause */}
          <button
            id="tv-btn-play-pause"
            data-tv-focus="true"
            data-tv-section="player-controls"
            tabIndex={0}
            onClick={togglePlay}
            className="tv-focusable"
            style={{
              background: 'var(--tv-accent)',
              border: 'none',
              borderRadius: '50%',
              width: 44,
              height: 44,
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(99, 102, 241, 0.4)',
              flexShrink: 0,
            }}
          >
            {state.isPlaying ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 2 }}>
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            )}
          </button>

          {/* Next */}
          <button
            id="tv-btn-next"
            data-tv-focus="true"
            data-tv-section="player-controls"
            tabIndex={0}
            onClick={next}
            className="tv-focusable"
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: 'none',
              borderRadius: '50%',
              width: 36,
              height: 36,
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 4 15 12 5 20 5 4" />
              <line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" strokeWidth="3" />
            </svg>
          </button>

          {/* Repeat */}
          <button
            id="tv-btn-repeat"
            data-tv-focus="true"
            data-tv-section="player-controls"
            tabIndex={0}
            onClick={toggleRepeat}
            className={`tv-focusable ${state.repeat !== 'off' ? 'active' : ''}`}
            style={{
              background: state.repeat !== 'off' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255, 255, 255, 0.05)',
              border: 'none',
              borderRadius: '50%',
              width: 32,
              height: 32,
              color: state.repeat !== 'off' ? '#818CF8' : '#71717A',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="m17 2 4 4-4 4" />
              <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
              <path d="m7 22-4-4 4-4" />
              <path d="M21 13v1a4 4 0 0 1-4 4H3" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Right Column: Compact Up Next Queue ── */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          borderRadius: '14px',
          padding: '12px 14px',
          overflow: 'hidden',
          zIndex: 2,
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <h2 style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF', margin: 0 }}>
            Up Next in Queue
          </h2>
          <span style={{ fontSize: '11px', color: '#71717A' }}>
            {state.queue.length} Tracks
          </span>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
          data-tv-section="queue-list"
        >
          {state.queue.slice(state.queueIndex + 1, state.queueIndex + 20).map((qSong, idx) => (
            <div
              key={`q-${qSong.id}-${idx}`}
              id={`tv-queue-${idx}`}
              data-tv-focus="true"
              data-tv-section="queue-list"
              tabIndex={0}
              onClick={() => usePlayer().playSong(qSong, state.queue, state.queueIndex + 1 + idx)}
              className="tv-focusable"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '6px 10px',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.03)',
                boxSizing: 'border-box',
              }}
            >
              <img
                src={qSong.artwork || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100'}
                alt={qSong.title}
                style={{ width: 30, height: 30, borderRadius: 5, objectFit: 'cover', flexShrink: 0 }}
              />
              <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#F4F4F5',
                    display: 'block',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {qSong.title}
                </span>
                <span
                  style={{
                    fontSize: '10px',
                    color: '#71717A',
                    display: 'block',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {qSong.artist}
                </span>
              </div>
              <span style={{ fontSize: '10px', color: '#52525B', flexShrink: 0 }}>
                {formatDuration(qSong.duration || 180)}
              </span>
            </div>
          ))}

          {state.queue.length <= state.queueIndex + 1 && (
            <div style={{ color: '#71717A', padding: '12px 0', textAlign: 'center', fontSize: '12px' }}>
              End of queue. AutoMix recommendations will play next.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
