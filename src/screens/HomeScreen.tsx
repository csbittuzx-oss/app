import { useEffect, useState, useMemo, useCallback } from 'react';
import { useApp } from '../state/AppContext';
import { usePlayer } from '../state/PlayerContext';
import {
  getPersonalizedTrending,
  getPersonalizedNewReleases,
  getDailyRecommendations,
  getMoreLikeWhatYouLike,
  getHappyHits,
  getPartyHits,
  getThrowbackHits,
  getPersonalizedTracksByLanguage,
  getPersonalizedArtists,
  LANGUAGE_METADATA,
} from '../data/repository/musicRepository';
import { userProfileTracker } from '../domain/recommendation/UserProfileTracker';
import type { Song, Artist } from '../data/models';
import { SongSquareCard } from '../components/cards/SongCard';
import { ArtistCard } from '../components/cards/ArtistCard';
import { SkeletonGrid } from '../components/shared/SkeletonCard';
import { ErrorState } from '../components/shared/ErrorState';
import { getGreeting } from '../core/utils';
import { CONFIG } from '../config';

interface Section {
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
  songs: Song[];
  loading: boolean;
  error: boolean;
}

const HOME_CACHE_KEY = 'sw_home_sections_cache';
const ARTISTS_CACHE_KEY = 'sw_home_artists_cache';

function getCachedSections(): Section[] | null {
  try {
    const raw = localStorage.getItem(HOME_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((s: Section) => ({ ...s, loading: false, error: false }));
      }
    }
  } catch {}
  return null;
}

