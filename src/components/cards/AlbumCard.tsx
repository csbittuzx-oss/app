import React from 'react';
import type { Album } from '../../data/models';
import { useApp } from '../../state/AppContext';
import { CONFIG } from '../../config';
import { resizeImageUrl } from '../../core/utils/imageUtils';

interface AlbumCardProps {
  album: Album;
  size?: number;
  onClick?: (album: Album) => void;
}

function AlbumCardComponent({ album, size = 144, onClick }: AlbumCardProps) {
  const { nav: { navigate } } = useApp();

  const handleClick = () => {
    if (onClick) { onClick(album); return; }
    navigate('album', { albumId: album.id, albumTitle: album.title, albumArtist: album.artist });
  };

  return (
    <div
      id={`album-card-${album.id}`}
      style={{ display: 'flex', flexDirection: 'column', gap: 8, width: size, flexShrink: 0, cursor: 'pointer' }}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label={`View album ${album.title} by ${album.artist}`}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
    >
      <div style={{ position: 'relative' }}>
        <img
          src={resizeImageUrl(album.artwork, 240, 240)}
          alt={`${album.title} album cover`}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          onError={(e) => { (e.target as HTMLImageElement).src = CONFIG.ARTWORK_PLACEHOLDER; }}
          style={{
            borderRadius: 'var(--radius-lg)',
            objectFit: 'cover',
            display: 'block',
            width: size,
            height: size,
            boxShadow: 'var(--shadow-md)',
          }}
        />
        {album.year && (
          <span style={{
            position: 'absolute', bottom: 8, right: 8,
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
            color: '#fff', fontSize: 10, fontWeight: 500,
            padding: '2px 6px', borderRadius: 'var(--radius-sm)',
          }}>
            {album.year}
          </span>
        )}
      </div>
      <div>
        <p style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {album.title}
        </p>
        <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {album.artist}
          {album.trackCount ? ` · ${album.trackCount} tracks` : ''}
        </p>
      </div>
    </div>
  );
}

export const AlbumCard = React.memo(AlbumCardComponent);
