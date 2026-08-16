import { useEffect, useRef } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useApp } from '../../state/AppContext';
import { usePlayer } from '../../state/PlayerContext';
import { showToast } from '../utils/toast';

export function useAndroidBackHandler() {
  const { nav: { nav, goBack, navigate } } = useApp();
  const { state: playerState, closeFullPlayer, closeQueue } = usePlayer();

  const lastBackPressTimeRef = useRef(0);

  // Store latest states in refs so event listeners always access current values
  const stateRef = useRef({
    showFullPlayer: playerState.showFullPlayer,
    showQueue: playerState.showQueue,
    nav,
  });

  useEffect(() => {
    stateRef.current = {
      showFullPlayer: playerState.showFullPlayer,
      showQueue: playerState.showQueue,
      nav,
    };
  }, [playerState.showFullPlayer, playerState.showQueue, nav]);

  useEffect(() => {
    const handleBackButton = async () => {
      // ── Priority 1: Open Modals / Bottom Sheets / Overlays ──
      const activeBackdrop = document.querySelector<HTMLElement>(
        '#update-modal-backdrop, #legal-modal-backdrop, #song-options-backdrop, #playlist-action-modal-backdrop, #spotify-import-modal-backdrop, #create-playlist-modal-backdrop, #reset-app-modal-backdrop, [role="dialog"][data-backdrop="true"]'
      );
      if (activeBackdrop) {
        activeBackdrop.click();
        return;
      }

      // ── Priority 2: Full Player (Now Playing) Overlay ──
      if (stateRef.current.showFullPlayer) {
        closeFullPlayer();
        return;
      }

      // ── Priority 3: Playback Queue Overlay ──
      if (stateRef.current.showQueue) {
        closeQueue();
        return;
      }

      // ── Priority 4: Application Navigation Stack ──
      const wasPopped = goBack();
      if (wasPopped) {
        return;
      }

      // ── Priority 5: If on a non-home screen without stack history, go to Home ──
      if (stateRef.current.nav.screen !== 'home') {
        navigate('home');
        return;
      }

      // ── Priority 6: Root Home Screen -> Exit on double back press ──
      const now = Date.now();
      if (now - lastBackPressTimeRef.current < 2000) {
        if (Capacitor.isNativePlatform()) {
          CapApp.exitApp();
        }
      } else {
        lastBackPressTimeRef.current = now;
        showToast('Press back again to exit', 'info', 1800);
      }
    };

    let listenerPromise: Promise<any> | null = null;

    if (Capacitor.isNativePlatform()) {
      listenerPromise = CapApp.addListener('backButton', handleBackButton);
    }

    // Keyboard back / Escape support for desktop / browser testing
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleBackButton();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      if (listenerPromise) {
        listenerPromise.then((handle) => handle.remove()).catch(() => {});
      }
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeFullPlayer, closeQueue, goBack, navigate]);
}
