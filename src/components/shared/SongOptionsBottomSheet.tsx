import { useState } from 'react';
import type { Song, Playlist } from '../../data/models';
import { useApp } from '../../state/AppContext';
import { usePlayer } from '../../state/PlayerContext';
import { CONFIG } from '../../config';
import { showToast } from '../../core/utils/toast';

interface SongOptionsBottomSheetProps {
  song: Song | null;
  playlistId?: string;
  onClose: () => void;
  onRemoveFromCurrentList?: () => void;
}

export function SongOptionsBottomSheet({
  song,
  playlistId,
  onClose,
  onRemoveFromCurrentList,
}: SongOptionsBottomSheetProps) {
  const {
    state: appState,
    dispatch,
    isFavorite,
    toggleFavorite,
    addToPlaylist,
    removeFromPlaylist,
    nav: { navigate },
  } = useApp();
  const { addToQueue, state: playerState } = usePlayer();

  const [view, setView] = useState<'main' | 'playlists' | 'create_playlist'>('main');
  const [newPlaylistTitle, setNewPlaylistTitle] = useState('');

  if (!song) return null;

  const liked = isFavorite(song.id);
  const primaryArtist = (song.artist || '')
    .split(/[,&/]|feat\.|ft\.|with|\s+x\s+/i)[0]
    ?.trim() || song.artist;

  const isSongInQueue = playerState.queue.some((s) => s.id === song.id);

  // ── Action Handlers ──

  const handleToggleFavorite = () => {
    toggleFavorite(song);
    showToast(liked ? `Removed from Liked Songs` : `Saved to Liked Songs`, liked ? 'info' : 'success');
    onClose();
  };

  const handleAddToQueue = () => {
    if (isSongInQueue) {
      showToast(`"${song.title}" is already in queue`, 'info');
    } else {
      addToQueue(song);
      showToast(`Added "${song.title}" to Up Next`, 'success');
    }
    onClose();
  };

  const handleGoToArtist = () => {
    onClose();
    navigate('artist', { artistName: primaryArtist });
  };

  const handleRemoveFromThisPlaylist = () => {
    if (playlistId) {
      removeFromPlaylist(playlistId, song.id);
      showToast(`Removed from playlist`, 'danger');
    } else if (onRemoveFromCurrentList) {
      onRemoveFromCurrentList();
      showToast(`Removed from list`, 'danger');
    }
    onClose();
  };

  const handleSelectPlaylist = (pl: Playlist) => {
    const isAlreadyIn = pl.tracks.some((t) => t.id === song.id);
    if (isAlreadyIn) {
      showToast(`Already in "${pl.title}"`, 'info');
    } else {
      addToPlaylist(pl.id, song);
      showToast(`Added to "${pl.title}"`, 'success');
    }
    onClose();
  };

  const handleCreateAndAdd = () => {
    if (!newPlaylistTitle.trim()) return;
    const title = newPlaylistTitle.trim();
    dispatch({ type: 'CREATE_PLAYLIST', payload: { title } });
    showToast(`Created "${title}"`, 'success');
    onClose();
  };

  return (
    <div
      id="song-options-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 500,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        animation: 'fadeIn 200ms ease-out',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="song-options-sheet"
        style={{
          background: 'var(--color-surface)',
          width: '100%',
          maxWidth: 'var(--screen-max)',
          maxHeight: '85vh',
          borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0',
          padding: '16px 20px',
          paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
          boxShadow: '0 -10px 40px rgba(0, 0, 0, 0.85)',
          borderTop: '1px solid var(--color-border)',
          animation: 'slideUp 250ms cubic-bezier(0, 0, 0.2, 1)',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          overflowY: 'auto',
        }}
      >
        {/* Drag Handle */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={{
            width: 38,
            height: 4,
            borderRadius: 2,
            background: 'rgba(255, 255, 255, 0.25)',
          }} />
        </div>

        {/* ── Song Header Banner ── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          paddingBottom: 14,
          borderBottom: '1px solid var(--color-border)',
        }}>
          <div style={{
            width: 54,
            height: 54,
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
            background: 'var(--color-surface-2)',
            flexShrink: 0,
            boxShadow: 'var(--shadow-sm)',
            border: '1px solid var(--color-border)',
          }}>
            <img
              src={song.artwork || CONFIG.ARTWORK_PLACEHOLDER}
              alt=""
              width={54}
              height={54}
              onError={(e) => { (e.target as HTMLImageElement).src = CONFIG.ARTWORK_PLACEHOLDER; }}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              margin: 0,
              fontWeight: 700,
              fontSize: 'var(--text-md)',
              color: 'var(--color-text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {song.title}
            </p>
            <p style={{
              margin: '3px 0 0',
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-secondary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {song.artist}
            </p>
          </div>

          {/* Close (X) Button */}
          <button
            type="button"
            id="close-song-options-btn"
            aria-label="Close menu"
            onClick={onClose}
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'var(--color-surface-2)',
              border: '1px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* ── View 1: Main Song Options ── */}
        {view === 'main' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {/* 1. Like / Save to Liked Songs */}
            <button
              type="button"
              id="song-action-like"
              onClick={handleToggleFavorite}
              className="btn-ghost"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '12px 10px',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                border: 'none',
                background: 'transparent',
                textAlign: 'left',
                width: '100%',
              }}
            >
              <div style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: liked ? 'rgba(239, 68, 68, 0.12)' : 'var(--color-surface-2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: liked ? 'var(--color-error, #EF4444)' : 'var(--color-text-primary)',
                flexShrink: 0,
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {liked ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                  {liked ? 'Currently in your library' : 'Save for easy quick access'}
                </p>
              </div>
            </button>

            {/* 2. Add to Queue / Play Next */}
            <button
              type="button"
              id="song-action-add-queue"
              onClick={handleAddToQueue}
              className="btn-ghost"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '12px 10px',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                border: 'none',
                background: 'transparent',
                textAlign: 'left',
                width: '100%',
              }}
            >
              <div style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: 'var(--color-surface-2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-text-primary)',
                flexShrink: 0,
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="16" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" />
                  <line x1="3" y1="12" x2="3.01" y2="12" />
                  <polyline points="18 15 21 18 18 21" />
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  Add to Queue
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                  Play next after current songs
                </p>
              </div>
            </button>

            {/* 3. Add to Playlist */}
            <button
              type="button"
              id="song-action-add-playlist"
              onClick={() => setView('playlists')}
              className="btn-ghost"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '12px 10px',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                border: 'none',
                background: 'transparent',
                textAlign: 'left',
                width: '100%',
              }}
            >
              <div style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: 'var(--color-surface-2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-text-primary)',
                flexShrink: 0,
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                  <line x1="12" y1="7" x2="12" y2="13" />
                  <line x1="9" y1="10" x2="15" y2="10" />
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  Add to Playlist
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                  Add to existing or new playlist
                </p>
              </div>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>

            {/* 4. Remove from Playlist (shown when opened inside a playlist or list with remove support) */}
            {(playlistId || onRemoveFromCurrentList) && (
              <button
                type="button"
                id="song-action-remove-playlist"
                onClick={handleRemoveFromThisPlaylist}
                className="btn-ghost"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '12px 10px',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  border: 'none',
                  background: 'transparent',
                  textAlign: 'left',
                  width: '100%',
                }}
              >
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: 'rgba(239, 68, 68, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-error, #EF4444)',
                  flexShrink: 0,
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <line x1="10" y1="11" x2="10" y2="17" />
                    <line x1="14" y1="11" x2="14" y2="17" />
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-error, #EF4444)' }}>
                    Remove from this Playlist
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                    Delete track from this collection
                  </p>
                </div>
              </button>
            )}

            {/* 5. Go to Artist */}
            <button
              type="button"
              id="song-action-go-artist"
              onClick={handleGoToArtist}
              className="btn-ghost"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '12px 10px',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                border: 'none',
                background: 'transparent',
                textAlign: 'left',
                width: '100%',
              }}
            >
              <div style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: 'var(--color-surface-2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-text-primary)',
                flexShrink: 0,
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  Go to Artist
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {primaryArtist}
                </p>
              </div>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        )}

        {/* ── View 2: Playlist Selector ── */}
        {view === 'playlists' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 6 }}>
              <button
                type="button"
                onClick={() => setView('main')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 'var(--text-sm)',
                  padding: 0,
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                <span>Back</span>
              </button>

              <button
                type="button"
                id="create-new-playlist-sheet-btn"
                onClick={() => setView('create_playlist')}
                style={{
                  background: 'var(--color-accent)',
                  color: 'var(--color-accent-on)',
                  border: 'none',
                  borderRadius: 'var(--radius-full)',
                  padding: '6px 14px',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>New Playlist</span>
              </button>
            </div>

            <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {appState.userPlaylists.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--color-text-secondary)' }}>
                  <p style={{ margin: 0, fontSize: 'var(--text-sm)' }}>No playlists created yet</p>
                  <button
                    type="button"
                    onClick={() => setView('create_playlist')}
                    className="btn btn-primary"
                    style={{ marginTop: 12, padding: '8px 16px', fontSize: 'var(--text-xs)' }}
                  >
                    Create First Playlist
                  </button>
                </div>
              ) : (
                appState.userPlaylists.map((pl) => {
                  const alreadyIn = pl.tracks.some((t) => t.id === song.id);
                  return (
                    <button
                      key={pl.id}
                      type="button"
                      id={`select-pl-${pl.id}`}
                      onClick={() => handleSelectPlaylist(pl)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '10px 8px',
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                        border: 'none',
                        background: 'transparent',
                        textAlign: 'left',
                        width: '100%',
                        transition: 'background 120ms ease',
                      }}
                    >
                      <div style={{
                        width: 44,
                        height: 44,
                        borderRadius: 'var(--radius-md)',
                        overflow: 'hidden',
                        background: 'var(--color-surface-2)',
                        flexShrink: 0,
                      }}>
                        <img
                          src={pl.artwork || CONFIG.ARTWORK_PLACEHOLDER}
                          alt=""
                          width={44}
                          height={44}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {pl.title}
                        </p>
                        <p style={{ margin: '2px 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                          {pl.tracks.length} songs
                        </p>
                      </div>
                      {alreadyIn && (
                        <div style={{
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          background: 'rgba(16, 185, 129, 0.15)',
                          color: '#10B981',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ── View 3: Create New Playlist & Add ── */}
        {view === 'create_playlist' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                onClick={() => setView('playlists')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  cursor: 'pointer',
                  padding: 4,
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <h3 style={{ margin: 0, fontSize: 'var(--text-md)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                New Playlist
              </h3>
            </div>

            <input
              id="new-playlist-sheet-input"
              type="text"
              placeholder="Playlist name..."
              value={newPlaylistTitle}
              onChange={(e) => setNewPlaylistTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateAndAdd(); }}
              autoFocus
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-surface-2)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-primary)',
                fontSize: 'var(--text-sm)',
                fontFamily: 'var(--font-body)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={() => setView('playlists')}
                className="btn btn-ghost"
                style={{ flex: 1, padding: '12px', borderRadius: 'var(--radius-md)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                id="save-new-playlist-sheet-btn"
                onClick={handleCreateAndAdd}
                disabled={!newPlaylistTitle.trim()}
                className="btn btn-primary"
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: 'var(--radius-md)',
                  opacity: newPlaylistTitle.trim() ? 1 : 0.5,
                }}
              >
                Create & Add
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
