import { useState, useEffect } from 'react';
import { showToast } from '../../core/utils/toast';

export function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      showToast('Back online · Syncing recommendations', 'success', 2500);
      // Dispatch custom event to trigger seamless background refresh on HomeScreen
      window.dispatchEvent(new CustomEvent('sw_online_restored'));
    };

    const handleOffline = () => {
      setIsOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      id="offline-indicator-bar"
      style={{
        width: '100%',
        background: 'rgba(24, 24, 27, 0.98)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
        padding: '7px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        color: '#FFFFFF',
        fontSize: '12px',
        fontWeight: 600,
        zIndex: 55,
        animation: 'slideUp 220ms ease-out',
        flexShrink: 0,
        boxShadow: '0 -2px 10px rgba(0,0,0,0.3)',
      }}
    >
      <div style={{
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: '#EF4444',
        boxShadow: '0 0 8px rgba(239, 68, 68, 0.7)',
        flexShrink: 0,
      }} />
      <span style={{ letterSpacing: '-0.01em' }}>You're offline</span>
      <span style={{ color: 'rgba(255, 255, 255, 0.35)', fontSize: '11px' }}>•</span>
      <span style={{ color: 'rgba(255, 255, 255, 0.65)', fontSize: '11px', fontWeight: 400 }}>
        Only cached songs available
      </span>
    </div>
  );
}
