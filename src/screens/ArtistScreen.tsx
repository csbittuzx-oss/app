import { useEffect, useState } from 'react';
import { useApp } from '../state/AppContext';
import { usePlayer } from '../state/PlayerContext';
import { getArtistDetails } from '../data/repository/musicRepository';
import { getArtistProfileImageSync, getArtistAvatarPlaceholder } from '../services/ArtistProfileService';
import type { Artist, Song } from '../data/models';
import { SongCard } from '../components/cards/SongCard';
import { ArtistCard } from '../components/cards/ArtistCard';
import { SkeletonList } from '../components/shared/SkeletonCard';
import { ErrorState } from '../components/shared/ErrorState';
import { formatNumber } from '../core/utils';

import { resizeImageUrl } from '../core/utils/imageUtils';

export function ArtistScreen() {
  const { nav: { nav, goBack }, isFavoriteArtist, toggleFavoriteArtist } = useApp();
  const { playSong: _playSong, state: playerState } = usePlayer();
  const hasMiniPlayer = Boolean(playerState.currentSong);
  const artistName = String(nav.params?.artistName || '');
  const initialArtist = nav.params?.artist as Artist | undefined;

  const [artist, setArtist] = useState<Artist | null>(initialArtist || null);
  const [topTracks, setTopTracks] = useState<Song[]>([]);
  const [similarArtists, setSimilarArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    getArtistDetails(artistName)
      .then(({ artist: a, topTracks: t, similarArtists: s }) => {
        setArtist(a);
        setTopTracks(t);
        setSimilarArtists(s);
        setLoading(false);
      })
      .catch(() => { setError(true); setLoading(false); });
  }, [artistName]);

  const isFollowed = artist ? isFavoriteArtist(artist.id) : false;
  const rawHeroPhoto = artist?.profileImage || artist?.image || getArtistProfileImageSync(artistName);
  const heroPhoto = resizeImageUrl(rawHeroPhoto, 1200, 1200);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Back button */}
      <div style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 8px)', left: 8, zIndex: 10 }}>
        <button
          id="artist-back-btn"
          aria-label="Go back"
          onClick={goBack}
          style={{
            width: 40, height: 40, borderRadius: '50%',
            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)',
            border: '1px solid var(--color-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#fff',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      <div
        className="scroll-area"
        style={{
          flex: 1,
          paddingBottom: hasMiniPlayer
            ? 'calc(72px + env(safe-area-inset-bottom, 0px) + 12px)'
            : 'calc(env(safe-area-inset-bottom, 0px) + 20px)',
        }}
      >
        {error ? (
          <ErrorState type="api" onRetry={() => { setError(false); setLoading(true); getArtistDetails(artistName).then(({ artist: a, topTracks: t, similarArtists: s }) => { setArtist(a); setTopTracks(t); setSimilarArtists(s); setLoading(false); }).catch(() => { setError(true); setLoading(false); }); }} />
        ) : (
          <>
            {/* Hero */}
            <div style={{ position: 'relative', height: 260 }}>
              <img
                src={heroPhoto}
                alt={artist?.name ? `${artist.name} photo` : 'Artist photo'}
                loading="eager"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = getArtistAvatarPlaceholder(artist?.name || artistName);
                }}
                style={{ width: '100%', height: 260, objectFit: 'cover', display: 'block' }}
              />
              {/* gradient overlay */}
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.6) 65%, var(--color-bg) 100%)',
              }} aria-hidden="true" />
              {/* Artist name */}
              <div style={{ position: 'absolute', bottom: 16, left: 20, right: 20 }}>
                {loading && !artist ? (
                  <div className="skeleton" style={{ height: 32, width: '60%', borderRadius: 6 }} />
                ) : (
                  <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)', color: '#fff', textShadow: '0 2px 10px rgba(0,0,0,0.7)', lineHeight: 1.15, fontWeight: 800 }}>
                    {artist?.name || artistName}
                  </h1>
                )}
              </div>
            </div>

            <div style={{ padding: '12px 20px 0' }}>
              {/* Meta + Follow */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  {artist?.followerCount && (
                    <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                      {formatNumber(artist.followerCount)} listeners
                    </p>
                  )}
                  {artist?.genre && (
                    <p style={{ margin: '2px 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                      {artist.genre}
                    </p>
                  )}
                </div>
                {artist && (
                  <button
                    id="artist-follow-btn"
                    aria-label={isFollowed ? 'Unfollow artist' : 'Follow artist'}
                    aria-pressed={isFollowed}
                    onClick={() => toggleFavoriteArtist(artist)}
                    style={{
                      background: isFollowed ? 'var(--color-accent)' : 'transparent',
                      color: isFollowed ? 'var(--color-accent-on)' : 'var(--color-accent)',
                      border: '1.5px solid var(--color-accent)',
                      borderRadius: 'var(--radius-full)',
                      padding: '8px 20px',
                      fontSize: 'var(--text-sm)', fontWeight: 600,
                      cursor: 'pointer', fontFamily: 'var(--font-body)',
                      transition: 'all 200ms var(--ease-standard)',
                    }}
                  >
                    {isFollowed ? 'Following' : 'Follow'}
                  </button>
                )}
              </div>

              {/* Tags */}
              {artist?.tags && artist.tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                  {artist.tags.slice(0, 6).map((t) => (
                    <span key={t} style={{
                      fontSize: '11px',
                      padding: '3px 10px',
                      borderRadius: 999,
                      background: 'rgba(255,255,255,0.06)',
                      color: 'var(--color-text-secondary)',
                      border: '1px solid var(--color-border)',
                    }}>
                      #{t}
                    </span>
                  ))}
                </div>
              )}

              {/* Bio */}
              {artist?.bio && (
                <div style={{ marginBottom: 20 }}>
                  <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                    {artist.bio}
                  </p>
                </div>
              )}

              {/* Top tracks */}
              <h2 style={{ margin: '0 0 10px', fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                Popular Tracks
              </h2>
              {loading ? (
                <SkeletonList count={5} />
              ) : topTracks.length === 0 ? (
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>No tracks found.</p>
              ) : (
                topTracks.map((song, i) => (
                  <SongCard key={song.id} song={song} queue={topTracks} index={i} showIndex />
                ))
              )}

              {/* Similar artists */}
              {similarArtists.length > 0 && (
                <>
                  <h2 style={{ margin: '24px 0 12px', fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                    Similar Artists
                  </h2>
                  <div className="scroll-x">
                    {similarArtists.map(a => (
                      <ArtistCard key={a.id} artist={a} size={72} />
                    ))}
                  </div>
                </>
              )}
            </div>

            <div style={{ height: 24 }} />
          </>
        )}
      </div>
    </div>
  );
}
