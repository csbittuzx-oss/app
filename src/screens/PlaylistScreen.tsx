import { useState, useEffect } from 'react';
import { useApp } from '../state/AppContext';
import { usePlayer } from '../state/PlayerContext';
import { SongCard } from '../components/cards/SongCard';
import { EmptyState } from '../components/shared/ErrorState';
import { formatPlaylistDuration } from '../core/utils';
import { filterSpotifyAvailableTracksSync } from '../services/SpotifyAvailabilityService';
import { deduplicateSongs } from '../data/repository/musicRepository';
import { CONFIG } from '../config';
import { getOfflineBackupPlaylist } from '../services/OfflineBackupService';
import { getCuratedPlaylistById } from '../services/CuratedPlaylistsService';
import { enrichSpotifyTracksArtwork } from '../data/api/spotifyApi';
import type { Playlist } from '../data/models';

export function PlaylistScreen() {
  const { nav: { nav, goBack }, state, updatePlaylistTracks } = useApp();
  const { playSong } = usePlayer();

  const playlistId = String(nav.params?.playlistId || '');
  const playlistParam = nav.params?.playlist as Playlist | undefined;
  const [offlinePlaylist, setOfflinePlaylist] = useState<Playlist | null>(null);

  useEffect(() => {
    if (playlistId === 'offline_backup_mix') {
      getOfflineBackupPlaylist().then(pl => setOfflinePlaylist(pl));
    }
  }, [playlistId]);

  const playlist = playlistParam
    || state.userPlaylists.find(p => p.id === playlistId)
    || (playlistId === 'offline_backup_mix' ? offlinePlaylist : null)
    || getCuratedPlaylistById(playlistId);

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

  // Strictly deduplicate tracks so every song appears only once
  const verifiedTracks = deduplicateSongs(filterSpotifyAvailableTracksSync(playlist.tracks));
  const totalDuration = verifiedTracks.reduce((sum, s) => sum + s.duration, 0);
  const artworkSrc = playlist.artwork || (verifiedTracks[0]?.artwork) || CONFIG.ARTWORK_PLACEHOLDER;

  const handlePlay = () => {
    if (verifiedTracks.length) playSong(verifiedTracks[0], verifiedTracks, 0);
  };

  const handleShuffle = () => {
    if (!verifiedTracks.length) return;
    const shuffled = [...verifiedTracks].sort(() => Math.random() - 0.5);
    playSong(shuffled[0], shuffled, 0);
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

      <div className="scroll-area" style={{ flex: 1, paddingBottom: 'calc(var(--content-bottom-pad) + 40px)' }}>
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
            {verifiedTracks.length > 0 && artworkSrc ? (
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
              {playlist.creator} · {verifiedTracks.length} songs · {formatPlaylistDuration(totalDuration)}
            </p>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 12, width: '100%', maxWidth: 280 }}>
            <button
              id="play-playlist-btn"
              onClick={handlePlay}
              disabled={verifiedTracks.length === 0}
              className="btn btn-primary"
              style={{ flex: 1, padding: '12px 20px', borderRadius: 'var(--radius-full)', opacity: verifiedTracks.length ? 1 : 0.5 }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              Play
            </button>
            <button
              id="shuffle-playlist-btn"
              onClick={handleShuffle}
              disabled={verifiedTracks.length === 0}
              className="btn btn-ghost"
              style={{ flex: 1, padding: '12px 20px', borderRadius: 'var(--radius-full)', opacity: verifiedTracks.length ? 1 : 0.5 }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>
              Shuffle
            </button>
          </div>
        </div>

        {/* Songs Header */}
        <div style={{ padding: '8px 20px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)', marginBottom: 8 }}>
          <h2 style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-secondary)' }}>
            Songs
          </h2>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            {verifiedTracks.length} tracks
          </span>
        </div>

        {/* Tracks list */}
        <div style={{ padding: '0 20px' }}>
          {verifiedTracks.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', margin: '32px 0' }}>
              No songs in this playlist yet.
            </p>
          ) : (
            verifiedTracks.map((song, idx) => (
              <SongCard
                key={song.id}
                song={song}
                queue={verifiedTracks}
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
