import { useState, useRef } from 'react';
import { useApp } from '../state/AppContext';
import { usePlayer } from '../state/PlayerContext';
import { SongCard } from '../components/cards/SongCard';
import { ArtistCard } from '../components/cards/ArtistCard';
import { EmptyState } from '../components/shared/ErrorState';
import { SpotifyImportModal } from '../components/library/SpotifyImportModal';
import { PlaylistActionModal } from '../components/library/PlaylistActionModal';
import { filterSpotifyAvailableTracksSync } from '../services/SpotifyAvailabilityService';
import type { Playlist } from '../data/models';

type LibTab = 'playlists' | 'songs' | 'artists';

const SpotifyIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.625.625 0 01-.86.205c-2.355-1.439-5.32-1.765-8.813-.967a.625.625 0 11-.28-1.22c3.824-.875 7.106-.508 9.748 1.106.29.177.382.56.205.876zm1.226-2.723a.782.782 0 01-1.077.257c-2.697-1.658-6.808-2.137-9.997-1.17a.781.781 0 01-.452-1.498c3.64-1.105 8.19-.57 11.27 1.326.37.228.486.713.256 1.085zm.105-2.835C14.692 8.946 9.38 8.769 6.302 9.704a.938.938 0 01-.55-1.794c3.528-1.07 9.4-0.865 13.12 1.345a.938.938 0 01-1.127 1.498z"/>
  </svg>
);

