import { useState, useEffect } from 'react';
import { usePlayer } from '../state/PlayerContext';
import { useApp } from '../state/AppContext';
import { EmptyState } from '../components/shared/ErrorState';
import { formatDuration } from '../core/utils';
import { CONFIG } from '../config';
import { smartRecommendationEngine } from '../domain/recommendation/SmartRecommendationEngine';
import { SongOptionsBottomSheet } from '../components/shared/SongOptionsBottomSheet';
import { resizeImageUrl } from '../core/utils/imageUtils';
import type { Song } from '../data/models';

export function QueueScreen() {
  const { state, closeQueue, removeFromQueue, clearQueue, playSong, toggleAutoPlay, addToQueue } = usePlayer();
  const { state: appState } = useApp();
  const { queue, queueIndex, currentSong, autoPlay } = state;

  const upcomingTracks = queue.slice(queueIndex + 1);

  const [recommendedPreview, setRecommendedPreview] = useState<Song[]>([]);
  const [loadingRecs, setLoadingRecs] = useState(false);

  // Load preview recommendations if queue is short (< 3 upcoming tracks) and autoPlay is on
  useEffect(() => {
    if (!autoPlay || !currentSong) {
      setRecommendedPreview([]);
      return;
    }

    if (upcomingTracks.length < 3) {
      setLoadingRecs(true);
      smartRecommendationEngine
        .getSmartNextTracks(currentSong, 4, {
          languages: appState.musicLanguages,
          favorites: appState.favorites,
          userPlaylists: appState.userPlaylists,
          searchHistory: appState.searchHistory,
          recentlyPlayed: appState.recentlyPlayed,
          queue,
        })
        .then((recs) => {
          setRecommendedPreview(recs);
        })
        .catch(() => {})
        .finally(() => setLoadingRecs(false));
    }
  }, [currentSong?.id, upcomingTracks.length, autoPlay, appState.musicLanguages]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Playback queue"
      style={{
        position: 'fixed', inset: 0, zIndex: 180,
        background: 'var(--color-bg)',
        display: 'flex', flexDirection: 'column',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        animation: 'slideUp 300ms var(--ease-decelerate)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
        <button id="queue-close-btn" aria-label="Close queue" onClick={closeQueue} className="btn-icon" style={{ minWidth: 44, minHeight: 44 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <polyline points="6 9 12 15 18 9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <h2 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-body)' }}>
          Queue
        </h2>
        <button
          id="queue-clear-btn"
          aria-label="Clear queue"
          onClick={clearQueue}
          style={{
            background: 'none', border: 'none',
            fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)',
            cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 500,
            padding: '8px',
          }}
        >
          Clear
        </button>
      </div>

      <div className="scroll-area" style={{ flex: 1 }}>
        {/* Smart AutoPlay Banner / Toggle */}
        <div style={{
          margin: '14px 20px 0',
          padding: '12px 14px',
          borderRadius: 'var(--radius-lg)',
          background: autoPlay ? 'rgba(245, 158, 11, 0.08)' : 'var(--color-surface)',
          border: autoPlay ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid var(--color-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          transition: 'all 200ms ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: autoPlay ? 'var(--color-accent)' : 'var(--color-surface-2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: autoPlay ? '#fff' : 'var(--color-text-muted)',
              transition: 'all 200ms ease',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
              </svg>
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: autoPlay ? 'var(--color-accent)' : 'var(--color-text-primary)', lineHeight: 1.2 }}>
                Smart AutoPlay
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--color-text-muted)', lineHeight: 1.2 }}>
                {autoPlay ? 'Plays continuous recommendations' : 'Stops at the end of queue'}
              </p>
            </div>
          </div>

          <button
            onClick={toggleAutoPlay}
            aria-label={autoPlay ? 'Disable AutoPlay' : 'Enable AutoPlay'}
            style={{
              width: 44, height: 24, borderRadius: 12,
              background: autoPlay ? 'var(--color-accent)' : 'var(--color-surface-2)',
              border: 'none', cursor: 'pointer', position: 'relative',
              transition: 'all 200ms ease',
              padding: 2,
            }}
          >
            <div style={{
              width: 20, height: 20, borderRadius: '50%',
              background: '#fff',
              transform: autoPlay ? 'translateX(20px)' : 'translateX(0)',
              transition: 'transform 200ms ease',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
            }} />
          </button>
        </div>

        {/* Now playing */}
        {currentSong && (
          <section style={{ padding: '16px 20px 8px' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 'var(--text-xs)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-accent)' }}>
              Now Playing
            </h3>
            <QueueTrackRow song={currentSong} isCurrent />
          </section>
        )}

        {/* Upcoming in Queue */}
        {upcomingTracks.length > 0 && (
          <section style={{ padding: '8px 20px' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 'var(--text-xs)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>
              Up Next in Queue · {upcomingTracks.length} {upcomingTracks.length === 1 ? 'track' : 'tracks'}
            </h3>
            {upcomingTracks.map((song, i) => {
              const realIndex = queueIndex + 1 + i;
              return (
                <QueueTrackRow
                  key={`${song.id}_${realIndex}`}
                  song={song}
                  onRemove={() => removeFromQueue(realIndex)}
                  onPlay={() => playSong(song, queue, realIndex)}
                />
              );
            })}
          </section>
        )}

        {/* Smart AutoPlay Recommendations Section */}
        {autoPlay && recommendedPreview.length > 0 && (
          <section style={{ padding: '16px 20px 8px', borderTop: upcomingTracks.length > 0 ? '1px dashed var(--color-border)' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-accent)', background: 'rgba(245,158,11,0.1)', padding: '2px 8px', borderRadius: 999 }}>
                  AI AutoPlay
                </span>
                <h3 style={{ margin: 0, fontSize: 'var(--text-xs)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>
                  Recommended Next
                </h3>
              </div>
            </div>

            {recommendedPreview.map((song) => (
              <div
                key={`rec_${song.id}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '8px 0',
                }}
              >
                <img
                  src={resizeImageUrl(song.artworkLg || song.artwork, 544, 544)}
                  alt={song.title}
                  width={44} height={44}
                  loading="lazy"
                  onError={(e) => { (e.target as HTMLImageElement).src = CONFIG.ARTWORK_PLACEHOLDER; }}
                  style={{ borderRadius: 'var(--radius-md)', objectFit: 'cover', flexShrink: 0 }}
                />
                <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => playSong(song)}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {song.title}
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {song.artist}
                  </p>
                </div>
                <button
                  onClick={() => addToQueue(song)}
                  aria-label={`Add ${song.title} to queue`}
                  style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 999,
                    padding: '4px 10px',
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--color-text-secondary)',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  + Queue
                </button>
              </div>
            ))}
          </section>
        )}

        {/* Empty State if queue is empty and autoPlay is off */}
        {upcomingTracks.length === 0 && (!autoPlay || (recommendedPreview.length === 0 && !loadingRecs)) && (
          <div style={{ padding: '16px 20px' }}>
            <EmptyState
              title="Queue is empty"
              subtitle="Add songs to the queue or enable Smart AutoPlay."
            />
          </div>
        )}

        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}

function QueueTrackRow({ song, isCurrent, onRemove, onPlay }: {
  song: ReturnType<typeof usePlayer>['state']['queue'][0];
  isCurrent?: boolean;
  onRemove?: () => void;
  onPlay?: () => void;
}) {
  const [showOptions, setShowOptions] = useState(false);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 0',
      background: isCurrent ? 'var(--color-accent-dim)' : 'transparent',
      borderRadius: isCurrent ? 'var(--radius-md)' : 0,
      paddingLeft: isCurrent ? 10 : 0,
      paddingRight: isCurrent ? 10 : 0,
      marginBottom: isCurrent ? 4 : 0,
    }}>
      {/* Artwork */}
      <img
        src={resizeImageUrl(song.artworkLg || song.artwork, 544, 544)}
        alt={`${song.album} artwork`}
        width={48} height={48}
        loading="lazy"
        onError={(e) => { (e.target as HTMLImageElement).src = CONFIG.ARTWORK_PLACEHOLDER; }}
        style={{ borderRadius: 'var(--radius-md)', objectFit: 'cover', flexShrink: 0 }}
      />

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0, cursor: onPlay ? 'pointer' : 'default' }} onClick={onPlay}>
        <p style={{
          margin: 0, fontSize: 'var(--text-base)', fontWeight: 600,
          color: isCurrent ? 'var(--color-accent)' : 'var(--color-text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {song.title}
        </p>
        <p style={{
          margin: '2px 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {song.artist}
        </p>
      </div>

      {/* Duration */}
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', flexShrink: 0 }}>
        {formatDuration(song.duration)}
      </span>

      {/* 3-dots more options */}
      <button
        id={`queue-more-${song.id}`}
        aria-label="More options"
        className="btn-icon"
        style={{ minWidth: 36, minHeight: 36, padding: 6, color: 'var(--color-text-muted)' }}
        onClick={(e) => {
          e.stopPropagation();
          setShowOptions(true);
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="1.5"/>
          <circle cx="12" cy="12" r="1.5"/>
          <circle cx="12" cy="19" r="1.5"/>
        </svg>
      </button>

      {/* Remove from queue */}
      {onRemove && (
        <button
          id={`queue-remove-${song.id}`}
          aria-label={`Remove ${song.title} from queue`}
          onClick={onRemove}
          className="btn-icon"
          style={{ minWidth: 36, minHeight: 36, padding: 6, color: 'var(--color-text-muted)' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
            <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
          </svg>
        </button>
      )}

      {showOptions && (
        <SongOptionsBottomSheet
          song={song}
          onClose={() => setShowOptions(false)}
        />
      )}
    </div>
  );
}
