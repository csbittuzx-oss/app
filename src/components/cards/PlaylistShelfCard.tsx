import React from 'react';
import type { Playlist } from '../../data/models';
import { CONFIG } from '../../config';
import { resizeImageUrl } from '../../core/utils/imageUtils';

interface PlaylistShelfCardProps {
  playlist: Playlist;
  onClick: () => void;
  size?: number;
}

export const PlaylistShelfCard: React.FC<PlaylistShelfCardProps> = ({
  playlist,
  onClick,
  size = 148,
}) => {
  const rawArtwork = playlist.artwork || (playlist.tracks[0]?.artwork) || CONFIG.ARTWORK_PLACEHOLDER;
  const artworkSrc = resizeImageUrl(rawArtwork, 544, 544);

  return (
    <div
      id={`playlist-card-${playlist.id}`}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      aria-label={`Open playlist ${playlist.title}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: size,
        flexShrink: 0,
        cursor: 'pointer',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        borderRadius: 'var(--radius-lg)',
        padding: 8,
        background: 'transparent',
        transition: 'transform 180ms cubic-bezier(0.16, 1, 0.3, 1), background 180ms ease',
      }}
      className="playlist-shelf-card"
    >
      {/* Artwork Container with 1:1 Aspect Ratio & Play Overlay */}
      <div
        style={{
          width: '100%',
          aspectRatio: '1 / 1',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          position: 'relative',
          background: 'var(--color-surface-2)',
          border: '1px solid var(--color-border)',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.35)',
        }}
      >
        <img
          src={artworkSrc}
          alt={playlist.title}
          width={size}
          height={size}
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).src = CONFIG.ARTWORK_PLACEHOLDER;
          }}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />

        {/* Subtle Gradient Shadow at bottom of card */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(to top, rgba(0, 0, 0, 0.45) 0%, transparent 60%)',
            pointerEvents: 'none',
          }}
        />

        {/* Small Play Indicator Badge in Bottom-Right */}
        <div
          style={{
            position: 'absolute',
            right: 8,
            bottom: 8,
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: 'var(--color-accent)',
            color: '#000000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
          }}
          aria-hidden="true"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="6 3 20 12 6 21 6 3" />
          </svg>
        </div>
      </div>

      {/* Typography: Title + Description */}
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3, minHeight: 44 }}>
        <p
          style={{
            margin: 0,
            fontSize: 'var(--text-sm)',
            fontWeight: 700,
            color: 'var(--color-text-primary)',
            lineHeight: 1.25,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={playlist.title}
        >
          {playlist.title}
        </p>

        {playlist.description && (
          <p
            style={{
              margin: 0,
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-secondary)',
              lineHeight: 1.35,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {playlist.description}
          </p>
        )}
      </div>
    </div>
  );
};
