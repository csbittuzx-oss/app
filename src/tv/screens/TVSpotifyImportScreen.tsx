import { useState, useEffect, useRef, useCallback } from 'react';
import type { Playlist } from '../../data/models';
import { usePlayer } from '../../state/PlayerContext';
import { SpotifyImportNative, type SpotifyImportServerInfo } from '../services/TVSpotifyImportBridge';
import { TVSpotifyImportEngine, type ImportProgress } from '../services/TVSpotifyImportEngine';
import { tvFocusManager } from '../focus/TVFocusManager';

interface TVSpotifyImportScreenProps {
  onClose: () => void;
  onOpenPlaylist: (playlist: Playlist) => void;
}

export function TVSpotifyImportScreen({ onClose, onOpenPlaylist }: TVSpotifyImportScreenProps) {
  const { playSong } = usePlayer();

  const [serverInfo, setServerInfo] = useState<SpotifyImportServerInfo | null>(null);
  const [status, setStatus] = useState<
    'starting' | 'waiting' | 'phone_connected' | 'importing' | 'complete' | 'failed'
  >('starting');
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [importedPlaylist, setImportedPlaylist] = useState<Playlist | null>(null);

  const isMountedRef = useRef(true);

  const stopLocalServer = useCallback(async () => {
    try {
      await SpotifyImportNative.stopServer();
    } catch {}
  }, []);

  const handleCancelAndExit = useCallback(async () => {
    await stopLocalServer();
    onClose();
  }, [stopLocalServer, onClose]);

  // Register remote Back button
  useEffect(() => {
    return tvFocusManager.registerBackHandler(() => {
      handleCancelAndExit();
      return true;
    });
  }, [handleCancelAndExit]);

  // Start local server and listen for events
  useEffect(() => {
    isMountedRef.current = true;
    let playlistSub: any = null;
    let clientSub: any = null;

    async function initServer() {
      try {
        setStatus('starting');
        const info = await SpotifyImportNative.startServer();

        if (!isMountedRef.current) return;

        if (info.success && info.url) {
          setServerInfo(info);
          setStatus('waiting');

          // Listen for phone connection
          clientSub = await SpotifyImportNative.addListener('clientConnected', () => {
            if (isMountedRef.current && status === 'waiting') {
              setStatus('phone_connected');
            }
          });

          // Listen for incoming Spotify playlist from phone
          playlistSub = await SpotifyImportNative.addListener('playlistReceived', async (data) => {
            if (!isMountedRef.current) return;
            const targetUrl = data.playlistUrl || data.playlistId;
            if (!targetUrl) return;

            setStatus('importing');

            try {
              const result = await TVSpotifyImportEngine.executeImport(targetUrl, (prog) => {
                if (isMountedRef.current) {
                  setProgress(prog);
                  if (prog.step === 'complete') {
                    setStatus('complete');
                    setImportedPlaylist(prog.resultPlaylist || null);
                  } else if (prog.step === 'failed') {
                    setStatus('failed');
                    setErrorMessage(prog.error || 'Import failed.');
                  }
                }
              });

              if (isMountedRef.current) {
                setImportedPlaylist(result);
                setStatus('complete');
                // Server can now be safely shut down
                stopLocalServer();
              }
            } catch (err: any) {
              if (isMountedRef.current) {
                setStatus('failed');
                setErrorMessage(err?.message || 'Failed to match tracks or build playlist.');
                stopLocalServer();
              }
            }
          });
        } else {
          setStatus('failed');
          setErrorMessage(info.error || 'Could not detect local Wi-Fi IP address. Ensure TV is connected to Wi-Fi.');
        }
      } catch (err: any) {
        if (isMountedRef.current) {
          setStatus('failed');
          setErrorMessage(err?.message || 'Failed to start local TV import server.');
        }
      }
    }

    initServer();

    return () => {
      isMountedRef.current = false;
      if (playlistSub) playlistSub.remove();
      if (clientSub) clientSub.remove();
      stopLocalServer();
    };
  }, [stopLocalServer]);

  return (
    <div
      style={{
        flex: 1,
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--tv-safe-top) var(--tv-safe-right) var(--tv-safe-bottom) var(--tv-safe-left)',
        background: '#090A0F',
        boxSizing: 'border-box',
        position: 'relative',
      }}
    >
      {/* ── Main Modal Card ── */}
      <div
        style={{
          background: 'rgba(20, 21, 30, 0.95)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '16px',
          padding: '24px 32px',
          maxWidth: '520px',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: '14px',
          boxShadow: '0 16px 48px rgba(0, 0, 0, 0.8)',
          boxSizing: 'border-box',
        }}
      >
        {/* Header with Spotify Brand Icon */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '50%',
              background: '#1DB954',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="#000000">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.58 14.42c-.18.3-.56.4-.86.22-2.36-1.44-5.32-1.76-8.81-.96-.34.08-.68-.14-.76-.48-.08-.34.14-.68.48-.76 3.82-.88 7.1-.5 9.73 1.12.3.18.4.56.22.86zm1.22-2.72c-.22.36-.7.48-1.06.26-2.7-1.66-6.82-2.14-10.02-1.16-.4.12-.84-.1-.96-.5-.12-.4.1-.84.5-.96 3.66-1.12 8.2-.58 11.28 1.3.36.22.48.7.26 1.06zm.12-2.84C14.68 8.84 9.34 8.66 6.26 9.6c-.48.14-.98-.12-1.12-.6-.14-.48.12-.98.6-1.12 3.56-1.08 9.46-.86 13.24 1.38.44.26.58.82.32 1.26-.26.44-.82.58-1.38.34z" />
            </svg>
          </div>
          <h1 style={{ fontSize: '16px', fontWeight: 700, color: '#FFFFFF', margin: 0 }}>
            Import Spotify Playlist
          </h1>
        </div>

        {/* ── State: Starting Server ── */}
        {status === 'starting' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '20px 0' }}>
            <span style={{ fontSize: '13px', color: '#A1A1AA' }}>Starting local connection...</span>
          </div>
        )}

        {/* ── State: Waiting for Phone (Show QR) ── */}
        {(status === 'waiting' || status === 'phone_connected') && serverInfo?.url && (
          <>
            <p style={{ fontSize: '12px', color: '#A1A1AA', margin: 0, maxWidth: '400px', lineHeight: 1.4 }}>
              Scan this QR code using a phone connected to the same Wi-Fi, then paste your Spotify playlist link.
            </p>

            {/* QR Code Container */}
            <div
              style={{
                background: '#FFFFFF',
                padding: '10px',
                borderRadius: '12px',
                boxShadow: '0 6px 20px rgba(0, 0, 0, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(serverInfo.url)}&margin=4`}
                alt="Scan to import Spotify playlist"
                style={{ width: '150px', height: '150px', display: 'block', borderRadius: '4px' }}
              />
            </div>

            {/* Direct URL & Connection Status */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  justifyContent: 'center',
                  fontSize: '11px',
                  color: status === 'phone_connected' ? '#10B981' : '#818CF8',
                  fontWeight: 600,
                }}
              >
                <div
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: status === 'phone_connected' ? '#10B981' : '#818CF8',
                  }}
                />
                <span>
                  {status === 'phone_connected' ? 'Phone Connected • Waiting for playlist...' : 'Waiting for phone connection...'}
                </span>
              </div>
              <span style={{ fontSize: '11px', color: '#71717A' }}>
                Or visit on phone browser: <code style={{ color: '#E2E8F0' }}>{serverInfo.url.replace('/import?t=' + serverInfo.token, '')}</code>
              </span>
            </div>
          </>
        )}

        {/* ── State: Importing & Matching Progress ── */}
        {status === 'importing' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '16px 0', width: '100%' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>
              {progress?.step === 'fetching_spotify'
                ? 'Fetching Spotify playlist metadata...'
                : progress?.step === 'matching_songs'
                ? `Matching songs with catalog: ${progress.currentTrackIndex} / ${progress.totalTracks}`
                : 'Creating playlist in library...'}
            </span>

            {/* Progress Bar */}
            {progress && progress.totalTracks > 0 && (
              <div
                style={{
                  width: '100%',
                  maxWidth: '360px',
                  height: '6px',
                  borderRadius: '3px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${Math.round((progress.currentTrackIndex / progress.totalTracks) * 100)}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #1DB954, #6366F1)',
                    transition: 'width 0.2s linear',
                  }}
                />
              </div>
            )}

            {progress?.currentTrackTitle && (
              <span style={{ fontSize: '11px', color: '#A1A1AA', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '380px' }}>
                Currently matching: <em>{progress.currentTrackTitle}</em>
              </span>
            )}
          </div>
        )}

        {/* ── State: Complete ── */}
        {status === 'complete' && importedPlaylist && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', padding: '10px 0', width: '100%' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#10B981',
              }}
            >
              ✓
            </div>

            <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#FFFFFF', margin: 0 }}>
              Playlist Imported Successfully!
            </h2>

            <span style={{ fontSize: '12px', color: '#A1A1AA' }}>
              <strong>{importedPlaylist.title}</strong> • {importedPlaylist.tracks?.length || 0} songs matched
              {progress && progress.unmatchedTracks.length > 0 && ` (${progress.unmatchedTracks.length} tracks unavailable)`}
            </span>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }} data-tv-section="import-actions">
              <button
                id="tv-btn-import-play"
                data-tv-focus="true"
                data-tv-section="import-actions"
                tabIndex={0}
                onClick={() => {
                  if (importedPlaylist.tracks && importedPlaylist.tracks.length > 0) {
                    playSong(importedPlaylist.tracks[0], importedPlaylist.tracks, 0);
                  }
                  onClose();
                }}
                className="tv-focusable"
                style={{
                  background: 'var(--tv-accent)',
                  border: 'none',
                  color: '#FFFFFF',
                  padding: '7px 18px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                Play Now
              </button>

              <button
                id="tv-btn-import-view"
                data-tv-focus="true"
                data-tv-section="import-actions"
                tabIndex={0}
                onClick={() => {
                  onOpenPlaylist(importedPlaylist);
                  onClose();
                }}
                className="tv-focusable"
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#FFFFFF',
                  padding: '7px 18px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                View Playlist
              </button>

              <button
                id="tv-btn-import-done"
                data-tv-focus="true"
                data-tv-section="import-actions"
                tabIndex={0}
                onClick={onClose}
                className="tv-focusable"
                style={{
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: 'none',
                  color: '#A1A1AA',
                  padding: '7px 14px',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* ── State: Failed ── */}
        {status === 'failed' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', padding: '10px 0' }}>
            <span style={{ fontSize: '13px', color: '#EF4444', fontWeight: 600 }}>
              {errorMessage || 'Import failed.'}
            </span>
            <span style={{ fontSize: '11px', color: '#71717A' }}>
              Ensure your TV is connected to Wi-Fi and the Spotify link is public.
            </span>
          </div>
        )}

        {/* ── Cancel Button ── */}
        {status !== 'complete' && (
          <button
            id="tv-btn-import-cancel"
            data-tv-focus="true"
            data-tv-section="import-footer"
            tabIndex={0}
            onClick={handleCancelAndExit}
            className="tv-focusable"
            style={{
              background: 'transparent',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#A1A1AA',
              padding: '6px 16px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 500,
              marginTop: '4px',
            }}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
