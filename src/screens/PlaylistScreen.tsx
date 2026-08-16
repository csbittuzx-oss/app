import { useState, useEffect } from 'react';
import { useApp } from '../state/AppContext';
import { usePlayer } from '../state/PlayerContext';
import { SongCard } from '../components/cards/SongCard';
import { EmptyState } from '../components/shared/ErrorState';
import { formatDuration } from '../core/utils';
import { CONFIG } from '../config';
import { getOfflineBackupPlaylist } from '../services/OfflineBackupService';
import { enrichSpotifyTracksArtwork } from '../data/api/spotifyApi';
import type { Playlist } from '../data/models';

export function PlaylistScreen() {
  const { nav: { nav, goBack }, state, updatePlaylistTracks } = useApp();
  const { playSong } = usePlayer();

  const playlistId = String(nav.params?.playlistId || '');
  const [offlinePlaylist, setOfflinePlaylist] = useState<Playlist | null>(null);

  useEffect(() => {
    if (playlistId === 'offline_backup_mix') {
      getOfflineBackupPlaylist().then(pl => setOfflinePlaylist(pl));
    }
  }, [playlistId]);

  const playlist = state.userPlaylists.find(p => p.id === playlistId) || (playlistId === 'offline_backup_mix' ? offlinePlaylist : null);

  // Automatically enrich songs with their distinct album artworks if they were sharing playlist cover
  useEffect(() => {
    if (!playlist || playlist.creator !== 'Spotify Import' || !playlist.tracks.length) return;

    const hasDuplicateArtwork = playlist.tracks.filter(t => t.artwork === playlist.artwork).length > 1
      || playlist.tracks.some(t => !t.artwork);

    if (hasDuplicateArtwork) {
      enrichSpotifyTracksArtwork(playlist.tracks, playlist.artwork).then((enrichedTracks) => {
        updatePlaylistTracks(playlist.id, enrichedTracks);
      });
    }
  }, [playlistId, playlist?.id, playlist?.creator]);

  if (!playlist) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <EmptyState title="Playlist not found" subtitle="This playlist may have been deleted or has no cached tracks yet." />
      </div>
    );
  }

  const totalDuration = playlist.tracks.reduce((sum, s) => sum + s.duration, 0);
  const artworkSrc = playlist.artwork || (playlist.tracks[0]?.artwork) || CONFIG.ARTWORK_PLACEHOLDER;

  const handlePlay = () => {
    if (playlist.tracks.length) playSong(playlist.tracks[0], playlist.tracks, 0);
  };

  const handleShuffle = () => {
    if (!playlist.tracks.length) return;
    const idx = Math.floor(Math.random() * playlist.tracks.length);
    playSong(playlist.tracks[idx], playlist.tracks, idx);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Back */}
      <div style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top,0px) + 8px)', left: 8, zIndex: 10 }}>
        <button id="playlist-back-btn" aria-label="Go back" onClick={goBack} style={{
          width: 40, height: 40, borderRadius: '50%',
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)',
          border: '1px solid var(--color-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: '#fff',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      <div className="scroll-area" style={{ flex: 1, paddingBottom: 'var(--content-bottom-pad)' }}>
        {/* Header */}
        <div style={{ padding: '60px 20px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 180, height: 180, borderRadius: 'var(--radius-xl)',
            overflow: 'hidden', flexShrink: 0,
            boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface-2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {playlist.tracks.length > 0 && artworkSrc ? (
              <img src={artworkSrc} alt="Playlist artwork" width={180} height={180}
                loading="eager"
                onError={(e) => { (e.target as HTMLImageElement).src = CONFIG.ARTWORK_PLACEHOLDER; }}
                style={{ objectFit: 'cover' }}
              />
            ) : (
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M9 18V5l12-2v13" stroke="var(--color-text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="6" cy="18" r="3" stroke="var(--color-text-muted)" strokeWidth="1.5"/>
                <circle cx="18" cy="16" r="3" stroke="var(--color-text-muted)" strokeWidth="1.5"/>
              </svg>
            )}
          </div>

          <div style={{ textAlign: 'center', width: '100%' }}>
            <h1 style={{ margin: 0, fontSize: 'var(--text-2xl)', fontWeight: 800, color: 'var(--color-text-primary)' }}>
              {playlist.title}
            </h1>
            {playlist.description && (
              <p style={{ margin: '4px 0 0', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                {playlist.description}
              </p>
            )}
            <p style={{ margin: '6px 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              {playlist.creator} · {playlist.tracks.length} songs · {formatDuration(totalDuration)}
            </p>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 12, width: '100%', maxWidth: 280 }}>
            <button
              id="play-playlist-btn"
              onClick={handlePlay}
              disabled={playlist.tracks.length === 0}
              className="btn btn-primary"
              style={{ flex: 1, padding: '12px 20px', borderRadius: 'var(--radius-full)', opacity: playlist.tracks.length ? 1 : 0.5 }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              Play
            </button>
            <button
              id="shuffle-playlist-btn"
              onClick={handleShuffle}
              disabled={playlist.tracks.length === 0}
              className="btn btn-ghost"
              style={{ flex: 1, padding: '12px 20px', borderRadius: 'var(--radius-full)', opacity: playlist.tracks.length ? 1 : 0.5 }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>
              Shuffle
            </button>
          </div>
        </div>

        {/* Tracks list */}
        <div style={{ padding: '0 20px' }}>
          {playlist.tracks.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', margin: '32px 0' }}>
              No songs in this playlist yet.
            </p>
          ) : (
            playlist.tracks.map((song, idx) => (
              <SongCard
                key={song.id}
                song={song}
                queue={playlist.tracks}
                index={idx}
                playlistId={playlist.id}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
