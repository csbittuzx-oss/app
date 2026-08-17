import { useState } from 'react';
import { useApp } from '../../state/AppContext';
import { importSpotifyPlaylist } from '../../data/api/spotifyApi';

interface SpotifyImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SAMPLE_PLAYLISTS = [
  { name: "Today's Top Hits", id: '37i9dQZF1DXcBWIGoYBM5M' },
  { name: 'Chill Hits', id: '37i9dQZF1DX4WYpdgoIcn6' },
  { name: 'RapCaviar', id: '37i9dQZF1DX0XUsuxWHRQd' },
  { name: 'Viva Latino', id: '37i9dQZF1DX10zKzsJ2jva' },
];

export function SpotifyImportModal({ isOpen, onClose }: SpotifyImportModalProps) {
  const { dispatch, nav: { navigate } } = useApp();
  const [urlInput, setUrlInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleImport = async (targetUrl?: string) => {
    const link = targetUrl || urlInput;
    if (!link.trim()) {
      setErrorMessage('Please enter a Spotify or YouTube playlist link.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const trimmed = link.trim();
      // Check if YouTube playlist link
      if (trimmed.includes('youtube.com') || trimmed.includes('youtu.be') || trimmed.includes('list=')) {
        const { importYouTubePlaylist } = await import('../../data/api/youtubeMusicApi');
        const ytPlaylist = await importYouTubePlaylist(trimmed);
        if (ytPlaylist && ytPlaylist.tracks.length > 0) {
          const newPlaylist = {
            id: `yt_pl_${Date.now()}`,
            title: ytPlaylist.title,
            artwork: ytPlaylist.artwork,
            creator: 'YouTube Import',
            tracks: ytPlaylist.tracks,
            isUserCreated: true,
            totalDuration: ytPlaylist.tracks.reduce((s, t) => s + t.duration, 0),
          };
          dispatch({ type: 'IMPORT_PLAYLIST', payload: newPlaylist });
          setUrlInput('');
          onClose();
          navigate('playlist', { playlistId: newPlaylist.id });
          return;
        } else {
          throw new Error('Could not load YouTube playlist. Make sure the playlist is public.');
        }
      }

      // Default to Spotify import
      const imported = await importSpotifyPlaylist(trimmed);
      dispatch({ type: 'IMPORT_PLAYLIST', payload: imported });
      setUrlInput('');
      onClose();
      // Directly navigate to the newly imported playlist
      navigate('playlist', { playlistId: imported.id });
    } catch (err: any) {
      console.error('Playlist import failed:', err);
      setErrorMessage(err?.message || 'Failed to import playlist. Make sure the playlist is public.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePaste = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) setUrlInput(text);
      }
    } catch {
      // clipboard permission denied or not supported
    }
  };

  return (
    <div
      id="spotify-import-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Import Spotify Playlist"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 350,
        background: 'var(--color-scrim)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !isLoading) onClose(); }}
    >
      <div
        style={{
          background: 'var(--color-surface)',
          width: '100%',
          maxWidth: 480,
          borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0',
          padding: '24px 20px',
          paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
          animation: 'slideUp 300ms var(--ease-decelerate)',
          borderTop: '1px solid var(--color-border)',
        }}
      >
        {/* Header with Spotify Brand Icon */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: 'rgba(29, 185, 84, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#1DB954',
            flexShrink: 0,
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.625.625 0 01-.86.205c-2.355-1.439-5.32-1.765-8.813-.967a.625.625 0 11-.28-1.22c3.824-.875 7.106-.508 9.748 1.106.29.177.382.56.205.876zm1.226-2.723a.782.782 0 01-1.077.257c-2.697-1.658-6.808-2.137-9.997-1.17a.781.781 0 01-.452-1.498c3.64-1.105 8.19-.57 11.27 1.326.37.228.486.713.256 1.085zm.105-2.835C14.692 8.946 9.38 8.769 6.302 9.704a.938.938 0 01-.55-1.794c3.528-1.07 9.4-0.865 13.12 1.345a.938.938 0 01-1.127 1.498z"/>
            </svg>
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
              Import Spotify Playlist
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              Paste any public Spotify link to import all tracks
            </p>
          </div>
        </div>

        {/* Input box */}
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <input
            id="spotify-url-input"
            type="text"
            placeholder="https://open.spotify.com/playlist/..."
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            disabled={isLoading}
            onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleImport()}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              background: 'var(--color-surface-2)',
              border: '1.5px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 64px 12px 14px',
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-primary)',
              fontFamily: 'var(--font-body)',
              outline: 'none',
            }}
          />
          <button
            type="button"
            onClick={handlePaste}
            disabled={isLoading}
            style={{
              position: 'absolute',
              right: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--color-text-secondary)',
              fontSize: 'var(--text-xs)',
              padding: '4px 8px',
              cursor: 'pointer',
            }}
          >
            Paste
          </button>
        </div>

        {/* Error message */}
        {errorMessage && (
          <p style={{
            margin: '0 0 12px',
            fontSize: 'var(--text-xs)',
            color: 'var(--color-error)',
            background: 'rgba(239, 68, 68, 0.1)',
            padding: '8px 12px',
            borderRadius: 'var(--radius-sm)',
          }}>
            {errorMessage}
          </p>
        )}

        {/* Quick sample chips */}
        <div style={{ marginBottom: 16 }}>
          <p style={{ margin: '0 0 8px', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontWeight: 500 }}>
            Or try these popular playlists:
          </p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {SAMPLE_PLAYLISTS.map((sp) => (
              <button
                key={sp.id}
                type="button"
                disabled={isLoading}
                onClick={() => {
                  setUrlInput(`https://open.spotify.com/playlist/${sp.id}`);
                  handleImport(`https://open.spotify.com/playlist/${sp.id}`);
                }}
                style={{
                  background: 'var(--color-surface-2)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-full)',
                  color: 'var(--color-text-secondary)',
                  fontSize: 'var(--text-xs)',
                  padding: '5px 12px',
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                }}
              >
                {sp.name}
              </button>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="btn btn-ghost"
            style={{ flex: 1, padding: '12px', borderRadius: 'var(--radius-md)' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => handleImport()}
            disabled={isLoading || !urlInput.trim()}
            style={{
              flex: 1.5,
              padding: '12px',
              borderRadius: 'var(--radius-md)',
              background: '#1DB954',
              color: '#000000',
              fontWeight: 700,
              border: 'none',
              cursor: isLoading || !urlInput.trim() ? 'not-allowed' : 'pointer',
              opacity: isLoading || !urlInput.trim() ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              fontSize: 'var(--text-sm)',
            }}
          >
            {isLoading ? (
              <>
                <span className="spinner" style={{ width: 16, height: 16, borderTopColor: '#000' }} />
                Importing...
              </>
            ) : (
              'Import Tracks'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
