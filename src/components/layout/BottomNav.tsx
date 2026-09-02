import { useEffect, useRef, useState } from 'react';
import type { Screen } from '../../data/models';
import { useApp } from '../../state/AppContext';
import { resetHomeScrollPosition } from '../../screens/HomeScreen';
import './BottomNav.css';

// ─── SVG Icons Inline (Liquid Glass High-Precision 24px) ───────────────────────

const HomeIcon = ({ filled }: { filled?: boolean }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    {filled ? (
      <path
        d="M12 2.5L3 9.5v11A1.5 1.5 0 004.5 22h5a1 1 0 001-1v-5a1 1 0 011-1h1a1 1 0 011 1v5a1 1 0 001 1h5a1.5 1.5 0 001.5-1.5v-11L12 2.5z"
        fill="currentColor"
      />
    ) : (
      <path
        d="M3 9.5L12 2.5l9 7v11a1.5 1.5 0 01-1.5 1.5h-5a1 1 0 01-1-1v-5a1 1 0 00-1-1h-1a1 1 0 00-1 1v5a1 1 0 01-1 1h-5A1.5 1.5 0 013 20.5v-11z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    )}
  </svg>
);

const SearchIcon = ({ filled }: { filled?: boolean }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    {filled ? (
      <>
        <circle cx="11" cy="11" r="7.5" stroke="currentColor" strokeWidth="2.2" />
        <circle cx="11" cy="11" r="4.5" fill="currentColor" opacity="0.35" />
        <path d="M16.5 16.5L21.5 21.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </>
    ) : (
      <>
        <circle cx="11" cy="11" r="7.5" stroke="currentColor" strokeWidth="1.8" fill="none" />
        <path d="M16.5 16.5L21.5 21.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </>
    )}
  </svg>
);

const LibraryIcon = ({ filled }: { filled?: boolean }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    {filled ? (
      <>
        <path
          d="M4 4.5A1.5 1.5 0 015.5 3h1.5A1.5 1.5 0 018.5 4.5v15A1.5 1.5 0 017 21H5.5A1.5 1.5 0 014 19.5v-15z"
          fill="currentColor"
        />
        <path
          d="M11 4.5A1.5 1.5 0 0112.5 3h1.5A1.5 1.5 0 0115.5 4.5v15a1.5 1.5 0 01-1.5 1.5h-1.5a1.5 1.5 0 01-1.5-1.5v-15z"
          fill="currentColor"
        />
        <path d="M19.5 5.5l-2.5 14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </>
    ) : (
      <>
        <rect x="4" y="3.5" width="4.5" height="17" rx="1.2" stroke="currentColor" strokeWidth="1.8" fill="none" />
        <rect x="11" y="3.5" width="4.5" height="17" rx="1.2" stroke="currentColor" strokeWidth="1.8" fill="none" />
        <path d="M18.5 5.5l-2.5 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </>
    )}
  </svg>
);

const SettingsIcon = ({ filled }: { filled?: boolean }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    {filled ? (
      <>
        <path
          d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z"
          fill="currentColor"
        />
        <circle cx="12" cy="12" r="3" fill="var(--color-bg, #0A0A12)" />
      </>
    ) : (
      <>
        <path
          d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z"
          stroke="currentColor"
          strokeWidth="1.8"
          fill="none"
        />
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" fill="none" />
      </>
    )}
  </svg>
);

// ─── Tab Configuration ────────────────────────────────────────────────────────

const NAV_TABS = [
  { id: 'home', label: 'Home', Icon: HomeIcon },
  { id: 'search', label: 'Search', Icon: SearchIcon },
  { id: 'library', label: 'Library', Icon: LibraryIcon },
  { id: 'settings', label: 'Settings', Icon: SettingsIcon },
] as const;

// ─── Liquid Glass BottomNav Component ─────────────────────────────────────────

export function BottomNav() {
  const { nav: { nav, navigate } } = useApp();
  const current = nav.screen === 'profile' ? 'settings' : nav.screen;

  // Resolve current active tab index (0: Home, 1: Search, 2: Library, 3: Settings)
  const tabIndex = NAV_TABS.findIndex((t) => t.id === current);
  const activeIndex = tabIndex >= 0 ? tabIndex : 0;

  // Track animation state for fluid liquid morphing physics
  const prevIndexRef = useRef<number>(activeIndex);
  const [morphClass, setMorphClass] = useState<string>('');

  useEffect(() => {
    if (prevIndexRef.current !== activeIndex) {
      const isMovingForward = activeIndex > prevIndexRef.current;
      setMorphClass(isMovingForward ? 'morph-forward' : 'morph-backward');
      prevIndexRef.current = activeIndex;

      const timer = setTimeout(() => {
        setMorphClass('');
      }, 420);
      return () => clearTimeout(timer);
    }
  }, [activeIndex]);

  const handleTabClick = (id: string) => {
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
    <nav
      id="bottom-nav"
      className="bottom-nav-root"
      aria-label="Main navigation"
    >
      {/* Smooth Frosted Glass Background Blur Layer (starts from bottom nav top down to screen bottom) */}
      <div className="bottom-nav-blur-underlay" aria-hidden="true" />

      {/* Floating Liquid Glass Island */}
      <div className="bottom-nav-island">
        {/* Sliding Liquid-Glass Capsule Indicator with Spring Physics */}
        <div
          className={`bottom-nav-active-capsule ${morphClass}`}
          style={{
            transform: `translateX(calc(${activeIndex} * 100%))`,
          }}
          aria-hidden="true"
        />

        {/* Navigation Tab Buttons */}
        {NAV_TABS.map((tab) => {
          const isActive = current === tab.id;
          const { Icon, id, label } = tab;

          return (
            <button
              key={id}
              id={`nav-${id}`}
              className={`bottom-nav-tab ${isActive ? 'is-active' : ''}`}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => handleTabClick(id)}
              type="button"
            >
              <span className="bottom-nav-icon-box">
                <Icon filled={isActive} />
              </span>
              <span className="bottom-nav-label">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
