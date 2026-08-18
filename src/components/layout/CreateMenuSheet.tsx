import React from 'react';
import { usePlayer } from '../../state/PlayerContext';
import { showToast } from '../../core/utils/toast';

interface CreateMenuSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateMenuSheet({ isOpen, onClose }: CreateMenuSheetProps) {
  const { state: playerState, toggleRidingMode } = usePlayer();
  const isRidingOn = Boolean(playerState.ridingMode);
  const hasMiniPlayer = Boolean(playerState.currentSong);

  if (!isOpen) return null;

  const handleRidingToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleRidingMode();
    const nextState = !isRidingOn;
    if (nextState) {
      showToast('🏍️ Riding Mode ON — DJ Crossfade active', 'success', 2500);
    } else {
      showToast('Riding Mode OFF — Standard playback', 'info', 2000);
    }
  };

  const handlePlayTogether = () => {
    showToast('Play Together — Coming soon...', 'info', 2400);
    onClose();
  };

  const handleStream = () => {
    showToast('Stream — Coming soon...', 'info', 2400);
    onClose();
  };

  // Position floating sheet slightly lower, right above mini-player or bottom navigation
  const bottomOffset = hasMiniPlayer
    ? 'calc(var(--nav-height, 64px) + 68px + env(safe-area-inset-bottom, 0px) + 6px)'
    : 'calc(var(--nav-height, 64px) + env(safe-area-inset-bottom, 0px) + 6px)';

  return (
    <>
      {/* Click-away backdrop overlay */}
      <div
        id="create-menu-backdrop"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 90,
          background: 'var(--color-scrim-light, rgba(0, 0, 0, 0.4))',
          backdropFilter: 'blur(3px)',
          WebkitBackdropFilter: 'blur(3px)',
          animation: 'fadeIn 180ms ease-out',
        }}
        aria-hidden="true"
      />

      {/* Compact Quick-Actions Floating Bottom Sheet */}
      <div
        id="create-menu-sheet"
        role="dialog"
        aria-label="Create menu"
        style={{
          position: 'fixed',
          bottom: bottomOffset,
          left: 16,
          right: 16,
          maxWidth: 324,
          margin: '0 auto',
          zIndex: 95,
          background: 'var(--color-surface)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-xl, 18px)',
          padding: '7px 9px',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          animation: 'createSheetPop 220ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Subtle Top Indicator Handle */}
        <div
          style={{
            width: 24,
            height: 3,
            borderRadius: 2,
            background: 'var(--color-border)',
            margin: '1px auto 3px',
            opacity: 0.7,
          }}
        />

        {/* ── Option 1: Riding Mode ── */}
        <div
          id="option-riding-mode"
          onClick={handleRidingToggle}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 10px',
            borderRadius: 'var(--radius-md, 10px)',
            background: isRidingOn ? 'var(--color-accent-dim)' : 'var(--color-surface-2)',
            border: isRidingOn ? '1px solid var(--color-border-focus)' : '1px solid var(--color-border)',
            cursor: 'pointer',
            transition: 'all 180ms ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Motorcycle / Speed Icon */}
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 'var(--radius-md, 8px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: isRidingOn ? 'var(--color-accent)' : 'var(--color-surface)',
                color: isRidingOn ? 'var(--color-accent-on)' : 'var(--color-text-secondary)',
                border: '1px solid var(--color-border)',
                transition: 'all 200ms ease',
                flexShrink: 0,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="5.5" cy="17.5" r="3.5"/>
                <circle cx="18.5" cy="17.5" r="3.5"/>
                <path d="M15 6h-3.5l-3 6.5h6l1.5-3.5 2.5 1"/>
                <path d="M9 17.5h5.5l1.5-3.5"/>
                <circle cx="15.5" cy="6.5" r="1.5"/>
              </svg>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>
                Riding Mode
              </span>
              {isRidingOn && (
                <span style={{
                  fontSize: 8.5,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.03em',
                  padding: '1px 5px',
                  borderRadius: 'var(--radius-full, 9999px)',
                  background: 'var(--color-accent)',
                  color: 'var(--color-accent-on)',
                }}>
                  ON
                </span>
              )}
            </div>
          </div>

          {/* Compact Toggle Switch */}
          <div
            style={{
              width: 36,
              height: 20,
              borderRadius: 10,
              background: isRidingOn ? 'var(--color-accent)' : 'var(--color-border)',
              position: 'relative',
              transition: 'background 200ms ease',
              flexShrink: 0,
              marginLeft: 8,
            }}
          >
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: isRidingOn ? 'var(--color-accent-on)' : 'var(--color-text-primary)',
                position: 'absolute',
                top: 3,
                left: isRidingOn ? 19 : 3,
                transition: 'left 200ms cubic-bezier(0.2, 0.8, 0.2, 1)',
                boxShadow: 'var(--shadow-sm)',
              }}
            />
          </div>
        </div>

        {/* ── Option 2: Play Together ── */}
        <div
          id="option-play-together"
          onClick={handlePlayTogether}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 10px',
            borderRadius: 'var(--radius-md, 10px)',
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-border)',
            cursor: 'pointer',
            transition: 'background 150ms ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 'var(--radius-md, 8px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--color-secondary-dim)',
                color: 'var(--color-secondary)',
                border: '1px solid var(--color-border)',
                flexShrink: 0,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>
              Play Together
            </span>
          </div>
          <span style={{
            fontSize: 9.5,
            fontWeight: 500,
            color: 'var(--color-text-muted)',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            padding: '2px 6px',
            borderRadius: 'var(--radius-sm, 6px)',
            flexShrink: 0,
            marginLeft: 8,
          }}>
            Coming soon
          </span>
        </div>

        {/* ── Option 3: Stream ── */}
        <div
          id="option-stream"
          onClick={handleStream}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 10px',
            borderRadius: 'var(--radius-md, 10px)',
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-border)',
            cursor: 'pointer',
            transition: 'background 150ms ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 'var(--radius-md, 8px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--color-accent-dim)',
                color: 'var(--color-accent)',
                border: '1px solid var(--color-border)',
                flexShrink: 0,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/>
                <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/>
                <circle cx="12" cy="12" r="2"/>
                <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/>
                <path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/>
              </svg>
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>
              Stream
            </span>
          </div>
          <span style={{
            fontSize: 9.5,
            fontWeight: 500,
            color: 'var(--color-text-muted)',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            padding: '2px 6px',
            borderRadius: 'var(--radius-sm, 6px)',
            flexShrink: 0,
            marginLeft: 8,
          }}>
            Coming soon
          </span>
        </div>
      </div>
    </>
  );
}