export function LibraryScreen() {
  const { state, dispatch, nav: { navigate } } = useApp();
  const { playSong: _playSong } = usePlayer();
  const [activeTab, setActiveTab] = useState<LibTab>('playlists');
  const [showCreatePlaylist, setShowCreatePlaylist] = useState(false);
  const [showSpotifyImport, setShowSpotifyImport] = useState(false);
  const [newPlaylistTitle, setNewPlaylistTitle] = useState('');
  const [activeActionPlaylist, setActiveActionPlaylist] = useState<Playlist | null>(null);

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressTriggeredRef = useRef(false);

  const handleCreatePlaylist = () => {
    if (!newPlaylistTitle.trim()) return;
    dispatch({ type: 'CREATE_PLAYLIST', payload: { title: newPlaylistTitle.trim() } });
    setNewPlaylistTitle('');
    setShowCreatePlaylist(false);
  };

  const handleTouchStart = (playlist: Playlist) => {
    isLongPressTriggeredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      isLongPressTriggeredRef.current = true;
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try { navigator.vibrate(50); } catch {}
      }
      setActiveActionPlaylist(playlist);
    }, 450); // 450ms hold to open half-screen bottom sheet
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handlePlaylistClick = (playlist: Playlist) => {
    if (isLongPressTriggeredRef.current) {
      isLongPressTriggeredRef.current = false;
      return;
    }
    navigate('playlist', { playlistId: playlist.id });
  };

  const TABS: { id: LibTab; label: string }[] = [
    { id: 'playlists', label: 'Playlists' },
    { id: 'songs', label: 'Liked Songs' },
    { id: 'artists', label: 'Artists' },
  ];

  // Sort pinned playlists first
  const sortedPlaylists = [...state.userPlaylists].sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <header style={{ padding: '20px 20px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)', color: 'var(--color-text-primary)' }}>
            Library
          </h1>
          {activeTab === 'playlists' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Import Spotify Button */}
              <button
                id="spotify-import-top-btn"
                aria-label="Import Spotify Playlist"
                onClick={() => setShowSpotifyImport(true)}
                style={{
                  height: 36,
                  padding: '0 12px',
                  borderRadius: 'var(--radius-full)',
                  background: 'rgba(29, 185, 84, 0.15)',
                  border: '1px solid rgba(29, 185, 84, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer',
                  color: '#1DB954',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  fontFamily: 'var(--font-body)',
                }}
              >
                <SpotifyIcon size={16} />
                <span>Import Spotify</span>
              </button>

              {/* Create Blank Playlist Button */}
              <button
                id="create-playlist-btn"
                aria-label="Create new playlist"
                onClick={() => setShowCreatePlaylist(true)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: 'var(--color-accent-dim)',
                  border: '1px solid var(--color-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: 'var(--color-accent)',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 12 }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              id={`lib-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              aria-pressed={activeTab === tab.id}
              style={{
                background: activeTab === tab.id ? 'var(--color-accent)' : 'var(--color-surface-2)',
                color: activeTab === tab.id ? 'var(--color-accent-on)' : 'var(--color-text-secondary)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-full)',
                padding: '6px 16px',
                fontSize: 'var(--text-sm)',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'var(--font-body)',
                flexShrink: 0,
                transition: 'all 200ms var(--ease-standard)',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* Spotify Import Modal */}
      <SpotifyImportModal
        isOpen={showSpotifyImport}
        onClose={() => setShowSpotifyImport(false)}
      />

      {/* Touch & Hold Playlist Action Bottom Sheet Modal */}
      <PlaylistActionModal
        playlist={activeActionPlaylist}
        onClose={() => setActiveActionPlaylist(null)}
      />

      {/* Create playlist modal */}
      {showCreatePlaylist && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Create playlist"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 300,
            background: 'var(--color-scrim)',
            display: 'flex',
            alignItems: 'flex-end',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreatePlaylist(false); }}
        >
          <div style={{
            background: 'var(--color-surface)',
            width: '100%',
            borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0',
            padding: '24px 20px',
            paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
            animation: 'slideUp 300ms var(--ease-decelerate)',
          }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
              New Playlist
            </h2>
            <input
              id="playlist-title-input"
              autoFocus
              type="text"
              placeholder="Playlist name"
              value={newPlaylistTitle}
              onChange={e => setNewPlaylistTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreatePlaylist()}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                background: 'var(--color-surface-2)',
                border: '1.5px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                padding: '12px 16px',
                fontSize: 'var(--text-md)',
                color: 'var(--color-text-primary)',
                fontFamily: 'var(--font-body)',
                outline: 'none',
                marginBottom: 16,
              }}
              onFocus={e => { e.target.style.borderColor = 'var(--color-border-focus)'; }}
              onBlur={e => { e.target.style.borderColor = 'var(--color-border)'; }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                id="cancel-playlist-btn"
                onClick={() => setShowCreatePlaylist(false)}
                className="btn btn-ghost"
                style={{ flex: 1, padding: '12px', borderRadius: 'var(--radius-md)' }}
              >
                Cancel
              </button>
              <button
                id="confirm-playlist-btn"
                onClick={handleCreatePlaylist}
                disabled={!newPlaylistTitle.trim()}
                className="btn btn-primary"
                style={{ flex: 1, padding: '12px', borderRadius: 'var(--radius-md)', opacity: newPlaylistTitle.trim() ? 1 : 0.5 }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="scroll-area" style={{ flex: 1, padding: '0 20px', paddingBottom: 'var(--content-bottom-pad)' }}>

        {/* Playlists tab */}
        {activeTab === 'playlists' && (
          sortedPlaylists.length === 0 && state.recentlyPlayed.length === 0 ? (
            <EmptyState
              icon={
                <svg width="52" height="52" viewBox="0 0 24 24" fill="none">
                  <path d="M9 18V5l12-2v13" stroke="var(--color-text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="6" cy="18" r="3" stroke="var(--color-text-muted)" strokeWidth="1.5"/>
                  <circle cx="18" cy="16" r="3" stroke="var(--color-text-muted)" strokeWidth="1.5"/>
                </svg>
              }
              title="No playlists yet"
              subtitle="Create your first custom playlist or import your library from Spotify."
              action={
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginTop: 14 }}>
                  <button
                    id="empty-create-playlist-btn"
                    onClick={() => setShowCreatePlaylist(true)}
                    className="btn btn-primary"
                    style={{ padding: '8px 18px', borderRadius: 'var(--radius-full)', fontSize: 'var(--text-xs)', fontWeight: 700 }}
                  >
                    + Create Playlist
                  </button>
                  <button
                    id="empty-spotify-import-btn"
                    onClick={() => setShowSpotifyImport(true)}
                    style={{
                      background: 'rgba(29, 185, 84, 0.15)',
                      color: '#1DB954',
                      border: '1px solid rgba(29, 185, 84, 0.3)',
                      padding: '8px 18px',
                      borderRadius: 'var(--radius-full)',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      cursor: 'pointer',
                    }}
                  >
                    <SpotifyIcon size={14} />
                    Import Spotify
                  </button>
                </div>
              }
            />
          ) : (
            <div>
              {/* Spotify-style Offline Backup Mix */}
              {state.recentlyPlayed.length > 0 && (
                <div
                  id="playlist-item-offline-backup"
                  onClick={() => navigate('playlist', { playlistId: 'offline_backup_mix' })}
                  role="button" tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && navigate('playlist', { playlistId: 'offline_backup_mix' })}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '12px 0', cursor: 'pointer',
                    borderBottom: '1px solid var(--color-border)',
                  }}
                  aria-label="Open Offline Backup Mix"
                >
                  <div style={{
                    width: 56, height: 56, borderRadius: 'var(--radius-md)',
                    background: 'linear-gradient(135deg, var(--color-accent) 0%, #D97706 100%)',
                    border: '1px solid var(--color-border)',
                    overflow: 'hidden', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#000',
                  }}>
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 3v12m0 0l-4-4m4 4l4-4" />
                      <path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" />
                    </svg>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--color-text-primary)' }}>
                      Offline Backup
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <span style={{
                        color: 'var(--color-accent)',
                        fontSize: '10px',
                        fontWeight: 700,
                        background: 'rgba(245, 158, 11, 0.15)',
                        padding: '1px 6px',
                        borderRadius: '4px',
                      }}>
                        OFFLINE READY
                      </span>
                      <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                        {state.recentlyPlayed.length} songs cached
                      </p>
                    </div>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <polyline points="9 18 15 12 9 6" stroke="var(--color-text-muted)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              )}

              {/* Sorted User Playlists with Touch & Hold (Long-Press) Support */}
              {sortedPlaylists.map(playlist => (
                <div
                  key={playlist.id}
                  id={`playlist-item-${playlist.id}`}
                  onMouseDown={() => handleTouchStart(playlist)}
                  onMouseUp={handleTouchEnd}
                  onMouseLeave={handleTouchEnd}
                  onTouchStart={() => handleTouchStart(playlist)}
                  onTouchEnd={handleTouchEnd}
                  onTouchMove={handleTouchEnd}
                  onClick={() => handlePlaylistClick(playlist)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setActiveActionPlaylist(playlist);
                  }}
                  role="button" tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && navigate('playlist', { playlistId: playlist.id })}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '12px 0', cursor: 'pointer',
                    borderBottom: '1px solid var(--color-border)',
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                  }}
                  aria-label={`Open playlist ${playlist.title}`}
                >
                  {/* Artwork or placeholder */}
                  <div style={{
                    width: 56, height: 56, borderRadius: 'var(--radius-md)',
                    background: 'var(--color-surface-2)',
                    border: '1px solid var(--color-border)',
                    overflow: 'hidden', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {playlist.artwork
                      ? <img src={playlist.artwork} alt="" width={56} height={56} style={{ objectFit: 'cover' }} loading="lazy" />
                      : <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 18V5l12-2v13" stroke="var(--color-text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><circle cx="6" cy="18" r="3" stroke="var(--color-text-muted)" strokeWidth="1.5"/><circle cx="18" cy="16" r="3" stroke="var(--color-text-muted)" strokeWidth="1.5"/></svg>
                    }
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: 'var(--text-md)', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {playlist.title}
                      </p>
                      {playlist.isPinned && (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          color: 'var(--color-accent)',
                          fontSize: '10px',
                          fontWeight: 700,
                          background: 'rgba(245, 158, 11, 0.15)',
                          padding: '1px 5px',
                          borderRadius: '4px',
                          flexShrink: 0,
                        }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                            <line x1="12" y1="17" x2="12" y2="22" stroke="currentColor" strokeWidth="2" />
                            <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
                          </svg>
                          PINNED
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      {playlist.creator === 'Spotify Import' && (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          color: '#1DB954',
                          fontSize: '10px',
                          fontWeight: 600,
                        }}>
                          <SpotifyIcon size={10} /> Spotify
                        </span>
                      )}
                      <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                        {playlist.tracks.length} {playlist.tracks.length === 1 ? 'song' : 'songs'}
                      </p>
                    </div>
                  </div>

                  {/* 3-dots More button as alternative touch trigger */}
                  <button
                    type="button"
                    aria-label={`Options for ${playlist.title}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveActionPlaylist(playlist);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-text-muted)',
                      padding: '8px 4px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="5" r="1.5"/>
                      <circle cx="12" cy="12" r="1.5"/>
                      <circle cx="12" cy="19" r="1.5"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )
        )}

        {/* Liked Songs tab */}
        {activeTab === 'songs' && (() => {
          const visibleFavorites = filterSpotifyAvailableTracksSync(state.favorites);
          return visibleFavorites.length === 0 ? (
            <EmptyState
              icon={<svg width="48" height="48" viewBox="0 0 24 24" fill="none"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" stroke="var(--color-text-muted)" strokeWidth="1.5"/></svg>}
              title="No liked songs yet"
              subtitle="Tap the heart on any song to add it here."
            />
          ) : (
            <div style={{ paddingTop: 8 }}>
              {visibleFavorites.map((song, i) => (
                <SongCard key={song.id} song={song} queue={visibleFavorites} index={i} />
              ))}
            </div>
          );
        })()}

        {/* Artists tab */}
        {activeTab === 'artists' && (
          state.favoriteArtists.length === 0 ? (
            <EmptyState
              icon={<svg width="48" height="48" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="var(--color-text-muted)" strokeWidth="1.5"/><path d="M4 20c0-4 3.582-7 8-7s8 3 8 7" stroke="var(--color-text-muted)" strokeWidth="1.5" strokeLinecap="round"/></svg>}
              title="No followed artists"
              subtitle="Follow artists to see them here."
            />
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, paddingTop: 16, justifyContent: 'center' }}>
              {state.favoriteArtists.map(artist => (
                <ArtistCard key={artist.id} artist={artist} size={80} />
              ))}
            </div>
          )
        )}

        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}
