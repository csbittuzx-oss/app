import { useState, useEffect } from 'react';

/**
 * Checks whether the app is running on Android TV, Google TV, Smart TV or TV mode.
 */
export function isTVMode(): boolean {
  if (typeof window === 'undefined') return false;

  // 1. Explicit developer / user debug toggle in localStorage
  try {
    const forced = localStorage.getItem('sw_force_tv_mode');
    if (forced === 'true') return true;
    if (forced === 'false') return false;
  } catch {}

  // 2. Query param ?tv=1 for easy browser/emulator preview
  if (typeof window.location !== 'undefined' && window.location.search.includes('tv=1')) {
    return true;
  }

  // 3. Native injected flag from Android MainActivity
  if ((window as any).IS_ANDROID_TV === true) {
    return true;
  }

  // 4. User Agent inspection for Leanback / Android TV tags
  const ua = (navigator.userAgent || '').toLowerCase();
  const tvKeywords = [
    'androidtv',
    'soundwavetv',
    'googletv',
    'google tv',
    'smart-tv',
    'smarttv',
    'leanback',
    'appletv',
    'crkey',
    'aftt', // Fire TV Stick
    'aftm', // Fire TV
    'aftb',
    'bravia',
    'netcast',
    'vizio',
    'tizen',
    'webos',
  ];

  if (tvKeywords.some((kw) => ua.includes(kw))) {
    return true;
  }

  // 5. Television media query & landscape non-touch screen check
  const isTelevisionMediaQuery = window.matchMedia('tv, (television)').matches;
  if (isTelevisionMediaQuery) return true;

  return false;
}

/**
 * React hook that reactively tracks TV mode status.
 */
export function useIsTV(): boolean {
  const [isTV, setIsTV] = useState<boolean>(() => isTVMode());

  useEffect(() => {
    const check = () => setIsTV(isTVMode());
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
  }, []);

  return isTV;
}
