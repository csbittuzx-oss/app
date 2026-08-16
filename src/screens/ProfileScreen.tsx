import { useApp } from '../state/AppContext';
import { formatNumber } from '../core/utils';

export function ProfileScreen() {
  const { state, dispatch } = useApp();

  const stats = {
    liked: state.favorites.length,
    played: state.recentlyPlayed.length,
    playlists: state.userPlaylists.length,
    artists: state.favoriteArtists.length,
  };

  const isDark = state.theme === 'dark';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="scroll-area" style={{ flex: 1, paddingBottom: 'var(--content-bottom-pad)' }}>

        {/* Profile Hero */}
        <div style={{
          padding: '32px 20px 24px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
          background: 'linear-gradient(180deg, var(--color-accent-dim) 0%, transparent 100%)',
        }}>
          <div style={{
            width: 80, height: 80, borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--color-accent) 0%, var(--color-secondary) 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 32, fontWeight: 700, color: '#fff',
            border: '3px solid var(--color-border)',
            boxShadow: 'var(--shadow-accent)',
          }}>
            S
          </div>
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ margin: '0 0 4px', fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', color: 'var(--color-text-primary)' }}>
              Soundwave User
            </h1>
            <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
              Music lover
            </p>
          </div>
        </div>

        {/* Stats row */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 1, margin: '0 20px 24px',
          background: 'var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          border: '1px solid var(--color-border)',
        }}>
          {[
            { label: 'Liked', value: stats.liked },
            { label: 'Played', value: stats.played },
            { label: 'Lists', value: stats.playlists },
            { label: 'Artists', value: stats.artists },
          ].map((stat, i) => (
            <div key={i} style={{
              background: 'var(--color-card)',
              padding: '12px 8px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', color: 'var(--color-accent)', fontWeight: 400 }}>
                {formatNumber(stat.value)}
              </span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                {stat.label}
              </span>
            </div>
          ))}
        </div>

        {/* Settings */}
        <div style={{ padding: '0 20px' }}>
          <h2 style={{ margin: '0 0 12px', fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Settings
          </h2>

          {/* Theme toggle */}
          <SettingRow
            label="Dark Mode"
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>}
          >
            <ToggleSwitch
              id="dark-mode-toggle"
              checked={isDark}
              onChange={() => dispatch({ type: 'SET_THEME', payload: isDark ? 'light' : 'dark' })}
              label={isDark ? 'On' : 'Off'}
            />
          </SettingRow>

          {/* API Configuration */}
          <h2 style={{ margin: '24px 0 12px', fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            API Configuration
          </h2>

          <div style={{
            background: 'var(--color-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
          }}>
            <ApiKeyRow
              id="lastfm-key-input"
              label="Last.fm API Key"
              placeholder="Get free key at last.fm/api"
              value={state.config.lastfmApiKey}
              onChange={v => dispatch({ type: 'SET_CONFIG', payload: { lastfmApiKey: v } })}
            />
            <div style={{ height: 1, background: 'var(--color-border)' }} />
            <ApiKeyRow
              id="jamendo-key-input"
              label="Jamendo Client ID"
              placeholder="Get free ID at developer.jamendo.com"
              value={state.config.jamendoClientId}
              onChange={v => dispatch({ type: 'SET_CONFIG', payload: { jamendoClientId: v } })}
            />
          </div>

          <p style={{ margin: '8px 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
            Both are free. Last.fm adds artist bios & charts. Jamendo enables full Creative Commons tracks instead of 30s previews.
          </p>

          {/* App info */}
          <div style={{ marginTop: 32, paddingBottom: 8 }}>
            <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textAlign: 'center' }}>
              Soundwave · v1.0.0
            </p>
            <p style={{ margin: '4px 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textAlign: 'center' }}>
              Music data via iTunes, Jamendo & Last.fm
            </p>
          </div>
        </div>

        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}

function SettingRow({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 0',
      borderBottom: '1px solid var(--color-border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: 'var(--color-text-secondary)' }}>{icon}</span>
        <span style={{ fontSize: 'var(--text-base)', color: 'var(--color-text-primary)', fontWeight: 500 }}>
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}

function ToggleSwitch({ id, checked, onChange, label }: { id: string; checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      style={{
        width: 48, height: 26, borderRadius: 13,
        background: checked ? 'var(--color-accent)' : 'var(--color-surface-2)',
        border: '2px solid ' + (checked ? 'var(--color-accent)' : 'var(--color-border)'),
        cursor: 'pointer', padding: 0, position: 'relative',
        transition: 'background 200ms var(--ease-standard)',
      }}
    >
      <div style={{
        width: 18, height: 18, borderRadius: '50%',
        background: '#fff',
        position: 'absolute', top: 2,
        left: checked ? 24 : 2,
        transition: 'left 200ms var(--ease-spring)',
        boxShadow: 'var(--shadow-sm)',
      }} />
    </button>
  );
}

function ApiKeyRow({ id, label, placeholder, value, onChange }: {
  id: string; label: string; placeholder: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div style={{ padding: '12px 16px' }}>
      <label htmlFor={id} style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </label>
      <input
        id={id}
        type="password"
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        style={{
          width: '100%', boxSizing: 'border-box',
          background: 'transparent', border: 'none', outline: 'none',
          fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)',
          fontFamily: 'var(--font-body)',
        }}
      />
    </div>
  );
}
