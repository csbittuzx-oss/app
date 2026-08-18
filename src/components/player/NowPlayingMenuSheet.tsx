import React, { useState, useEffect } from 'react';
import { usePlayer } from '../../state/PlayerContext';
import { useApp } from '../../state/AppContext';
import { sleepTimerService, type SleepTimerState } from '../../services/SleepTimerService';
import { formatDuration } from '../../core/utils';
import { showToast } from '../../core/utils/toast';
import { CONFIG } from '../../config';
import { resizeImageUrl } from '../../core/utils/imageUtils';

interface NowPlayingMenuSheetProps {
  onClose: () => void;
}

export function NowPlayingMenuSheet({ onClose }: NowPlayingMenuSheetProps) {
  const { state: playerState, openQueue } = usePlayer();
  const { state: appState, dispatch, isFavorite, toggleFavorite, addToPlaylist, removeFromPlaylist } = useApp();
  const { currentSong } = playerState;

  const [sleepState, setSleepState] = useState<SleepTimerState>(sleepTimerService.getState());
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [showCreateInput, setShowCreateInput] = useState(false);

  // Subscribe to Sleep Timer state updates
  useEffect(() => {
    return sleepTimerService.subscribe(setSleepState);
  }, []);

  if (!currentSong) return null;

  const isLiked = isFavorite(currentSong.id);

  const handleToggleFavorite = () => {
    toggleFavorite(currentSong);
    if (!isLiked) {
      showToast('Added to Liked Songs', 'success');
    } else {
      showToast('Removed from Liked Songs', 'danger');
    }
  };

  const handleCreatePlaylist = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;
    dispatch({
      type: 'CREATE_PLAYLIST',
      payload: { title: newPlaylistName.trim() },
    });
    // Find newly created playlist (or wait next tick) to add song
    showToast(`Playlist "${newPlaylistName.trim()}" created`, 'success');
    setNewPlaylistName('');
    setShowCreateInput(false);
  };

  const timerPresets = [
    { label: '1 minute', minutes: 1 },
    { label: '5 minutes', minutes: 5 },
    { label: '10 minutes', minutes: 10 },
    { label: '20 minutes', minutes: 20 },
    { label: '30 minutes', minutes: 30 },
    { label: '45 minutes', minutes: 45 },
    { label: '1 hour', minutes: 60 },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        animation: 'fadeIn 200ms ease',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--color-surface)',
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          borderTop: '1px solid var(--color-border)',
          boxShadow: '0 -12px 48px rgba(0,0,0,0.5)',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'slideUp 280ms cubic-bezier(0.2, 0.9, 0.3, 1)',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag Pill Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, paddingBottom: 4 }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--color-border)' }} />
        </div>

        {/* Header with Close (X) button */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 20px 14px' }}>
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>
            Track Options
          </span>
          <button
            onClick={onClose}
            aria-label="Close options"
            className="btn-icon"
            style={{ minWidth: 36, minHeight: 36, padding: 6, color: 'var(--color-text-secondary)' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Current Song Preview Banner */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '0 20px 16px',
          borderBottom: '1px solid var(--color-border)',
        }}>
          <img
            src={resizeImageUrl(currentSong.artworkLg || currentSong.artwork, 544, 544)}
            alt={`${currentSong.title} artwork`}
            style={{
              width: 52,
              height: 52,
              borderRadius: 'var(--radius-md)',
              objectFit: 'cover',
              flexShrink: 0,
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              border: '1px solid var(--color-border)',
            }}
            onError={(e) => { (e.target as HTMLImageElement).src = CONFIG.ARTWORK_PLACEHOLDER; }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h4 style={{
              margin: 0,
              fontSize: 'var(--text-base)',
              fontWeight: 600,
              color: 'var(--color-text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {currentSong.title}
            </h4>
            <p style={{
              margin: '3px 0 0',
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-secondary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {currentSong.artist}
            </p>
          </div>
        </div>

        {/* Sheet Scrollable Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          
          {/* ── Section: Song Actions ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {/* Like / Liked Songs */}
            <button
              onClick={handleToggleFavorite}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '12px 14px',
                borderRadius: 'var(--radius-lg)',
                background: isLiked ? 'rgba(245, 158, 11, 0.12)' : 'var(--color-surface-2)',
                border: isLiked ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid transparent',
                color: isLiked ? 'var(--color-accent)' : 'var(--color-text-primary)',
                fontSize: 'var(--text-sm)',
                fontWeight: 600,
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all 200ms ease',
              }}
            >
              <div style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: isLiked ? 'var(--color-accent)' : 'rgba(255,255,255,0.08)',
                color: isLiked ? '#FFFFFF' : 'currentColor',
                flexShrink: 0,
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill={isLiked ? '#FFFFFF' : 'none'} stroke="currentColor" strokeWidth="2">
                  <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <span>{isLiked ? 'Added to Liked Songs' : 'Add to Liked Songs'}</span>
              </div>
              {isLiked && (
                <span style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: 700,
                  background: 'var(--color-accent)',
                  color: '#FFFFFF',
                  padding: '2px 8px',
                  borderRadius: 999,
                }}>
                  Liked ✓
                </span>
              )}
            </button>

            {/* Add / Manage Playlists */}
            <button
              onClick={() => setShowPlaylistPicker(!showPlaylistPicker)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '12px 14px',
                borderRadius: 'var(--radius-lg)',
                background: 'var(--color-surface-2)',
                border: '1px solid transparent',
                color: 'var(--color-text-primary)',
                fontSize: 'var(--text-sm)',
                fontWeight: 600,
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <div style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(255,255,255,0.08)',
                color: 'currentColor',
                flexShrink: 0,
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="8" y1="6" x2="21" y2="6" strokeLinecap="round" />
                  <line x1="8" y1="12" x2="21" y2="12" strokeLinecap="round" />
                  <line x1="8" y1="18" x2="21" y2="18" strokeLinecap="round" />
                  <line x1="3" y1="6" x2="3.01" y2="6" strokeWidth="3" strokeLinecap="round" />
                  <line x1="3" y1="12" x2="3.01" y2="12" strokeWidth="3" strokeLinecap="round" />
                  <line x1="3" y1="18" x2="3.01" y2="18" strokeWidth="3" strokeLinecap="round" />
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <span>Add to / Manage Playlists</span>
              </div>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{
                  transform: showPlaylistPicker ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 200ms ease',
                  color: 'var(--color-text-muted)',
                }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {/* Expandable Playlist Selection Sub-view */}
            {showPlaylistPicker && (
              <div style={{
                marginTop: 4,
                padding: '12px',
                borderRadius: 'var(--radius-lg)',
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                animation: 'fadeIn 200ms ease',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                    Select Playlist
                  </span>
                  <button
                    onClick={() => setShowCreateInput(!showCreateInput)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-accent)',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 700,
                      cursor: 'pointer',
                      padding: '2px 6px',
                    }}
                  >
                    + New Playlist
                  </button>
                </div>

                {/* Create Playlist Inline Form */}
                {showCreateInput && (
                  <form onSubmit={handleCreatePlaylist} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <input
                      type="text"
                      placeholder="Playlist name..."
                      value={newPlaylistName}
                      onChange={(e) => setNewPlaylistName(e.target.value)}
                      autoFocus
                      style={{
                        flex: 1,
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        padding: '8px 12px',
                        color: 'var(--color-text-primary)',
                        fontSize: 'var(--text-xs)',
                        outline: 'none',
                      }}
                    />
                    <button
                      type="submit"
                      style={{
                        background: 'var(--color-accent)',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: 'var(--radius-md)',
                        padding: '0 14px',
                        fontSize: 'var(--text-xs)',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Save
                    </button>
                  </form>
                )}

                {/* Playlists List */}
                {appState.userPlaylists.length === 0 ? (
                  <p style={{ margin: '8px 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textAlign: 'center' }}>
                    No playlists created yet.
                  </p>
                ) : (
                  appState.userPlaylists.map((pl) => {
                    const isInside = pl.tracks.some((t) => t.id === currentSong.id);
                    return (
                      <div
                        key={pl.id}
                        onClick={() => {
                          if (isInside) {
                            removeFromPlaylist(pl.id, currentSong.id);
                            showToast(`Removed from ${pl.title}`, 'danger');
                          } else {
                            addToPlaylist(pl.id, currentSong);
                            showToast(`Added to ${pl.title}`, 'success');
                          }
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 10px',
                          borderRadius: 'var(--radius-md)',
                          background: isInside ? 'rgba(16, 185, 129, 0.1)' : 'var(--color-surface)',
                          border: isInside ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid transparent',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-text-primary)' }}>
                            {pl.title}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                            ({pl.tracks.length} tracks)
                          </span>
                        </div>
                        <div style={{
                          width: 20,
                          height: 20,
                          borderRadius: '50%',
                          border: isInside ? 'none' : '1.5px solid var(--color-border)',
                          background: isInside ? '#10B981' : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#FFFFFF',
                        }}>
                          {isInside && (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Open Queue Button */}
            <button
              onClick={() => {
                onClose();
                openQueue();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '12px 14px',
                borderRadius: 'var(--radius-lg)',
                background: 'var(--color-surface-2)',
                border: '1px solid transparent',
                color: 'var(--color-text-primary)',
                fontSize: 'var(--text-sm)',
                fontWeight: 600,
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <div style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(255,255,255,0.08)',
                color: 'currentColor',
                flexShrink: 0,
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <circle cx="3" cy="6" r="1.5" fill="currentColor" />
                  <circle cx="3" cy="12" r="1.5" fill="currentColor" />
                  <circle cx="3" cy="18" r="1.5" fill="currentColor" />
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <span>Playback Queue</span>
              </div>
            </button>
          </div>

          {/* ── Section: Sleep Timer ── */}
          <div style={{
            background: 'var(--color-surface-2)',
            borderRadius: 'var(--radius-xl)',
            padding: '16px',
            border: sleepState.isActive ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid var(--color-border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-accent)' }}>
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  Sleep Timer
                </span>
              </div>

              {sleepState.isActive && (
                <span style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  background: 'rgba(245, 158, 11, 0.18)',
                  color: 'var(--color-accent)',
                  padding: '3px 10px',
                  borderRadius: 999,
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                }}>
                  {sleepState.mode === 'end_of_track'
                    ? 'End of Track'
                    : `${formatDuration(sleepState.remainingSeconds)} left`}
                </span>
              )}
            </div>

            {/* If Sleep Timer is Active -> Show Turn Off Button */}
            {sleepState.isActive ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                  Music playback will automatically stop {sleepState.mode === 'end_of_track' ? 'when the current track ends.' : `in ${formatDuration(sleepState.remainingSeconds)}.`}
                </p>
                <button
                  onClick={() => sleepTimerService.cancel()}
                  style={{
                    background: 'rgba(239, 68, 68, 0.15)',
                    color: '#EF4444',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '10px 16px',
                    fontSize: 'var(--text-sm)',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    transition: 'all 200ms ease',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                  Turn Off Sleep Timer
                </button>
              </div>
            ) : (
              /* If Sleep Timer is Inactive -> Show Preset Choices */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: 8,
                }}>
                  {timerPresets.map((p) => (
                    <button
                      key={p.minutes}
                      onClick={() => sleepTimerService.setTimer(p.minutes, p.label)}
                      style={{
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        padding: '9px 4px',
                        fontSize: 'var(--text-xs)',
                        fontWeight: 600,
                        color: 'var(--color-text-primary)',
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'all 150ms ease',
                      }}
                    >
                      {p.label.replace(' minutes', 'm').replace(' minute', 'm').replace(' hour', 'h')}
                    </button>
                  ))}
                </div>

                {/* End of Track Option */}
                <button
                  onClick={() => sleepTimerService.setEndOfTrack()}
                  style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    padding: '10px 14px',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    color: 'var(--color-text-primary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    marginTop: 2,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                  End of Track
                </button>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
