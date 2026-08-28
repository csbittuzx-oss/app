import { useState, useEffect } from 'react';
import type { Song, Playlist } from '../../data/models';
import { usePlayer } from '../../state/PlayerContext';
import {
  getPersonalizedTrending,
  getTodayBiggestHits,
  deduplicateSongs,
} from '../../data/repository/musicRepository';
import { getOfflineBackupPlaylist } from '../../services/OfflineBackupService';
import { CONTINUE_LISTENING_KEY } from '../../domain/player/AudioPlayer';

interface TVHomeScreenProps {
  onOpenPlaylist: (playlist: Playlist) => void;
  onOpenFullPlayer: () => void;
}

export function TVHomeScreen({ onOpenPlaylist, onOpenFullPlayer }: TVHomeScreenProps) {
  const { playSong } = usePlayer();

  const [continueSong, setContinueSong] = useState<Song | null>(null);
  const [trendingSongs, setTrendingSongs] = useState<Song[]>([]);
  const [madeForYou, setMadeForYou] = useState<Song[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [offlineSongs, setOfflineSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Load Continue Listening & Playlists from session
    try {
      const raw = localStorage.getItem(CONTINUE_LISTENING_KEY);
      if (raw) {
        const session = JSON.parse(raw);
        if (session && session.song) {
          setContinueSong(session.song);
        }
      }
      const rawPls = localStorage.getItem('sw_playlists');
      if (rawPls) setPlaylists(JSON.parse(rawPls));
    } catch {}

    // 2. Fetch live data
    async function loadData() {
      try {
        const defaultLangs = ['Hindi', 'International'];
        const [trending, mixes, offlinePl] = await Promise.all([
          getPersonalizedTrending(defaultLangs, 20).catch(() => []),
          getTodayBiggestHits(defaultLangs, 20).catch(() => []),
          getOfflineBackupPlaylist().catch(() => null),
        ]);

        setTrendingSongs(deduplicateSongs(trending));
        setMadeForYou(deduplicateSongs(mixes));

        if (offlinePl && Array.isArray(offlinePl.tracks)) {
          setOfflineSongs(offlinePl.tracks);
        }
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const featuredSong = continueSong || trendingSongs[0] || madeForYou[0];

  return (
    <div
      style={{
        flex: 1,
        width: '100%',
        height: '100%',
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: 'var(--tv-safe-top) var(--tv-safe-right) 100px var(--tv-safe-left)',
        display: 'flex',
        flexDirection: 'column',
        gap: '32px',
        boxSizing: 'border-box',
      }}
    >
      {/* ── Featured Hero Banner ── */}
      {featuredSong && (
        <div
          style={{
            position: 'relative',
            width: '100%',
            minHeight: '180px',
            borderRadius: '20px',
            overflow: 'hidden',
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.25), rgba(168, 85, 247, 0.15))',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            alignItems: 'center',
            padding: '24px 28px',
            gap: '24px',
            boxSizing: 'border-box',
          }}
        >
          <img
            src={featuredSong.artworkLg || featuredSong.artwork || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400'}
            alt={featuredSong.title}
            style={{
              width: 'clamp(110px, 12vw, 150px)',
              height: 'clamp(110px, 12vw, 150px)',
              borderRadius: '14px',
              objectFit: 'cover',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
              flexShrink: 0,
            }}
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  background: 'rgba(99, 102, 241, 0.3)',
                  color: '#A5B4FC',
                  fontSize: '11px',
                  fontWeight: 800,
                  padding: '3px 8px',
                  borderRadius: '6px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.8px',
                }}
              >
                {continueSong ? 'Continue Listening' : 'Featured Track'}
              </span>
            </div>

            <h1
              style={{
                fontSize: 'clamp(20px, 2.2vw, 28px)',
                fontWeight: 800,
                color: '#FFFFFF',
                margin: 0,
                lineHeight: 1.2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {featuredSong.title}
            </h1>

            <p
              style={{
                fontSize: 'clamp(13px, 1.3vw, 16px)',
                color: '#A1A1AA',
                margin: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {featuredSong.artist} {featuredSong.album ? `• ${featuredSong.album}` : ''}
            </p>

            <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
              <button
                id="tv-hero-play"
                data-tv-focus="true"
                data-tv-section="hero"
                tabIndex={0}
                onClick={() => {
                  playSong(featuredSong, continueSong ? [featuredSong] : trendingSongs);
                  onOpenFullPlayer();
                }}
                className="tv-focusable"
                style={{
                  background: 'var(--tv-accent)',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '10px 22px',
                  fontSize: '14px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  flexShrink: 0,
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                <span>Play Now</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Section: Trending Hits ── */}
      {trendingSongs.length > 0 && (
        <TVCarouselSection
          title="Trending Hits"
          sectionId="trending"
          songs={trendingSongs}
          onSelect={(song) => playSong(song, trendingSongs)}
        />
      )}

      {/* ── Section: Made For You ── */}
      {madeForYou.length > 0 && (
        <TVCarouselSection
          title="Made For You"
          sectionId="made_for_you"
          songs={madeForYou}
          onSelect={(song) => playSong(song, madeForYou)}
        />
      )}

      {/* ── Section: Curated Playlists ── */}
      {playlists.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
          <h2 style={{ fontSize: 'clamp(17px, 1.7vw, 22px)', fontWeight: 800, color: '#FFFFFF', margin: 0 }}>
            Featured Playlists
          </h2>
          <div className="tv-carousel-row" data-tv-section="playlists">
            {playlists.map((pl, idx) => (
              <div
                key={pl.id}
                id={`tv-playlist-${idx}`}
                data-tv-focus="true"
                data-tv-section="playlists"
                tabIndex={0}
                onClick={() => onOpenPlaylist(pl)}
                className="tv-song-card tv-focusable"
                style={{ width: 'clamp(160px, 16vw, 200px)' }}
              >
                <img
                  src={pl.artwork || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300'}
                  alt={pl.title}
                  className="tv-song-artwork"
                  style={{ height: '110px', objectFit: 'cover' }}
                />
                <span
                  style={{
                    fontSize: '14px',
                    fontWeight: 700,
                    color: '#FFFFFF',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {pl.title}
                </span>
                <span style={{ fontSize: '12px', color: '#A1A1AA' }}>
                  {pl.tracks ? `${pl.tracks.length} Songs` : 'Curated Mix'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Section: Offline Available ── */}
      {offlineSongs.length > 0 && (
        <TVCarouselSection
          title="Offline Storage & Cached Tracks"
          sectionId="offline_home"
          songs={offlineSongs}
          onSelect={(song) => playSong(song, offlineSongs)}
        />
      )}

      {loading && trendingSongs.length === 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '180px', color: '#A1A1AA' }}>
          <span>Loading music catalog...</span>
        </div>
      )}
    </div>
  );
}

function TVCarouselSection({
  title,
  sectionId,
  songs,
  onSelect,
}: {
  title: string;
  sectionId: string;
  songs: Song[];
  onSelect: (song: Song) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
      <h2 style={{ fontSize: 'clamp(17px, 1.7vw, 22px)', fontWeight: 800, color: '#FFFFFF', margin: 0 }}>
        {title}
      </h2>
      <div className="tv-carousel-row" data-tv-section={sectionId}>
        {songs.map((song, idx) => (
          <div
            key={`${sectionId}-${song.id}-${idx}`}
            id={`tv-${sectionId}-${idx}`}
            data-tv-focus="true"
            data-tv-section={sectionId}
            tabIndex={0}
            onClick={() => onSelect(song)}
            className="tv-song-card tv-focusable"
          >
            <img
              src={song.artworkLg || song.artwork || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300'}
              alt={song.title}
              className="tv-song-artwork"
              loading="lazy"
            />
            <span
              style={{
                fontSize: '14px',
                fontWeight: 700,
                color: '#FFFFFF',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {song.title}
            </span>
            <span
              style={{
                fontSize: '12px',
                color: '#A1A1AA',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {song.artist}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
