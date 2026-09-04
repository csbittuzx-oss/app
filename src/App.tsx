import './index.css';
import './App.css';
import { PlayerProvider, usePlayer } from './state/PlayerContext';
import { AppProvider, useApp } from './state/AppContext';
import { AndroidShell } from './components/layout/AndroidShell';
import { BottomNav } from './components/layout/BottomNav';
import { MiniPlayer } from './components/player/MiniPlayer';
import { FullPlayer } from './components/player/FullPlayer';
import { QueueScreen } from './screens/QueueScreen';
import { HomeScreen } from './screens/HomeScreen';
import { SearchScreen } from './screens/SearchScreen';
import { LibraryScreen } from './screens/LibraryScreen';
import { DownloadsScreen } from './screens/DownloadsScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { ArtistScreen } from './screens/ArtistScreen';
import { AlbumScreen } from './screens/AlbumScreen';
import { PlaylistScreen } from './screens/PlaylistScreen';

// ─── Screen Router (Parallel Multi-Stack Tab Viewports) ──────────────────────

function ScreenRouter() {
  const { nav: { activeTab, tabStacks } } = useApp();

  const homeStack = tabStacks.home;
  const searchStack = tabStacks.search;
  const libraryStack = tabStacks.library;
  const settingsStack = tabStacks.settings;

  const renderChildScreen = (item: { screen: string; params?: Record<string, unknown> } | undefined) => {
    if (!item) return null;
    switch (item.screen) {
      case 'playlist':
        return <PlaylistScreen params={item.params} />;
      case 'album':
        return <AlbumScreen params={item.params} />;
      case 'artist':
        return <ArtistScreen params={item.params} />;
      case 'downloads':
        return <DownloadsScreen />;
      case 'queue':
        return <QueueScreen />;
      case 'settings':
      case 'profile':
        return <SettingsScreen />;
      default:
        return null;
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', width: '100%', position: 'relative', overflow: 'hidden' }}>
      {/* ─── 1. HOME TAB VIEWPORT ─── */}
      <div style={{
        display: activeTab === 'home' ? 'flex' : 'none',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        flex: 1,
        position: 'relative',
      }}>
        <div style={{
          display: homeStack.length <= 1 ? 'flex' : 'none',
          flexDirection: 'column',
          height: '100%',
          width: '100%',
          flex: 1,
        }}>
          <HomeScreen isVisible={activeTab === 'home' && homeStack.length <= 1} />
        </div>
        {homeStack.length > 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', flex: 1 }}>
            {renderChildScreen(homeStack[homeStack.length - 1])}
          </div>
        )}
      </div>

      {/* ─── 2. SEARCH TAB VIEWPORT (Persistent query, suggestions & results) ─── */}
      <div style={{
        display: activeTab === 'search' ? 'flex' : 'none',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        flex: 1,
        position: 'relative',
      }}>
        <div style={{
          display: searchStack.length <= 1 ? 'flex' : 'none',
          flexDirection: 'column',
          height: '100%',
          width: '100%',
          flex: 1,
        }}>
          <SearchScreen />
        </div>
        {searchStack.length > 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', flex: 1 }}>
            {renderChildScreen(searchStack[searchStack.length - 1])}
          </div>
        )}
      </div>

      {/* ─── 3. LIBRARY TAB VIEWPORT (Persistent playlists, downloads & stacks) ─── */}
      <div style={{
        display: activeTab === 'library' ? 'flex' : 'none',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        flex: 1,
        position: 'relative',
      }}>
        <div style={{
          display: libraryStack.length <= 1 ? 'flex' : 'none',
          flexDirection: 'column',
          height: '100%',
          width: '100%',
          flex: 1,
        }}>
          <LibraryScreen />
        </div>
        {libraryStack.length > 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', flex: 1 }}>
            {renderChildScreen(libraryStack[libraryStack.length - 1])}
          </div>
        )}
      </div>

      {/* ─── 4. SETTINGS TAB VIEWPORT ─── */}
      <div style={{
        display: activeTab === 'settings' ? 'flex' : 'none',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        flex: 1,
        position: 'relative',
      }}>
        <div style={{
          display: settingsStack.length <= 1 ? 'flex' : 'none',
          flexDirection: 'column',
          height: '100%',
          width: '100%',
          flex: 1,
        }}>
          <SettingsScreen />
        </div>
        {settingsStack.length > 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', flex: 1 }}>
            {renderChildScreen(settingsStack[settingsStack.length - 1])}
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { GlobalToast } from './components/shared/GlobalToast';
import { OfflineIndicator } from './components/layout/OfflineIndicator';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { useAndroidBackHandler } from './core/hooks/useAndroidBackHandler';
import { updateService, type AppUpdateInfo } from './services/UpdateService';
import { UpdateModal } from './components/shared/UpdateModal';

import { useIsTV } from './core/utils/deviceMode';
import { TVAppShell } from './tv/components/TVAppShell';

// ─── App Shell ────────────────────────────────────────────────────────────────

function AppShell() {
  const isTV = useIsTV();
  const { state: appState } = useApp();
  const { state: playerState } = usePlayer();
  const [availableUpdate, setAvailableUpdate] = useState<AppUpdateInfo | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);

  // Unified Android Back navigation handler
  useAndroidBackHandler();

  // Automatic Background Update Check on Startup
  useEffect(() => {
    if (appState.config.autoUpdate !== false) {
      const timer = setTimeout(async () => {
        try {
          const res = await updateService.checkForUpdates(false);
          if (res.hasUpdate && res.latestUpdate) {
            setAvailableUpdate(res.latestUpdate);
            setShowUpdateModal(true);
          }
        } catch {
          // non-blocking
        }
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [appState.config.autoUpdate]);

  // Toggle TV Mode CSS Class on Document Body
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.body.classList.toggle('tv-mode', isTV);
    }
  }, [isTV]);

  if (isTV) {
    return <TVAppShell />;
  }

  if (!appState.onboardingCompleted) {
    return <OnboardingScreen />;
  }

  return (
    <AndroidShell>
      {/* Global Action Toast Notification positioned at bottom */}
      <GlobalToast
        isFullPlayer={playerState.showFullPlayer}
        hasMiniPlayer={!!playerState.currentSong}
      />

      {/* Main scrollable screen content (flows edge-to-edge behind floating glass objects) */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <ScreenRouter />
      </div>

      {/* Independent Floating Glass Layers (Now Playing & Bottom Nav directly over screen content) */}
      <div
        id="floating-layers-dock"
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          pointerEvents: 'none',
          zIndex: 95,
          background: 'transparent',
        }}
      >
        {/* Mini Player (floating rounded pill) */}
        <MiniPlayer />

        {/* Offline Connectivity Indicator */}
        <OfflineIndicator />

        {/* Bottom Navigation (floating rounded pill) */}
        <BottomNav />
      </div>

      {/* Full Player overlay */}
      {playerState.showFullPlayer && <FullPlayer />}

      {/* Queue overlay */}
      {playerState.showQueue && <QueueScreen />}

      {/* Global In-App Update Modal */}
      {availableUpdate && (
        <UpdateModal
          updateInfo={availableUpdate}
          isOpen={showUpdateModal}
          onClose={() => setShowUpdateModal(false)}
        />
      )}
    </AndroidShell>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <AppProvider>
      <PlayerProvider>
        <AppShell />
      </PlayerProvider>
    </AppProvider>
  );
}
