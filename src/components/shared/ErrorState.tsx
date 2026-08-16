import React from 'react';

// ─── Error State ─────────────────────────────────────────────────────────────

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  type?: 'offline' | 'api' | 'empty' | 'generic';
}

const ErrorIllustration = ({ type }: { type: string }) => {
  if (type === 'offline') {
    return (
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <circle cx="32" cy="32" r="28" fill="var(--color-surface-2)"/>
        <path d="M20 32c0-6.627 5.373-12 12-12s12 5.373 12 12" stroke="var(--color-text-muted)" strokeWidth="2.5" strokeLinecap="round"/>
        <path d="M26 36c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="var(--color-text-muted)" strokeWidth="2.5" strokeLinecap="round"/>
        <circle cx="32" cy="40" r="2.5" fill="var(--color-text-muted)"/>
        <line x1="16" y1="16" x2="48" y2="48" stroke="var(--color-error)" strokeWidth="2.5" strokeLinecap="round"/>
      </svg>
    );
  }
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <circle cx="32" cy="32" r="28" fill="var(--color-surface-2)"/>
      <path d="M32 20v14M32 40v2" stroke="var(--color-text-muted)" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  );
};

export function ErrorState({ title, message, onRetry, type = 'generic' }: ErrorStateProps) {
  const defaultTitle = type === 'offline' ? 'No Connection' : 'Something went wrong';
  const defaultMsg = type === 'offline'
    ? 'Check your internet connection and try again.'
    : 'We couldn\'t load this content. Please try again.';

  return (
    <div role="alert" style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 16, padding: '48px 32px', textAlign: 'center', minHeight: 240,
    }}>
      <ErrorIllustration type={type} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h3 style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 'var(--text-md)', color: 'var(--color-text-primary)', margin: 0 }}>
          {title || defaultTitle}
        </h3>
        <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.5 }}>
          {message || defaultMsg}
        </p>
      </div>
      {onRetry && (
        <button
          id="error-retry-btn"
          onClick={onRetry}
          className="btn btn-primary"
          style={{ fontSize: 'var(--text-sm)' }}
        >
          Try Again
        </button>
      )}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: { label: string; onClick: () => void };
}

const defaultEmptyIcon = (
  <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true">
    <circle cx="28" cy="28" r="24" fill="var(--color-surface-2)"/>
    <path d="M20 28h16M28 20v16" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

export function EmptyState({ icon = defaultEmptyIcon, title, subtitle, action }: EmptyStateProps) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 16, padding: '48px 32px', textAlign: 'center', minHeight: 240,
    }}>
      <div style={{ opacity: 0.6 }}>{icon}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h3 style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 'var(--text-md)', color: 'var(--color-text-primary)', margin: 0 }}>
          {title}
        </h3>
        {subtitle && (
          <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-text-secondary)', margin: 0 }}>
            {subtitle}
          </p>
        )}
      </div>
      {action && (
        <button
          id="empty-state-action-btn"
          onClick={action.onClick}
          className="btn btn-primary"
          style={{ fontSize: 'var(--text-sm)' }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
