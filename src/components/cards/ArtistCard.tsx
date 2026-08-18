import type { Artist } from '../../data/models';
import { useApp } from '../../state/AppContext';
import { getArtistProfileImageSync, getArtistAvatarPlaceholder } from '../../services/ArtistProfileService';
import { resizeImageUrl } from '../../core/utils/imageUtils';

interface ArtistCardProps {
  artist: Artist;
  size?: number;
  onClick?: (artist: Artist) => void;
}

export function ArtistCard({ artist, size = 80, onClick }: ArtistCardProps) {
  const { nav: { navigate }, isFavoriteArtist } = useApp();

  const handleClick = () => {
    if (onClick) { onClick(artist); return; }
    navigate('artist', { artistName: artist.name, artist });
  };

  const isFollowed = isFavoriteArtist(artist.id);
  const rawPhotoUrl = artist.profileImage || artist.image || getArtistProfileImageSync(artist.name);
  const photoUrl = resizeImageUrl(rawPhotoUrl, 544, 544);

  return (
    <div
      id={`artist-card-${artist.id}`}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 8, width: size + 16, flexShrink: 0, cursor: 'pointer',
      }}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label={`View artist ${artist.name}`}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
    >
      <div style={{ position: 'relative' }}>
        <img
          src={photoUrl}
          alt={`${artist.name} photo`}
          width={size}
          height={size}
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).src = getArtistAvatarPlaceholder(artist.name);
          }}
          style={{
            borderRadius: '50%',
            objectFit: 'cover',
            display: 'block',
            width: size,
            height: size,
            border: isFollowed ? '2.5px solid var(--color-accent)' : '2px solid var(--color-border)',
            boxShadow: isFollowed ? 'var(--shadow-accent)' : '0 4px 12px rgba(0,0,0,0.3)',
            transition: 'border-color 200ms var(--ease-standard), transform 150ms ease',
          }}
        />
        {isFollowed && (
          <div style={{
            position: 'absolute', bottom: 0, right: 0,
            width: 20, height: 20, borderRadius: '50%',
            background: 'var(--color-accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid var(--color-bg)',
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" stroke="var(--color-accent-on)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        )}
      </div>
      <div style={{ textAlign: 'center', width: '100%' }}>
        <p style={{
          margin: 0, fontSize: 'var(--text-xs)', fontWeight: 600,
          color: 'var(--color-text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          maxWidth: size + 16,
          letterSpacing: '-0.01em',
        }}>
          {artist.name}
        </p>
      </div>
    </div>
  );
}
