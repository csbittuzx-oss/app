import { useState } from 'react';
import type { Screen } from '../../data/models';
import { useApp } from '../../state/AppContext';
import { usePlayer } from '../../state/PlayerContext';
import { resetHomeScrollPosition } from '../../screens/HomeScreen';
import { CreateMenuSheet } from './CreateMenuSheet';

// SVG Icons inline (consistent 24px Lucide-style)
const HomeIcon = ({ filled }: { filled?: boolean }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    {filled
      ? <path d="M12 2L2 9v13h7v-7h6v7h7V9L12 2z" fill="currentColor"/>
      : <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
    }
  </svg>
);

const SearchIcon = ({ filled }: { filled?: boolean }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth={filled ? 0 : 1.75} fill={filled ? 'currentColor' : 'none'}/>
    {filled && <circle cx="11" cy="11" r="5" fill="var(--color-bg)"/>}
    <line x1="21" y1="21" x2="16.65" y2="16.65" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
  </svg>
);

const LibraryIcon = ({ filled }: { filled?: boolean }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    {filled
      ? <>
          <rect x="3" y="3" width="7" height="18" rx="1" fill="currentColor"/>
          <rect x="14" y="3" width="7" height="18" rx="1" fill="currentColor"/>
        </>
      : <>
          <rect x="3" y="3" width="7" height="18" rx="1" stroke="currentColor" strokeWidth="1.75"/>
          <rect x="14" y="3" width="7" height="18" rx="1" stroke="currentColor" strokeWidth="1.75"/>
        </>
    }
  </svg>
);

const CreateIcon = ({ isOpen }: { isOpen?: boolean }) => (
  <div style={{
    width: 24,
    height: 24,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'transform 260ms cubic-bezier(0.16, 1, 0.3, 1)',
    transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
  }}>
    {isOpen ? (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    ) : (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9.5" />
        <line x1="12" y1="8" x2="12" y2="16" />
        <line x1="8" y1="12" x2="16" y2="12" />
      </svg>
    )}
  </div>
);

const SettingsIcon = ({ filled }: { filled?: boolean }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
      stroke="currentColor"
      strokeWidth={filled ? '0' : '1.75'}
      fill={filled ? 'currentColor' : 'none'}
    />
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" fill={filled ? 'var(--color-surface)' : 'none'} />
  </svg>
);

export function BottomNav() {
  const { nav: { nav, navigate } } = useApp();
  const { state: playerState } = usePlayer();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const hasMiniPlayer = Boolean(playerState.currentSong);
  const current = nav.screen === 'profile' ? 'settings' : nav.screen;

  const handleTabClick = (id: string) => {
    if (id === 'create') {
      setIsCreateOpen((prev) => !prev);
      return;
    }

    setIsCreateOpen(false);

    if (id === 'home' && current === 'home') {
      resetHomeScrollPosition();
      const homeScroll = document.querySelector('.scroll-area');
      if (homeScroll) {
        homeScroll.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } else {
      navigate(id as Screen);
    }
  };

  return (
    <>
      {/* Floating Create Menu Bottom Sheet */}
      <CreateMenuSheet
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />

      <nav
        id="bottom-nav"
        style={{
          display: 'flex',
          alignItems: 'stretch',
          background: 'var(--color-surface)',
          borderTop: '1px solid var(--color-border)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          height: `calc(64px + env(safe-area-inset-bottom, 0px))`,
          zIndex: 96,
          flexShrink: 0,
          position: 'relative',
          backdropFilter: hasMiniPlayer ? 'blur(20px)' : 'none',
        }}
        aria-label="Main navigation"
      >
        {/* 1. Home */}
        <button
          id="nav-home"
          aria-label="Home"
          aria-current={current === 'home' && !isCreateOpen ? 'page' : undefined}
          onClick={() => handleTabClick('home')}
          style={navButtonStyle(current === 'home' && !isCreateOpen)}
        >
          <span style={iconScaleStyle(current === 'home' && !isCreateOpen)}>
            <HomeIcon filled={current === 'home' && !isCreateOpen} />
          </span>
          <span style={labelStyle(current === 'home' && !isCreateOpen)}>Home</span>
        </button>

        {/* 2. Search */}
        <button
          id="nav-search"
          aria-label="Search"
          aria-current={current === 'search' && !isCreateOpen ? 'page' : undefined}
          onClick={() => handleTabClick('search')}
          style={navButtonStyle(current === 'search' && !isCreateOpen)}
        >
          <span style={iconScaleStyle(current === 'search' && !isCreateOpen)}>
            <SearchIcon filled={current === 'search' && !isCreateOpen} />
          </span>
          <span style={labelStyle(current === 'search' && !isCreateOpen)}>Search</span>
        </button>

        {/* 3. Library */}
        <button
          id="nav-library"
          aria-label="Library"
          aria-current={current === 'library' && !isCreateOpen ? 'page' : undefined}
          onClick={() => handleTabClick('library')}
          style={navButtonStyle(current === 'library' && !isCreateOpen)}
        >
          <span style={iconScaleStyle(current === 'library' && !isCreateOpen)}>
            <LibraryIcon filled={current === 'library' && !isCreateOpen} />
          </span>
          <span style={labelStyle(current === 'library' && !isCreateOpen)}>Library</span>
        </button>

        {/* 4. Create (Transforms into X/close icon when opened) */}
        <button
          id="nav-create"
          aria-label={isCreateOpen ? 'Close create menu' : 'Create'}
          aria-expanded={isCreateOpen}
          onClick={() => handleTabClick('create')}
          style={navButtonStyle(isCreateOpen)}
        >
          <span style={iconScaleStyle(isCreateOpen)}>
            <CreateIcon isOpen={isCreateOpen} />
          </span>
          <span style={labelStyle(isCreateOpen)}>
            {isCreateOpen ? 'Close' : 'Create'}
          </span>
        </button>

        {/* 5. Settings */}
        <button
          id="nav-settings"
          aria-label="Settings"
          aria-current={current === 'settings' && !isCreateOpen ? 'page' : undefined}
          onClick={() => handleTabClick('settings')}
          style={navButtonStyle(current === 'settings' && !isCreateOpen)}
        >
          <span style={iconScaleStyle(current === 'settings' && !isCreateOpen)}>
            <SettingsIcon filled={current === 'settings' && !isCreateOpen} />
          </span>
          <span style={labelStyle(current === 'settings' && !isCreateOpen)}>Settings</span>
        </button>
      </nav>
    </>
  );
}

function navButtonStyle(isActive: boolean): React.CSSProperties {
  return {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: isActive ? 'var(--color-accent)' : 'var(--color-text-muted)',
    transition: 'color 200ms var(--ease-standard), transform 150ms var(--ease-spring)',
    padding: '8px 4px',
    minHeight: '48px',
    position: 'relative',
  };
}

function iconScaleStyle(isActive: boolean): React.CSSProperties {
  return {
    transform: isActive ? 'scale(1.12)' : 'scale(1)',
    transition: 'transform 200ms var(--ease-spring)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
}

function labelStyle(isActive: boolean): React.CSSProperties {
  return {
    fontSize: '10px',
    fontFamily: 'var(--font-body)',
    fontWeight: isActive ? 600 : 400,
    letterSpacing: '0.02em',
    lineHeight: 1,
  };
}

