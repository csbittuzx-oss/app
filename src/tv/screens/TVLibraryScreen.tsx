import { useState, useEffect } from 'react';
import type { Song, Playlist } from '../../data/models';
import { usePlayer } from '../../state/PlayerContext';
import { getOfflineBackupPlaylist } from '../../services/OfflineBackupService';

interface TVLibraryScreenProps {
  onOpenPlaylist: (playlist: Playlist) => void;
}

export function TVLibraryScreen({ onOpenPlaylist }: TVLibraryScreenProps) {
  const { playSong } = usePlayer();
  const [activeTab, setActiveTab] = useState<'liked' | 'playlists' | 'offline'>('liked');
  const [favorites, setFavorites] = useState<Song[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [offlineSongs, setOfflineSongs] = useState<Song[]>([]);

  useEffect(() => {
    // 1. Load favorites from localStorage
    try {
      const rawFavs = localStorage.getItem('sw_favorites');
      if (rawFavs) setFavorites(JSON.parse(rawFavs));

      const rawPlaylists = localStorage.getItem('sw_playlists');
      if (rawPlaylists) setPlaylists(JSON.parse(rawPlaylists));
    } catch {}

    // 2. Load offline cached songs
    getOfflineBackupPlaylist()
      .then((pl) => {
        if (pl && Array.isArray(pl.tracks)) {
          setOfflineSongs(pl.tracks);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div
      style={{
        flex: 1,
        width: '100%',
        height: '100%',
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: 'var(--tv-safe-top) var(--tv-safe-right) 100px var(--tv-safe-left)',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        boxSizing: 'border-box',
      }}
    >
      <h1
        style={{
          fontSize: 'clamp(20px, 2.2vw, 28px)',
          fontWeight: 800,
          color: '#FFFFFF',
          margin: 0,
        }}
      >
        Your Library
      </h1>

      {/* ── Tabs Header ── */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }} data-tv-section="library-tabs">
        <button
          id="tv-lib-tab-liked"
          data-tv-focus="true"
          data-tv-section="library-tabs"
          tabIndex={0}
          onClick={() => setActiveTab('liked')}
          className={`tv-focusable ${activeTab === 'liked' ? 'tv-focused' : ''}`}
          style={{
            background: activeTab === 'liked' ? 'var(--tv-accent)' : 'rgba(255, 255, 255, 0.08)',
            border: 'none',
            color: '#FFFFFF',
            padding: '8px 18px',
            borderRadius: '10px',
            fontSize: 'clamp(13px, 1.2vw, 15px)',
            fontWeight: 700,
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
            background: activeTab === 'playlists' ? 'var(--tv-accent)' : 'rgba(255, 255, 255, 0.08)',
            border: 'none',
            color: '#FFFFFF',
            padding: '8px 18px',
            borderRadius: '10px',
            fontSize: 'clamp(13px, 1.2vw, 15px)',
            fontWeight: 700,
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
            background: activeTab === 'offline' ? 'var(--tv-accent)' : 'rgba(255, 255, 255, 0.08)',
            border: 'none',
            color: '#FFFFFF',
            padding: '8px 18px',
            borderRadius: '10px',
            fontSize: 'clamp(13px, 1.2vw, 15px)',
            fontWeight: 700,
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
            gridTemplateColumns: 'repeat(auto-fill, minmax(clamp(130px, 14vw, 175px), 1fr))',
            gap: '16px',
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
                  fontSize: '14px',
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
                  fontSize: '12px',
                  color: '#A1A1AA',
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
            <div style={{ color: '#A1A1AA', padding: '24px 0' }}>
              No liked songs yet. Tap Like on any track to add it here.
            </div>
          )}
        </div>
      )}

      {activeTab === 'playlists' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(clamp(150px, 16vw, 200px), 1fr))',
            gap: '16px',
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
                style={{ height: '110px', objectFit: 'cover' }}
              />
              <span
                style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  color: '#FFFFFF',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {pl.title}
              </span>
              <span style={{ fontSize: '12px', color: '#A1A1AA' }}>
                {pl.tracks ? `${pl.tracks.length} Songs` : 'Playlist'}
              </span>
            </div>
          ))}
          {playlists.length === 0 && (
            <div style={{ color: '#A1A1AA', padding: '24px 0' }}>
              No custom playlists created yet.
            </div>
          )}
        </div>
      )}

      {activeTab === 'offline' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(clamp(130px, 14vw, 175px), 1fr))',
            gap: '16px',
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
                  fontSize: '14px',
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
                  fontSize: '12px',
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
            <div style={{ color: '#A1A1AA', padding: '24px 0' }}>
              No offline cached songs available. Listen to music online to automatically cache it.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
