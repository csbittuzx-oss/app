import type { Screen } from '../../data/models';
import { useApp } from '../../state/AppContext';
import { usePlayer } from '../../state/PlayerContext';

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

const NAV_ITEMS: { id: Screen; label: string; Icon: React.FC<{ filled?: boolean }> }[] = [
  { id: 'home', label: 'Home', Icon: HomeIcon },
  { id: 'search', label: 'Search', Icon: SearchIcon },
  { id: 'library', label: 'Library', Icon: LibraryIcon },
  { id: 'settings', label: 'Settings', Icon: SettingsIcon },
];

export function BottomNav() {
  const { nav: { nav, navigate } } = useApp();
  const { state: playerState } = usePlayer();
  const hasMiniPlayer = Boolean(playerState.currentSong);
  const current = nav.screen === 'profile' ? 'settings' : nav.screen;

  return (
    <nav
      id="bottom-nav"
      style={{
        display: 'flex',
        alignItems: 'stretch',
        background: 'var(--color-surface)',
        borderTop: '1px solid var(--color-border)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        height: `calc(64px + env(safe-area-inset-bottom, 0px))`,
        zIndex: 50,
        flexShrink: 0,
        position: 'relative',
        backdropFilter: hasMiniPlayer ? 'blur(20px)' : 'none',
      }}
      aria-label="Main navigation"
    >
      {NAV_ITEMS.map(({ id, label, Icon }) => {
        const isActive = current === id;
        return (
          <button
            key={id}
            id={`nav-${id}`}
            aria-label={label}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => navigate(id)}
            style={{
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
            }}
          >
            <span style={{
              transform: isActive ? 'scale(1.12)' : 'scale(1)',
              transition: 'transform 200ms var(--ease-spring)',
            }}>
              <Icon filled={isActive} />
            </span>
            <span style={{
              fontSize: '10px',
              fontFamily: 'var(--font-body)',
              fontWeight: isActive ? 600 : 400,
              letterSpacing: '0.02em',
              lineHeight: 1,
            }}>
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
