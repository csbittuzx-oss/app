import { useState, useEffect } from 'react';
import type { Playlist } from '../../data/models';
import { usePlayer } from '../../state/PlayerContext';
import { tvFocusManager } from '../focus/TVFocusManager';
import { TVNavRail, type TVScreenType } from './TVNavRail';
import { TVMiniPlayer } from './TVMiniPlayer';
import { TVHomeScreen } from '../screens/TVHomeScreen';
import { TVSearchScreen } from '../screens/TVSearchScreen';
import { TVLibraryScreen } from '../screens/TVLibraryScreen';
import { TVPlayerScreen } from '../screens/TVPlayerScreen';
import { TVSettingsScreen } from '../screens/TVSettingsScreen';
import { TVSpotifyImportScreen } from '../screens/TVSpotifyImportScreen';
import '../focus/tvStyles.css';

export function TVAppShell() {
  const { state: playerState, playSong } = usePlayer();
  const [activeScreen, setActiveScreen] = useState<TVScreenType>('home');
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [isSpotifyImportOpen, setIsSpotifyImportOpen] = useState(false);

  // Initialize TV D-pad Remote Focus Engine
  useEffect(() => {
    const cleanup = tvFocusManager.init();
    return cleanup;
  }, []);

  const handleSelectScreen = (screen: TVScreenType) => {
    setSelectedPlaylist(null);
    setIsSpotifyImportOpen(false);
    setActiveScreen(screen);
  };

  const handleOpenPlaylist = (playlist: Playlist) => {
    setIsSpotifyImportOpen(false);
    setSelectedPlaylist(playlist);
  };

  return (
    <div className="tv-app-container">
      {/* ── Left Navigation Rail ── */}
      <TVNavRail
        activeScreen={activeScreen}
        onSelectScreen={handleSelectScreen}
        hasActiveSong={!!playerState.currentSong}
        onOpenPlayer={() => setActiveScreen('player')}
      />

      {/* ── Main Screen Viewport with strict responsive constraints ── */}
      <main
        style={{
          flex: 1,
          minWidth: 0,
          width: '100%',
          height: '100%',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
        }}
      >
        {isSpotifyImportOpen ? (
          <TVSpotifyImportScreen
            onClose={() => setIsSpotifyImportOpen(false)}
            onOpenPlaylist={handleOpenPlaylist}
          />
        ) : selectedPlaylist ? (
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button
                id="tv-btn-playlist-back"
                data-tv-focus="true"
                data-tv-section="playlist-detail"
                tabIndex={0}
                onClick={() => setSelectedPlaylist(null)}
                className="tv-focusable"
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: 'none',
                  color: '#FFFFFF',
                  borderRadius: '50%',
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  fontSize: '14px',
                }}
              >
                ←
              </button>
              <h1
                style={{
                  fontSize: '16px',
                  fontWeight: 700,
                  color: '#FFFFFF',
                  margin: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {selectedPlaylist.title}
              </h1>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(clamp(110px, 11vw, 136px), 1fr))',
                gap: '12px',
                width: '100%',
                boxSizing: 'border-box',
              }}
              data-tv-section="playlist-tracks"
            >
              {(selectedPlaylist.tracks || []).map((track, idx) => (
                <div
                  key={`pl-track-${track.id}-${idx}`}
                  id={`tv-pl-track-${idx}`}
                  data-tv-focus="true"
                  data-tv-section="playlist-tracks"
                  tabIndex={0}
                  onClick={() => playSong(track, selectedPlaylist.tracks, idx)}
                  className="tv-song-card tv-focusable"
                  style={{ width: '100%' }}
                >
                  <img
                    src={track.artworkLg || track.artwork || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300'}
                    alt={track.title}
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
                    {track.title}
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
                    {track.artist}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            {activeScreen === 'home' && (
              <TVHomeScreen
                onOpenPlaylist={handleOpenPlaylist}
                onOpenFullPlayer={() => setActiveScreen('player')}
              />
            )}

            {activeScreen === 'search' && <TVSearchScreen />}

            {activeScreen === 'library' && (
              <TVLibraryScreen
                onOpenPlaylist={handleOpenPlaylist}
                onOpenSpotifyImport={() => setIsSpotifyImportOpen(true)}
              />
            )}

            {activeScreen === 'offline' && (
              <TVLibraryScreen
                onOpenPlaylist={handleOpenPlaylist}
                onOpenSpotifyImport={() => setIsSpotifyImportOpen(true)}
              />
            )}

            {activeScreen === 'settings' && <TVSettingsScreen />}

            {activeScreen === 'player' && (
              <TVPlayerScreen onClose={() => setActiveScreen('home')} />
            )}
          </>
        )}
      </main>

      {/* ── Floating TV Mini Player when browsing outside player & import screen ── */}
      {activeScreen !== 'player' && !isSpotifyImportOpen && (
        <TVMiniPlayer onOpenFullPlayer={() => setActiveScreen('player')} />
      )}
    </div>
  );
}
