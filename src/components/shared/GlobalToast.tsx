import { useState, useEffect, useRef } from 'react';
import { subscribeToast, type ToastPayload } from '../../core/utils/toast';
import './GlobalToast.css';

interface GlobalToastProps {
  isFullPlayer: boolean;
  hasMiniPlayer: boolean;
}

export function GlobalToast({ isFullPlayer, hasMiniPlayer }: GlobalToastProps) {
  const [toast, setToast] = useState<ToastPayload | null>(null);
  const [isExiting, setIsExiting] = useState(false);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return subscribeToast((payload) => {
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
      if (unmountTimerRef.current) clearTimeout(unmountTimerRef.current);

      if (!payload) {
        setIsExiting(true);
        unmountTimerRef.current = setTimeout(() => {
          setToast(null);
          setIsExiting(false);
        }, 280);
        return;
      }

      setToast(payload);
      setIsExiting(false);

      const duration = payload.duration || 2600;
      exitTimerRef.current = setTimeout(() => {
        setIsExiting(true);
        unmountTimerRef.current = setTimeout(() => {
          setToast(null);
          setIsExiting(false);
        }, 280);
      }, duration);
    });
  }, []);

  if (!toast) return null;

  const { type, message } = toast;
  const isSuccess = type === 'success';
  const isDanger = type === 'danger' || type === 'error';
  const isWarning = type === 'warning';
  const isInfo = !isSuccess && !isDanger && !isWarning;

  // Dynamic bottom calculation based on whichever component is currently visible
  const bottomOffset = isFullPlayer
    ? 'calc(env(safe-area-inset-bottom, 0px) + 96px)'
    : hasMiniPlayer
    ? 'calc(154px + env(safe-area-inset-bottom, 0px))'
    : 'calc(92px + env(safe-area-inset-bottom, 0px))';

  return (
    <div
      id="global-toast-portal"
      className="global-toast-container"
      style={{ bottom: bottomOffset }}
      aria-live="polite"
      aria-atomic="true"
    >
      <div className={`global-toast-island ${isExiting ? 'is-exiting' : ''}`}>
        {/* Optical Specular Light Lens */}
        <div className="global-toast-specular-lens" aria-hidden="true" />

        {/* Semantic Icon Badge */}
        <div className={`global-toast-icon-badge type-${type}`}>
          {isSuccess && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
          {isDanger && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          )}
          {isWarning && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          )}
          {isInfo && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          )}
        </div>

        {/* Message */}
        <span className="global-toast-message">{message}</span>
      </div>
    </div>
  );
}
