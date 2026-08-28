import { useState, useEffect } from 'react';
import type { Song, Playlist } from '../../data/models';
import { usePlayer } from '../../state/PlayerContext';
import { getOfflineBackupPlaylist } from '../../services/OfflineBackupService';

interface TVLibraryScreenProps {
  onOpenPlaylist: (playlist: Playlist) => void;
  onOpenSpotifyImport: () => void;
}

export function TVLibraryScreen({ onOpenPlaylist, onOpenSpotifyImport }: TVLibraryScreenProps) {
  const { playSong } = usePlayer();
  const [activeTab, setActiveTab] = useState<'liked' | 'playlists' | 'offline'>('liked');
  const [favorites, setFavorites] = useState<Song[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [offlineSongs, setOfflineSongs] = useState<Song[]>([]);

  const loadLocalData = () => {
    try {
      const rawFavs = localStorage.getItem('sw_favorites');
      if (rawFavs) setFavorites(JSON.parse(rawFavs));

      const rawPlaylists = localStorage.getItem('sw_playlists');
      if (rawPlaylists) setPlaylists(JSON.parse(rawPlaylists));
    } catch {}
  };

  useEffect(() => {
    loadLocalData();

    const handleUpdate = () => loadLocalData();
    window.addEventListener('sw_playlists_updated', handleUpdate);

    getOfflineBackupPlaylist()
      .then((pl) => {
        if (pl && Array.isArray(pl.tracks)) {
          setOfflineSongs(pl.tracks);
        }
      })
      .catch(() => {});

    return () => {
      window.removeEventListener('sw_playlists_updated', handleUpdate);
    };
  }, []);

  return (
    <div
      style={{
        flex: 1,
        width: '100%',
        height: '100%',
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: 'var(--tv-safe-top) var(--tv-safe-right) 60px var(--tv-safe-left)',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <h1
          style={{
            fontSize: '16px',
            fontWeight: 700,
            color: '#FFFFFF',
            margin: 0,
          }}
        >
          Your Library
        </h1>

        {/* ── Compact Spotify Import Button ── */}
        <button
          id="tv-btn-open-spotify-import"
          data-tv-focus="true"
          data-tv-section="library-header-actions"
          tabIndex={0}
          onClick={onOpenSpotifyImport}
          className="tv-focusable"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(29, 185, 84, 0.12)',
            border: '1px solid rgba(29, 185, 84, 0.35)',
            borderRadius: '8px',
            padding: '5px 12px',
            color: '#1DB954',
            fontSize: '11px',
            fontWeight: 600,
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.58 14.42c-.18.3-.56.4-.86.22-2.36-1.44-5.32-1.76-8.81-.96-.34.08-.68-.14-.76-.48-.08-.34.14-.68.48-.76 3.82-.88 7.1-.5 9.73 1.12.3.18.4.56.22.86zm1.22-2.72c-.22.36-.7.48-1.06.26-2.7-1.66-6.82-2.14-10.02-1.16-.4.12-.84-.1-.96-.5-.12-.4.1-.84.5-.96 3.66-1.12 8.2-.58 11.28 1.3.36.22.48.7.26 1.06zm.12-2.84C14.68 8.84 9.34 8.66 6.26 9.6c-.48.14-.98-.12-1.12-.6-.14-.48.12-.98.6-1.12 3.56-1.08 9.46-.86 13.24 1.38.44.26.58.82.32 1.26-.26.44-.82.58-1.38.34z" />
          </svg>
          <span>Import Spotify Playlist</span>
        </button>
      </div>

      {/* ── Compact Tabs Header ── */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }} data-tv-section="library-tabs">
        <button
          id="tv-lib-tab-liked"
          data-tv-focus="true"
          data-tv-section="library-tabs"
          tabIndex={0}
          onClick={() => setActiveTab('liked')}
          className={`tv-focusable ${activeTab === 'liked' ? 'tv-focused' : ''}`}
          style={{
            background: activeTab === 'liked' ? 'var(--tv-accent)' : 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            color: '#FFFFFF',
            padding: '5px 14px',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: 600,
          }}
        >
          Liked Songs ({favorites.length})
        </button>

        <button
          id="tv-lib-tab-playlists"
          data-tv-focus="true"
          data-tv-section="library-tabs"
          tabIndex={0}
          onClick={() => setActiveTab('playlists')}
          className={`tv-focusable ${activeTab === 'playlists' ? 'tv-focused' : ''}`}
          style={{
            background: activeTab === 'playlists' ? 'var(--tv-accent)' : 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            color: '#FFFFFF',
            padding: '5px 14px',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: 600,
          }}
        >
          Playlists ({playlists.length})
        </button>

        <button
          id="tv-lib-tab-offline"
          data-tv-focus="true"
          data-tv-section="library-tabs"
          tabIndex={0}
          onClick={() => setActiveTab('offline')}
          className={`tv-focusable ${activeTab === 'offline' ? 'tv-focused' : ''}`}
          style={{
            background: activeTab === 'offline' ? 'var(--tv-accent)' : 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            color: '#FFFFFF',
            padding: '5px 14px',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: 600,
          }}
        >
          Offline Backup ({offlineSongs.length})
        </button>
      </div>

      {/* ── Content Grid ── */}
      {activeTab === 'liked' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(clamp(110px, 11vw, 136px), 1fr))',
            gap: '12px',
            width: '100%',
            boxSizing: 'border-box',
          }}
          data-tv-section="library-liked"
        >
          {favorites.map((song, idx) => (
            <div
              key={`fav-${song.id}-${idx}`}
              id={`tv-fav-${idx}`}
              data-tv-focus="true"
              data-tv-section="library-liked"
              tabIndex={0}
              onClick={() => playSong(song, favorites)}
              className="tv-song-card tv-focusable"
              style={{ width: '100%' }}
            >
              <img
                src={song.artworkLg || song.artwork || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300'}
                alt={song.title}
                className="tv-song-artwork"
                loading="lazy"
              />
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#F4F4F5',
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
                  color: '#71717A',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {song.artist}
              </span>
            </div>
          ))}
          {favorites.length === 0 && (
            <div style={{ color: '#71717A', padding: '16px 0', fontSize: '13px' }}>
              No liked songs yet.
            </div>
          )}
        </div>
      )}

      {activeTab === 'playlists' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(clamp(110px, 11vw, 136px), 1fr))',
            gap: '12px',
            width: '100%',
            boxSizing: 'border-box',
          }}
          data-tv-section="library-playlists"
        >
          {playlists.map((pl, idx) => (
            <div
              key={`lib-pl-${pl.id}-${idx}`}
              id={`tv-lib-pl-${idx}`}
              data-tv-focus="true"
              data-tv-section="library-playlists"
              tabIndex={0}
              onClick={() => onOpenPlaylist(pl)}
              className="tv-song-card tv-focusable"
              style={{ width: '100%' }}
            >
              <img
                src={pl.artwork || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300'}
                alt={pl.title}
                className="tv-song-artwork"
                loading="lazy"
              />
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#F4F4F5',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {pl.title}
              </span>
              <span style={{ fontSize: '10px', color: '#71717A' }}>
                {pl.tracks ? `${pl.tracks.length} Songs` : 'Playlist'}
              </span>
            </div>
          ))}
          {playlists.length === 0 && (
            <div style={{ color: '#71717A', padding: '16px 0', fontSize: '13px' }}>
              No playlists found. Use <strong>Import Spotify Playlist</strong> above to add one.
            </div>
          )}
        </div>
      )}

      {activeTab === 'offline' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(clamp(110px, 11vw, 136px), 1fr))',
            gap: '12px',
            width: '100%',
            boxSizing: 'border-box',
          }}
          data-tv-section="library-offline"
        >
          {offlineSongs.map((song, idx) => (
            <div
              key={`offline-${song.id}-${idx}`}
              id={`tv-offline-${idx}`}
              data-tv-focus="true"
              data-tv-section="library-offline"
              tabIndex={0}
              onClick={() => playSong(song, offlineSongs)}
              className="tv-song-card tv-focusable"
              style={{ width: '100%' }}
            >
              <img
                src={song.artworkLg || song.artwork || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300'}
                alt={song.title}
                className="tv-song-artwork"
                loading="lazy"
              />
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#F4F4F5',
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
                  color: '#10B981',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                ✓ Available Offline
              </span>
            </div>
          ))}
          {offlineSongs.length === 0 && (
            <div style={{ color: '#71717A', padding: '16px 0', fontSize: '13px' }}>
              No offline cached songs available.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