function getCachedArtists(): Artist[] | null {
  try {
    const raw = localStorage.getItem(ARTISTS_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return null;
}

export function HomeScreen() {
  const { state: appState, nav: { navigate } } = useApp();
  const { playSong } = usePlayer();
  const [sections, setSections] = useState<Section[]>(() => getCachedSections() || []);
  const [topArtists, setTopArtists] = useState<Artist[]>(() => getCachedArtists() || []);
  const [artistsLoading, setArtistsLoading] = useState(() => !getCachedArtists());

  const languages = appState.musicLanguages && appState.musicLanguages.length > 0
    ? appState.musicLanguages
    : ['Hindi', 'International'];

  // Top artists from user profile intelligence
  const userTopArtists = useMemo(() => {
    return userProfileTracker.getTopArtists(5);
  }, [appState.recentlyPlayed.length]);

  // Jump In Back tracks: combine recently played, search recents, and playlist tracks
  const jumpInBackTracks = useMemo(() => {
    const combined: Song[] = [];
    const seenIds = new Set<string>();

    // 1. Partial/Recent tracks
    [...appState.recentlyPlayed, ...appState.searchRecentlyPlayed].forEach((s) => {
      if (!seenIds.has(s.id)) {
        seenIds.add(s.id);
        combined.push(s);
      }
    });

    // 2. Tracks from custom playlists
    appState.userPlaylists.forEach((pl) => {
      pl.tracks.forEach((s) => {
        if (!seenIds.has(s.id)) {
          seenIds.add(s.id);
          combined.push(s);
        }
      });
    });

    return combined.slice(0, 16);
  }, [appState.recentlyPlayed, appState.searchRecentlyPlayed, appState.userPlaylists]);

  const loadFeed = useCallback((forceRefresh = false) => {
    const isOffline = !navigator.onLine;

    // If offline, maintain the exact existing cached content without reloading skeletons
    if (isOffline && !forceRefresh) {
      const cached = getCachedSections();
      if (cached && cached.length > 0) {
        setSections(cached);
        const cachedArts = getCachedArtists();
        if (cachedArts) setTopArtists(cachedArts);
        setArtistsLoading(false);
        return;
      }
    }

    const defaultInitialSections: Section[] = [
      { id: 'trending', title: 'Trending Now', subtitle: 'What listeners are loving right now', songs: [], loading: true, error: false },
      { id: 'new_releases', title: 'New Releases', subtitle: 'Fresh drops in your languages', songs: [], loading: true, error: false },
      { id: 'daily_rec', title: 'Recommendation for Today', subtitle: 'Fresh personalized mix for you', badge: 'Daily Mix', songs: [], loading: true, error: false },
      { id: 'more_like_you', title: 'More Like What You Like', subtitle: 'Based on your favorite artists & plays', songs: [], loading: true, error: false },
      { id: 'happy', title: 'Happy', subtitle: 'Upbeat, feel-good & positive vibes', songs: [], loading: true, error: false },
      { id: 'party', title: 'Party', subtitle: 'High-energy dance & club hits', songs: [], loading: true, error: false },
      { id: 'throwback', title: 'Throwback', subtitle: 'Timeless classics & golden nostalgia', songs: [], loading: true, error: false },
      ...languages.map((lang) => ({
        id: `lang_${lang}`,
        title: LANGUAGE_METADATA[lang]?.title || `${lang} Hits`,
        subtitle: `Top songs in ${lang}`,
        songs: [],
        loading: true,
        error: false,
      })),
    ];

    setSections((prev) => {
      if (prev.length > 0) return prev; // Keep existing visible content while fetching
      return defaultInitialSections;
    });

    function loadSection(id: string, fetcher: () => Promise<Song[]>) {
      fetcher()
        .then((songs) => {
          setSections((prev) => {
            const next = prev.map((s) => (s.id === id ? { ...s, songs, loading: false } : s));
            // Cache populated sections for offline resilience
            try {
              const withData = next.filter((s) => s.songs && s.songs.length > 0);
              if (withData.length > 0) {
                localStorage.setItem(HOME_CACHE_KEY, JSON.stringify(withData));
              }
            } catch {}
            return next;
          });
        })
        .catch(() => {
          setSections((prev) => prev.map((s) => (s.id === id ? { ...s, loading: false, error: !isOffline } : s)));
        });
    }

    // 1. Trending Now
    loadSection('trending', () => getPersonalizedTrending(languages, 16));

    // 2. New Releases
    loadSection('new_releases', () => getPersonalizedNewReleases(languages, 16));

    // 3. Recommendation for Today
    loadSection('daily_rec', () => getDailyRecommendations(languages, userTopArtists, 16));

    // 4. More Like What You Like
    loadSection('more_like_you', () => getMoreLikeWhatYouLike(languages, userTopArtists, 16));

    // 5. Happy
    loadSection('happy', () => getHappyHits(languages, 16));

    // 6. Party
    loadSection('party', () => getPartyHits(languages, 16));

    // 7. Throwback
    loadSection('throwback', () => getThrowbackHits(languages, 16));

    // 8. Language-specific deep dives
    languages.forEach((lang) => {
      loadSection(`lang_${lang}`, () => getPersonalizedTracksByLanguage(lang, 16));
    });

    // 9. Personalized Artists
    if (!isOffline || forceRefresh) {
      setArtistsLoading(true);
      getPersonalizedArtists(languages, 12)
        .then((artists) => {
          setTopArtists(artists);
          try {
            localStorage.setItem(ARTISTS_CACHE_KEY, JSON.stringify(artists));
          } catch {}
        })
        .catch(() => {})
        .finally(() => setArtistsLoading(false));
    }
  }, [languages.join(','), userTopArtists.join(',')]);

  useEffect(() => {
    loadFeed();

    // Listen for online restored event to seamlessly refresh recommendations
    const handleOnlineRestored = () => {
      loadFeed(true);
    };

    window.addEventListener('sw_online_restored', handleOnlineRestored);
    return () => {
      window.removeEventListener('sw_online_restored', handleOnlineRestored);
    };
  }, [loadFeed]);

  function retrySection(id: string) {
    if (!navigator.onLine) return;
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, loading: true, error: false } : s)));
    if (id === 'trending') {
      getPersonalizedTrending(languages, 16).then((songs) => setSections((prev) => prev.map((s) => (s.id === id ? { ...s, songs, loading: false } : s))));
    } else if (id === 'new_releases') {
      getPersonalizedNewReleases(languages, 16).then((songs) => setSections((prev) => prev.map((s) => (s.id === id ? { ...s, songs, loading: false } : s))));
    } else if (id === 'daily_rec') {
      getDailyRecommendations(languages, userTopArtists, 16).then((songs) => setSections((prev) => prev.map((s) => (s.id === id ? { ...s, songs, loading: false } : s))));
    } else if (id === 'more_like_you') {
      getMoreLikeWhatYouLike(languages, userTopArtists, 16).then((songs) => setSections((prev) => prev.map((s) => (s.id === id ? { ...s, songs, loading: false } : s))));
    } else if (id === 'happy') {
      getHappyHits(languages, 16).then((songs) => setSections((prev) => prev.map((s) => (s.id === id ? { ...s, songs, loading: false } : s))));
    } else if (id === 'party') {
      getPartyHits(languages, 16).then((songs) => setSections((prev) => prev.map((s) => (s.id === id ? { ...s, songs, loading: false } : s))));
    } else if (id === 'throwback') {
      getThrowbackHits(languages, 16).then((songs) => setSections((prev) => prev.map((s) => (s.id === id ? { ...s, songs, loading: false } : s))));
    } else if (id.startsWith('lang_')) {
      const lang = id.replace('lang_', '');
      getPersonalizedTracksByLanguage(lang, 16).then((songs) => setSections((prev) => prev.map((s) => (s.id === id ? { ...s, songs, loading: false } : s))));
    }
  }

  const greeting = getGreeting();
  const visibleContinueListening = appState.recentlyPlayed.slice(0, 8);

  const trendingSection = sections.find((s) => s.id === 'trending');
  const newReleasesSection = sections.find((s) => s.id === 'new_releases');
  const dailyRecSection = sections.find((s) => s.id === 'daily_rec');
  const moreLikeYouSection = sections.find((s) => s.id === 'more_like_you');
  const happySection = sections.find((s) => s.id === 'happy');
  const partySection = sections.find((s) => s.id === 'party');
  const throwbackSection = sections.find((s) => s.id === 'throwback');
  const langSections = sections.filter((s) => s.id.startsWith('lang_'));

  return (
    <div className="scroll-area" style={{ paddingBottom: 'var(--content-bottom-pad)' }}>
      {/* ── Header ── */}
      <header style={{ padding: '20px 20px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img
            src="/logo.png"
            alt="Soundwave Logo"
            width={40}
            height={40}
            style={{ borderRadius: 'var(--radius-md)', objectFit: 'cover', border: '1px solid var(--color-border)' }}
          />
          <div>
            <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
              {greeting}
            </p>
            <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', color: 'var(--color-text-primary)', lineHeight: 1.2 }}>
              Soundwave
            </h1>
          </div>
        </div>
        <div style={{
          width: 38, height: 38, borderRadius: '50%',
          overflow: 'hidden',
          border: '1.5px solid var(--color-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
          background: 'var(--color-surface-2)',
        }}
          aria-label="Settings"
          role="button"
          tabIndex={0}
          onClick={() => navigate('settings')}
          onKeyDown={(e) => e.key === 'Enter' && navigate('settings')}
        >
          <img
            src="/logo.png"
            alt="Profile"
            width={38}
            height={38}
            style={{ objectFit: 'cover' }}
          />
        </div>
      </header>

      {/* ── Quick Access: Liked Songs ── */}
      {appState.favorites.length > 0 && (
        <section style={{ padding: '16px 20px 0' }} aria-label="Favorites">
          <h2 style={{ margin: '0 0 10px', fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Liked Songs
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
            }}
          >
            {appState.favorites.slice(0, 4).map((song) => (
              <button
                key={song.id}
                id={`quick-fav-${song.id}`}
                onClick={() => playSong(song, appState.favorites, appState.favorites.indexOf(song))}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: 'var(--color-card)', borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)', padding: '8px 12px 8px 8px',
                  cursor: 'pointer', overflow: 'hidden',
                  transition: 'background 150ms var(--ease-standard)',
                  textAlign: 'left',
                }}
                aria-label={`Play ${song.title}`}
              >
                <img
                  src={song.artwork}
                  alt="" width={36} height={36}
                  loading="lazy"
                  onError={(e) => { (e.target as HTMLImageElement).src = CONFIG.ARTWORK_PLACEHOLDER; }}
                  style={{ borderRadius: 6, objectFit: 'cover', flexShrink: 0 }}
                />
                <span style={{
                  fontSize: 'var(--text-xs)', fontWeight: 600,
                  color: 'var(--color-text-primary)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {song.title}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── 1. Continue Listening (Top) ── */}
      {visibleContinueListening.length > 0 && (
        <HorizontalSection
          title="Continue Listening"
          songs={visibleContinueListening}
          loading={false}
          error={false}
        />
      )}

      {/* ── 2. Trending Now (Top) ── */}
      {trendingSection && (
        <HorizontalSection
          title={trendingSection.title}
          subtitle={trendingSection.subtitle}
          songs={trendingSection.songs}
          loading={trendingSection.loading}
          error={trendingSection.error}
          onRetry={() => retrySection('trending')}
        />
      )}

      {/* ── 3. New Releases (Top) ── */}
      {newReleasesSection && (
        <HorizontalSection
          title={newReleasesSection.title}
          subtitle={newReleasesSection.subtitle}
          songs={newReleasesSection.songs}
          loading={newReleasesSection.loading}
          error={newReleasesSection.error}
          onRetry={() => retrySection('new_releases')}
        />
      )}

      {/* ── 4. Recommendation for Today (Daily Fresh Mix) ── */}
      {dailyRecSection && (
        <HorizontalSection
          title={dailyRecSection.title}
          subtitle={dailyRecSection.subtitle}
          badge={dailyRecSection.badge}
          songs={dailyRecSection.songs}
          loading={dailyRecSection.loading}
          error={dailyRecSection.error}
          onRetry={() => retrySection('daily_rec')}
        />
      )}

      {/* ── 5. Jump In Back (Resume Recent & Started Music) ── */}
      {jumpInBackTracks.length > 0 && (
        <HorizontalSection
          title="Jump In Back"
          subtitle="Pick up where you left off"
          songs={jumpInBackTracks}
          loading={false}
          error={false}
        />
      )}

      {/* ── 6. More Like What You Like ── */}
      {moreLikeYouSection && (
        <HorizontalSection
          title={moreLikeYouSection.title}
          subtitle={moreLikeYouSection.subtitle}
          songs={moreLikeYouSection.songs}
          loading={moreLikeYouSection.loading}
          error={moreLikeYouSection.error}
          onRetry={() => retrySection('more_like_you')}
        />
      )}

      {/* ── 7. Happy (Upbeat & Feel-Good) ── */}
      {happySection && (
        <HorizontalSection
          title={happySection.title}
          subtitle={happySection.subtitle}
          songs={happySection.songs}
          loading={happySection.loading}
          error={happySection.error}
          onRetry={() => retrySection('happy')}
        />
      )}

      {/* ── 8. Party (High-Energy Dance / Club) ── */}
      {partySection && (
        <HorizontalSection
          title={partySection.title}
          subtitle={partySection.subtitle}
          songs={partySection.songs}
          loading={partySection.loading}
          error={partySection.error}
          onRetry={() => retrySection('party')}
        />
      )}

      {/* ── 9. Throwback (Nostalgic 90s/2000s Classics) ── */}
      {throwbackSection && (
        <HorizontalSection
          title={throwbackSection.title}
          subtitle={throwbackSection.subtitle}
          songs={throwbackSection.songs}
          loading={throwbackSection.loading}
          error={throwbackSection.error}
          onRetry={() => retrySection('throwback')}
        />
      )}

      {/* ── 10. Popular Artists (Personalized) ── */}
      <section style={{ padding: '24px 0 0' }} aria-label="Popular artists">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px 12px' }}>
          <h2 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Popular Artists
          </h2>
        </div>
        {artistsLoading ? (
          <div className="scroll-x" style={{ padding: '0 20px' }}>
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: 96, flexShrink: 0 }}>
                <div className="skeleton" style={{ width: 80, height: 80, borderRadius: '50%' }} />
                <div className="skeleton" style={{ height: 11, width: 60, borderRadius: 4 }} />
              </div>
            ))}
          </div>
        ) : topArtists.length > 0 ? (
          <div className="scroll-x" style={{ padding: '0 20px' }}>
            {topArtists.map((artist) => (
              <ArtistCard key={artist.id} artist={artist} size={80} />
            ))}
          </div>
        ) : null}
      </section>

      {/* ── 11. Language-Specific Feed Rows ── */}
      {langSections.map((section) => (
        <HorizontalSection
          key={section.id}
          title={section.title}
          subtitle={section.subtitle}
          songs={section.songs}
          loading={section.loading}
          error={section.error}
          onRetry={() => retrySection(section.id)}
        />
      ))}

      <div style={{ height: 24 }} />
    </div>
  );
}

