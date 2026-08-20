import { useEffect, useState } from 'react';
import { useApp } from '../state/AppContext';
import { usePlayer } from '../state/PlayerContext';
import { getAlbumTracks } from '../data/repository/musicRepository';
import { lastFmRepository } from '../data/repository/lastfmRepository';
import type { LastFmAlbumInfo } from '../data/api/lastfmApi';
import type { Song } from '../data/models';
import { SongCard } from '../components/cards/SongCard';
import { SkeletonList } from '../components/shared/SkeletonCard';
import { ErrorState } from '../components/shared/ErrorState';
import { formatDuration } from '../core/utils';
import { CONFIG } from '../config';
import { resizeImageUrl } from '../core/utils/imageUtils';

export function AlbumScreen() {
  const { nav: { nav, goBack } } = useApp();
  const { playSong } = usePlayer();

  const albumId = String(nav.params?.albumId || '');
  const albumTitle = String(nav.params?.albumTitle || 'Album');
  const albumArtist = String(nav.params?.albumArtist || '');

  const [tracks, setTracks] = useState<Song[]>([]);
  const [albumWiki, setAlbumWiki] = useState<LastFmAlbumInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const rawArtwork = tracks[0]?.artworkLg || tracks[0]?.artwork;
  const artwork = resizeImageUrl(rawArtwork, 1200, 1200) || CONFIG.ARTWORK_PLACEHOLDER;
  const totalDuration = tracks.reduce((sum, s) => sum + s.duration, 0);
  const year = tracks[0]?.year;

  useEffect(() => {
    if (!albumId) return;
    setLoading(true);
    setError(false);
    getAlbumTracks(albumId)
      .then(t => { setTracks(t); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });

    if (albumArtist && albumTitle) {
      lastFmRepository.getAlbumInfo(albumArtist, albumTitle).then(info => {
        if (info) setAlbumWiki(info);
      }).catch(() => {});
    }
  }, [albumId, albumArtist, albumTitle]);

  const handlePlay = () => { if (tracks.length) playSong(tracks[0], tracks, 0); };
  const handleShuffle = () => {
    if (!tracks.length) return;
    const idx = Math.floor(Math.random() * tracks.length);
    playSong(tracks[idx], tracks, idx);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Back */}
      <div style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top,0px) + 8px)', left: 8, zIndex: 10 }}>
        <button id="album-back-btn" aria-label="Go back" onClick={goBack} style={{
          width: 40, height: 40, borderRadius: '50%',
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)',
          border: '1px solid var(--color-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: '#fff',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      <div className="scroll-area" style={{ flex: 1, paddingBottom: 'var(--content-bottom-pad)' }}>
        {/* Album header */}
        <div style={{ padding: '60px 20px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <img
            src={artwork}
            alt={`${albumTitle} album artwork`}
            loading="eager"
            onError={(e) => { (e.target as HTMLImageElement).src = CONFIG.ARTWORK_PLACEHOLDER; }}
            style={{
              width: 200, height: 200, borderRadius: 'var(--radius-xl)',
              objectFit: 'cover', boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
              border: '1px solid var(--color-border)',
            }}
          />
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ margin: '0 0 4px', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xl)', color: 'var(--color-text-primary)' }}>
              {albumTitle}
            </h1>
            <p style={{ margin: 0, fontSize: 'var(--text-base)', color: 'var(--color-text-secondary)' }}>
              {albumArtist}
            </p>
            <p style={{ margin: '4px 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              {year && `${year} · `}{tracks.length} tracks{totalDuration > 0 && ` · ${formatDuration(totalDuration)}`}
            </p>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
            <button id="album-play-btn" aria-label="Play album" onClick={handlePlay} className="btn btn-primary" style={{ padding: '10px 28px', gap: 8 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              Play
            </button>
            <button id="album-shuffle-btn" aria-label="Shuffle album" onClick={handleShuffle} className="btn btn-ghost" style={{
              padding: '10px 20px', gap: 8,
              border: '1.5px solid var(--color-border)',
              borderRadius: 'var(--radius-full)',
              color: 'var(--color-text-secondary)',
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <polyline points="16 3 21 3 21 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                <line x1="4" y1="20" x2="21" y2="3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                <polyline points="21 16 21 21 16 21" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                <line x1="15" y1="9" x2="21" y2="15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                <line x1="4" y1="4" x2="9" y2="9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Shuffle
            </button>
          </div>
        </div>

        {/* Album Backstory / Wiki (Last.fm) */}
        {albumWiki?.summary && (
          <div style={{ margin: '0 20px 20px', padding: '14px 16px', background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
              About this Album
            </h3>
            <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
              {albumWiki.summary}
            </p>
            {albumWiki.tags && albumWiki.tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                {albumWiki.tags.slice(0, 5).map(tag => (
                  <span key={tag} style={{
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: 'rgba(255,255,255,0.06)',
                    color: 'var(--color-text-muted)',
                    border: '1px solid var(--color-border)'
                  }}>
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Track list */}
        <div style={{ padding: '0 20px' }}>
          {error ? (
            <ErrorState type="api" message="Couldn't load tracks for this album." />
          ) : loading ? (
            <SkeletonList count={8} />
          ) : tracks.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 32 }}>No tracks available.</p>
          ) : (
            tracks.map((song, i) => (
              <SongCard key={song.id} song={song} queue={tracks} index={i} showIndex />
            ))
          )}
        </div>
        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}
