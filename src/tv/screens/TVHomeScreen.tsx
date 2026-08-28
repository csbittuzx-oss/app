import { useState, useEffect } from 'react';
import type { Song, Playlist, Album } from '../../data/models';
import { usePlayer } from '../../state/PlayerContext';
import {
  getPersonalizedTrending,
  getPersonalizedNewReleases,
  getTodayBiggestHits,
  getHappyHits,
  getPartyHits,
  getWorkoutHits,
  getDailyRecommendations,
  getPopularAlbums,
  deduplicateSongs,
} from '../../data/repository/musicRepository';
import { generateSpotifyStyleShelves } from '../../services/CuratedPlaylistsService';
import { getOfflineBackupPlaylist } from '../../services/OfflineBackupService';

interface TVHomeScreenProps {
  onOpenPlaylist: (playlist: Playlist) => void;
  onOpenFullPlayer: () => void;
}

export function TVHomeScreen({ onOpenPlaylist }: TVHomeScreenProps) {
  const { playSong } = usePlayer();

  // Content Shelves
  const [trendingSongs, setTrendingSongs] = useState<Song[]>([]);
  const [todayHits, setTodayHits] = useState<Song[]>([]);
  const [newReleases, setNewReleases] = useState<Song[]>([]);
  const [recommendedToday, setRecommendedToday] = useState<Song[]>([]);
  const [happyHits, setHappyHits] = useState<Song[]>([]);
  const [partyHits, setPartyHits] = useState<Song[]>([]);
  const [workoutHits, setWorkoutHits] = useState<Song[]>([]);
  const [curatedPlaylists, setCuratedPlaylists] = useState<Playlist[]>([]);
  const [popularAlbums, setPopularAlbums] = useState<Album[]>([]);
  const [offlineSongs, setOfflineSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadAllHomeContent() {
      try {
        const languages = ['Hindi', 'English', 'Punjabi', 'International'];

        const [
          trending,
          biggestHits,
          releases,
          dailyRecs,
          happy,
          party,
          workout,
          albums,
          shelves,
          offlinePl,
        ] = await Promise.allSettled([
          getPersonalizedTrending(languages, 20),
          getTodayBiggestHits(languages, 20),
          getPersonalizedNewReleases(languages, 20),
          getDailyRecommendations(languages, [], 20),
          getHappyHits(languages, 20),
          getPartyHits(languages, 20),
          getWorkoutHits(languages, 20),
          getPopularAlbums(languages, 14),
          generateSpotifyStyleShelves({
            languages,
            favorites: [],
            recentlyPlayed: [],
            searchRecentlyPlayed: [],
            userPlaylists: [],
            topArtists: [],
          }),
          getOfflineBackupPlaylist(),
        ]);

        if (!isMounted) return;

        if (trending.status === 'fulfilled' && trending.value) {
          setTrendingSongs(deduplicateSongs(trending.value).slice(0, 18));
        }

        if (biggestHits.status === 'fulfilled' && biggestHits.value) {
          setTodayHits(deduplicateSongs(biggestHits.value).slice(0, 18));
        }

        if (releases.status === 'fulfilled' && releases.value) {
          setNewReleases(deduplicateSongs(releases.value).slice(0, 18));
        }

        if (dailyRecs.status === 'fulfilled' && dailyRecs.value) {
          setRecommendedToday(deduplicateSongs(dailyRecs.value).slice(0, 18));
        }

        if (happy.status === 'fulfilled' && happy.value) {
          setHappyHits(deduplicateSongs(happy.value).slice(0, 18));
        }

        if (party.status === 'fulfilled' && party.value) {
          setPartyHits(deduplicateSongs(party.value).slice(0, 18));
        }

        if (workout.status === 'fulfilled' && workout.value) {
          setWorkoutHits(deduplicateSongs(workout.value).slice(0, 18));
        }

        if (albums.status === 'fulfilled' && albums.value) {
          setPopularAlbums(albums.value.slice(0, 14));
        }

        if (shelves.status === 'fulfilled' && shelves.value) {
          const pls: Playlist[] = [];
          for (const s of shelves.value) {
            if (s && s.playlists) pls.push(...s.playlists);
          }
          setCuratedPlaylists(pls.slice(0, 16));
        }

        if (offlinePl.status === 'fulfilled' && offlinePl.value?.tracks) {
          setOfflineSongs(offlinePl.value.tracks);
        }
      } catch (e) {
        console.warn('[TVHomeScreen] Error loading content:', e);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadAllHomeContent();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div
      style={{
        flex: 1,
        width: '100%',
        height: '100%',
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: 'var(--tv-safe-top) var(--tv-safe-right) 60px var(--tv-safe-left)',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        boxSizing: 'border-box',
      }}
    >
      {/* ── Section: Trending Hits ── */}
      {trendingSongs.length > 0 && (
        <TVSongSection
          title="Trending Hits"
          subtitle="Top tracks trending today"
          sectionId="trending"
          songs={trendingSongs}
          onSelect={(song) => playSong(song, trendingSongs)}
        />
      )}

      {/* ── Section: Today's Biggest Hits ── */}
      {todayHits.length > 0 && (
        <TVSongSection
          title="Today's Biggest Hits"
          subtitle="The most streamed chart toppers"
          sectionId="biggest_hits"
          songs={todayHits}
          onSelect={(song) => playSong(song, todayHits)}
        />
      )}

      {/* ── Section: Recommended For Today ── */}
      {recommendedToday.length > 0 && (
        <TVSongSection
          title="Recommended For You"
          subtitle="Fresh daily mixes crafted for your taste"
          sectionId="recommended_today"
          songs={recommendedToday}
          onSelect={(song) => playSong(song, recommendedToday)}
        />
      )}

      {/* ── Section: New Releases ── */}
      {newReleases.length > 0 && (
        <TVSongSection
          title="New Releases"
          subtitle="Brand new singles & album drops"
          sectionId="new_releases"
          songs={newReleases}
          onSelect={(song) => playSong(song, newReleases)}
        />
      )}

      {/* ── Section: Curated Playlists ── */}
      {curatedPlaylists.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#FFFFFF', margin: 0 }}>
              Curated Playlists & Top Mixes
            </h2>
            <span style={{ fontSize: '11px', color: '#71717A' }}>Handcrafted collections and mixes</span>
          </div>
          <div className="tv-carousel-row" data-tv-section="curated_playlists">
            {curatedPlaylists.map((pl, idx) => (
              <div
                key={`tv-pl-${pl.id}-${idx}`}
                id={`tv-pl-${idx}`}
                data-tv-focus="true"
                data-tv-section="curated_playlists"
                tabIndex={0}
                onClick={() => onOpenPlaylist(pl)}
                className="tv-song-card tv-focusable"
              >
                <img
                  src={pl.artwork || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300'}
                  alt={pl.title}
                  className="tv-song-artwork"
                  loading="lazy"
                />
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#F4F4F5',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {pl.title}
                </span>
                <span style={{ fontSize: '10px', color: '#71717A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {pl.tracks ? `${pl.tracks.length} Songs` : 'Curated Mix'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Section: Happy Hits ── */}
      {happyHits.length > 0 && (
        <TVSongSection
          title="Feel Good Vibes & Happy Hits"
          subtitle="Upbeat songs to boost your energy"
          sectionId="happy_hits"
          songs={happyHits}
          onSelect={(song) => playSong(song, happyHits)}
        />
      )}

      {/* ── Section: Party Hits ── */}
      {partyHits.length > 0 && (
        <TVSongSection
          title="Party & Club Anthems"
          subtitle="High energy beats for the weekend"
          sectionId="party_hits"
          songs={partyHits}
          onSelect={(song) => playSong(song, partyHits)}
        />
      )}

      {/* ── Section: Workout Hits ── */}
      {workoutHits.length > 0 && (
        <TVSongSection
          title="Workout & High Energy"
          subtitle="Power tracks to keep you moving"
          sectionId="workout_hits"
          songs={workoutHits}
          onSelect={(song) => playSong(song, workoutHits)}
        />
      )}

      {/* ── Section: Popular Albums ── */}
      {popularAlbums.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#FFFFFF', margin: 0 }}>
              Trending Albums
            </h2>
            <span style={{ fontSize: '11px', color: '#71717A' }}>Top studio records and soundtracks</span>
          </div>
          <div className="tv-carousel-row" data-tv-section="popular_albums">
            {popularAlbums.map((alb, idx) => (
              <div
                key={`tv-alb-${alb.id}-${idx}`}
                id={`tv-alb-${idx}`}
                data-tv-focus="true"
                data-tv-section="popular_albums"
                tabIndex={0}
                onClick={() => {
                  if (alb.tracks && alb.tracks.length > 0) {
                    playSong(alb.tracks[0], alb.tracks, 0);
                  }
                }}
                className="tv-song-card tv-focusable"
              >
                <img
                  src={alb.artwork || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300'}
                  alt={alb.title}
                  className="tv-song-artwork"
                  loading="lazy"
                />
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#F4F4F5',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {alb.title}
                </span>
                <span style={{ fontSize: '10px', color: '#71717A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {alb.artist || 'Various Artists'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Section: Offline Storage ── */}
      {offlineSongs.length > 0 && (
        <TVSongSection
          title="Offline Storage & Cached Music"
          subtitle="Instant playback without internet connection"
          sectionId="offline_home"
          songs={offlineSongs}
          onSelect={(song) => playSong(song, offlineSongs)}
        />
      )}

      {loading && trendingSongs.length === 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '160px', color: '#71717A', fontSize: '13px' }}>
          <span>Loading music catalog...</span>
        </div>
      )}
    </div>
  );
}

function TVSongSection({
  title,
  subtitle,
  sectionId,
  songs,
  onSelect,
}: {
  title: string;
  subtitle?: string;
  sectionId: string;
  songs: Song[];
  onSelect: (song: Song) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#FFFFFF', margin: 0 }}>
          {title}
        </h2>
        {subtitle && <span style={{ fontSize: '11px', color: '#71717A' }}>{subtitle}</span>}
      </div>
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
                fontSize: '12px',
                fontWeight: 600,
                color: '#F4F4F5',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {song.title}
            </span>
            <span
              style={{
                fontSize: '10px',
                color: '#71717A',
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
