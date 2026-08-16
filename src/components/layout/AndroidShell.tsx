import React from 'react';

interface AndroidShellProps {
  children: React.ReactNode;
}

/**
 * AndroidShell — Edge-to-edge wrapper with safe area handling.
 * Provides the app-level container that respects Android notch,
 * status bar, and gesture navigation areas.
 */
export function AndroidShell({ children }: AndroidShellProps) {
  return (
    <div id="android-shell" style={styles.shell}>
      <div style={styles.statusBar} aria-hidden="true" />
      <div style={styles.content}>
        {children}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    height: '100dvh',
    background: 'var(--color-bg)',
    overflow: 'hidden',
    position: 'relative',
  },
  statusBar: {
    height: 'env(safe-area-inset-top, 0px)',
    background: 'var(--color-bg)',
    flexShrink: 0,
    zIndex: 100,
  },
  content: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    position: 'relative',
  },
};
