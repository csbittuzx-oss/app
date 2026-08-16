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

  switch (screen) {
    case 'home':      return <HomeScreen />;
    case 'search':    return <SearchScreen />;
    case 'library':   return <LibraryScreen />;
    case 'downloads': return <DownloadsScreen />;
    case 'settings':  return <SettingsScreen />;
    case 'profile':   return <SettingsScreen />;
    case 'artist':    return <ArtistScreen />;
    case 'album':     return <AlbumScreen />;
    case 'playlist':  return <PlaylistScreen />;
    default:          return <HomeScreen />;
  }
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
    ? 'calc(env(safe-area-inset-bottom, 0px) + 28px)'
    : hasMiniPlayer
    ? 'calc(var(--bottom-nav-height, 64px) + 68px + env(safe-area-inset-bottom, 0px) + 12px)'
    : 'calc(var(--bottom-nav-height, 64px) + env(safe-area-inset-bottom, 0px) + 16px)';

  return (
    <div
      style={{
        position: 'fixed',
        bottom: bottomOffset,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 99999,
        background: 'rgba(24, 24, 27, 0.94)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        color: '#FFFFFF',
        padding: '10px 18px',
        borderRadius: 'var(--radius-full)',
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.45), 0 2px 8px rgba(0, 0, 0, 0.25)',
        fontSize: '13.5px',
        fontWeight: 600,
        letterSpacing: '-0.01em',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        pointerEvents: 'none',
        animation: 'toastBottomSlide 320ms cubic-bezier(0.16, 1, 0.3, 1)',
        maxWidth: 'min(380px, calc(100vw - 32px))',
        fontFamily: 'var(--font-body)',
        transition: 'bottom 250ms cubic-bezier(0.2, 0.8, 0.2, 1)',
      }}
    >
      {/* Icon Badge */}
      <div
        style={{
          width: 22,
          height: 22,
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
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
        {isDanger && (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
          </svg>
        )}
        {!isSuccess && !isDanger && (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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

// ─── App Shell ────────────────────────────────────────────────────────────────

function AppShell() {
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
          const res = await updateService.checkForUpdates();
          if (res.hasUpdate && res.latestUpdate) {
            setAvailableUpdate(res.latestUpdate);
            setShowUpdateModal(true);
          }
        } catch {
          // non-blocking
        }
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [appState.config.autoUpdate]);

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

      {/* Main scrollable screen content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        <ScreenRouter />
      </div>

      {/* Mini Player (above bottom nav) */}
      <MiniPlayer />

      {/* Offline Connectivity Indicator */}
      <OfflineIndicator />

      {/* Bottom Navigation */}
      <BottomNav />

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
