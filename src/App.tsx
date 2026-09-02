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

// ─── Screen Router ────────────────────────────────────────────────────────────

function ScreenRouter() {
  const { nav: { nav } } = useApp();
  const screen = nav.screen;

  const isHome = screen === 'home';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', width: '100%', position: 'relative', overflow: 'hidden' }}>
      {/* Home Screen - persistent wrapper preserves scroll offset and feed state seamlessly */}
      <div style={{
        display: isHome ? 'flex' : 'none',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        flex: 1,
      }}>
        <HomeScreen isVisible={isHome} />
      </div>

      {screen === 'search' && <SearchScreen />}
      {screen === 'library' && <LibraryScreen />}
      {screen === 'downloads' && <DownloadsScreen />}
      {(screen === 'settings' || screen === 'profile') && <SettingsScreen />}
      {screen === 'artist' && <ArtistScreen />}
      {screen === 'album' && <AlbumScreen />}
      {screen === 'playlist' && <PlaylistScreen />}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { subscribeToast, type ToastPayload } from './core/utils/toast';

function GlobalToast({ isFullPlayer, hasMiniPlayer }: { isFullPlayer: boolean; hasMiniPlayer: boolean }) {
  const [toast, setToast] = useState<ToastPayload | null>(null);

  useEffect(() => {
    return subscribeToast(setToast);
  }, []);

  if (!toast) return null;

  const isSuccess = toast.type === 'success';
  const isDanger = toast.type === 'danger';

  // Calculate bottom offset to avoid overlapping mini-player, full-player, or bottom nav
  const bottomOffset = isFullPlayer
    ? 'calc(env(safe-area-inset-bottom, 0px) + 24px)'
    : hasMiniPlayer
    ? 'calc(var(--bottom-nav-height, 64px) + 64px + env(safe-area-inset-bottom, 0px) + 8px)'
    : 'calc(var(--bottom-nav-height, 64px) + env(safe-area-inset-bottom, 0px) + 12px)';

  return (
    <div
      style={{
        position: 'fixed',
        bottom: bottomOffset,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 99999,
        background: 'rgba(18, 18, 20, 0.95)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        color: '#F4F4F5',
        padding: '6px 14px',
        borderRadius: '9999px',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.35)',
        fontSize: '12px',
        fontWeight: 500,
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        pointerEvents: 'none',
        maxWidth: 'min(340px, calc(100vw - 32px))',
        fontFamily: 'var(--font-body)',
      }}
    >
      {/* Crisp SVG Icon Badge */}
      <div
        style={{
          width: 16,
          height: 16,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          background: isSuccess ? '#10B981' : isDanger ? '#EF4444' : '#6366F1',
          color: '#FFFFFF',
        }}
      >
        {isSuccess && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
        {isDanger && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        )}
        {!isSuccess && !isDanger && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        )}
      </div>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {toast.message}
      </span>
    </div>
  );
}

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
