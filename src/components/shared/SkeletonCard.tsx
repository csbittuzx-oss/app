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

export function SectionShimmerSkeleton({
  titleWidth = 140,
  subtitleWidth = 200,
  cardCount = 5,
  hasButton = true,
}: {
  titleWidth?: number;
  subtitleWidth?: number;
  cardCount?: number;
  hasButton?: boolean;
}) {
  return (
    <section style={{ marginBottom: 16 }}>
      {/* Section Header Shimmer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          padding: '20px 20px 12px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
          <div className="skeleton" style={{ height: 18, width: titleWidth, borderRadius: 4 }} />
          <div className="skeleton" style={{ height: 12, width: subtitleWidth, borderRadius: 4 }} />
        </div>
        {hasButton && (
          <div className="skeleton" style={{ height: 28, width: 78, borderRadius: 14, flexShrink: 0 }} />
        )}
      </div>

      {/* Cards Horizontal Row Shimmer */}
      <div
        className="hide-scrollbar"
        style={{
          display: 'flex',
          gap: 14,
          overflowX: 'hidden',
          padding: '0 20px',
        }}
      >
        {Array.from({ length: cardCount }, (_, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 144, flexShrink: 0 }}>
            <div className="skeleton" style={{ width: 144, height: 144, borderRadius: 'var(--radius-lg, 16px)' }} />
            <div className="skeleton" style={{ height: 13, width: '84%', borderRadius: 4 }} />
            <div className="skeleton" style={{ height: 11, width: '55%', borderRadius: 4 }} />
          </div>
        ))}
      </div>
    </section>
  );
}

export function HomeShimmerSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 40 }}>
      {/* Hero Now Playing / Continue Listening Shimmer Card */}
      <div style={{ padding: '0 20px 4px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 14px',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg, 16px)',
          }}
        >
          <div className="skeleton" style={{ width: 56, height: 56, borderRadius: 'var(--radius-md, 10px)', flexShrink: 0 }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="skeleton" style={{ height: 15, width: '60%', borderRadius: 4 }} />
            <div className="skeleton" style={{ height: 12, width: '42%', borderRadius: 4 }} />
            <div className="skeleton" style={{ height: 4, width: '100%', borderRadius: 2, marginTop: 4 }} />
          </div>
          <div className="skeleton" style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, marginLeft: 4 }} />
        </div>
      </div>

      {/* Shelves Shimmers */}
      <SectionShimmerSkeleton titleWidth={150} subtitleWidth={210} cardCount={5} />
      <SectionShimmerSkeleton titleWidth={130} subtitleWidth={175} cardCount={5} />
      <SectionShimmerSkeleton titleWidth={170} subtitleWidth={230} cardCount={5} />
      <SectionShimmerSkeleton titleWidth={140} subtitleWidth={190} cardCount={5} />
      <SectionShimmerSkeleton titleWidth={160} subtitleWidth={180} cardCount={5} />
    </div>
  );
}

