import React from 'react';

interface SkeletonCardProps {
  variant?: 'square' | 'row' | 'artist';
  style?: React.CSSProperties;
}

export function SkeletonCard({ variant = 'square', style }: SkeletonCardProps) {
  if (variant === 'row') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', ...style }}>
        <div className="skeleton" style={{ width: 52, height: 52, borderRadius: 'var(--radius-md)', flexShrink: 0 }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="skeleton" style={{ height: 13, width: '65%', borderRadius: 4 }} />
          <div className="skeleton" style={{ height: 11, width: '40%', borderRadius: 4 }} />
        </div>
      </div>
    );
  }

  if (variant === 'artist') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: 88, ...style }}>
        <div className="skeleton" style={{ width: 80, height: 80, borderRadius: '50%' }} />
        <div className="skeleton" style={{ height: 11, width: 60, borderRadius: 4 }} />
      </div>
    );
  }

  // Default: square card
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 144, flexShrink: 0, ...style }}>
      <div className="skeleton" style={{ width: 144, height: 144, borderRadius: 'var(--radius-lg)' }} />
      <div className="skeleton" style={{ height: 12, width: '80%', borderRadius: 4 }} />
      <div className="skeleton" style={{ height: 11, width: '55%', borderRadius: 4 }} />
    </div>
  );
}

export function SkeletonList({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} variant="row" />
      ))}
    </>
  );
}

export function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div style={{ display: 'flex', gap: 12, overflowX: 'hidden' }}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