// ─── Horizontal scrollable section ────────────────────────────────────────────

function HorizontalSection({
  title,
  subtitle,
  badge,
  songs,
  loading,
  error,
  onRetry,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  songs: Song[];
  loading: boolean;
  error: boolean;
  onRetry?: () => void;
}) {
  return (
    <section style={{ padding: '20px 0 0' }} aria-label={title}>
      <div style={{ padding: '0 20px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
              {title}
            </h2>
            {badge && (
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                background: 'rgba(245, 158, 11, 0.15)',
                color: 'var(--color-accent)',
                padding: '2px 8px',
                borderRadius: 999,
              }}>
                {badge}
              </span>
            )}
          </div>
          {subtitle && (
            <p style={{ margin: '2px 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {loading ? (
        <div className="scroll-x" style={{ padding: '0 20px' }}>
          <SkeletonGrid count={5} />
        </div>
      ) : error ? (
        <div style={{ padding: '0 20px' }}>
          <ErrorState type="api" message="Couldn't load this section." onRetry={onRetry} />
        </div>
      ) : songs.length === 0 ? null : (
        <div className="scroll-x" style={{ padding: '0 20px' }}>
          {songs.map((song, i) => (
            <SongSquareCard key={song.id} song={song} queue={songs} index={i} />
          ))}
        </div>
      )}
    </section>
  );
}
