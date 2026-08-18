import { useEffect, useState, useMemo, useCallback, useRef, useLayoutEffect } from 'react';
import { useApp } from '../state/AppContext';
import { usePlayer } from '../state/PlayerContext';
import {
  getPersonalizedTrending,
  getPersonalizedRecommendForYou,
  getPersonalizedNewReleases,
  getPersonalizedTracksByLanguage,
  getPersonalizedArtists,
  deduplicateSongs,
  LANGUAGE_METADATA,
} from '../data/repository/musicRepository';
import { formatMediaUrlWithQuality } from '../data/api/saavnApi';
import {
  generateSpotifyStyleShelves,
  getCachedShelves,
  type PlaylistShelfData,
} from '../services/CuratedPlaylistsService';
import { userProfileTracker } from '../domain/recommendation/UserProfileTracker';
import { smartRecommendationEngine } from '../domain/recommendation/SmartRecommendationEngine';
import type { Song, Artist, Playlist } from '../data/models';
import { SongSquareCard } from '../components/cards/SongCard';
import { ArtistCard } from '../components/cards/ArtistCard';
import { PlaylistShelfCard } from '../components/cards/PlaylistShelfCard';
import { SkeletonGrid } from '../components/shared/SkeletonCard';
import { ErrorState } from '../components/shared/ErrorState';
import { getGreeting } from '../core/utils';
import { filterSpotifyAvailableTracksSync } from '../services/SpotifyAvailabilityService';
import { CONFIG } from '../config';
import { resizeImageUrl } from '../core/utils/imageUtils';

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
const HOME_CACHE_DATE_KEY = 'sw_home_cache_date';
const ARTISTS_CACHE_KEY = 'sw_home_artists_cache';

export function getTodayDateKey(): string {
  return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

export function isDailyCacheFresh(): boolean {
  try {
    const savedDate = localStorage.getItem(HOME_CACHE_DATE_KEY);
    return savedDate === getTodayDateKey();
  } catch {
    return false;
  }
}

// Persistent memory of Home Screen scroll position across component re-mounts and screen switches
let persistentHomeScrollTop = 0;

export function resetHomeScrollPosition() {
  persistentHomeScrollTop = 0;
}

export function getHomeScrollPosition() {
  return persistentHomeScrollTop;
}

function getCachedSections(languages: string[]): Section[] | null {
  try {
    const raw = localStorage.getItem(HOME_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const allowedIds = new Set([
          'made_for_you',
          'trending',
          'recommend_for_you',
          'new_releases',
          'discover_new',
          ...languages.map((l) => `lang_${l}`),
        ]);
        const valid = parsed
          .filter((s: Section) => allowedIds.has(s.id) || s.id.startsWith('dynamic_'))
          .map((s: Section) => ({ ...s, loading: false, error: false }));
        return valid.length > 0 ? valid : null;
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

export function HomeScreen({ isVisible = true }: { isVisible?: boolean }) {
  const { state: appState, nav: { nav, navigate } } = useApp();
  const { playSong } = usePlayer();

  const scrollRef = useRef<HTMLDivElement>(null);
  const isRestoringScroll = useRef<boolean>(false);

  const languages = appState.musicLanguages && appState.musicLanguages.length > 0
    ? appState.musicLanguages
    : ['Hindi', 'International'];

  const [sections, setSections] = useState<Section[]>(() => getCachedSections(languages) || []);
  const [shelves, setShelves] = useState<PlaylistShelfData[]>(() => getCachedShelves(languages) || []);
  const [shelvesLoading, setShelvesLoading] = useState(() => !getCachedShelves(languages));
  const [topArtists, setTopArtists] = useState<Artist[]>(() => getCachedArtists() || []);
  const [artistsLoading, setArtistsLoading] = useState(() => !getCachedArtists());

  // Restore scroll position smoothly without visible jump or flicker
  const restoreScrollPosition = useCallback(() => {
    if (!scrollRef.current || persistentHomeScrollTop <= 0) return;
    const el = scrollRef.current;
    isRestoringScroll.current = true;
    const prevBehavior = el.style.scrollBehavior;
    el.style.scrollBehavior = 'auto';
    el.scrollTop = persistentHomeScrollTop;
    requestAnimationFrame(() => {
      if (el && persistentHomeScrollTop > 0) {
        el.scrollTop = persistentHomeScrollTop;
        el.style.scrollBehavior = prevBehavior;
      }
      setTimeout(() => {
        isRestoringScroll.current = false;
      }, 80);
    });
  }, []);

  // Instant layout effect restoration to guarantee zero jump/flicker
  useLayoutEffect(() => {
    if (isVisible) {
      restoreScrollPosition();
    }
  }, [isVisible, restoreScrollPosition]);

  // Secondary backup restoration when screen activates or mounts
  useEffect(() => {
    if (isVisible && nav.screen === 'home') {
      restoreScrollPosition();
      const raf = requestAnimationFrame(restoreScrollPosition);
      return () => cancelAnimationFrame(raf);
    }
  }, [isVisible, nav.screen, restoreScrollPosition]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (isRestoringScroll.current) return;
    const top = e.currentTarget.scrollTop;
    if (top >= 0) {
      persistentHomeScrollTop = top;
    }
  };

  // Top artists from user profile intelligence
  const userTopArtists = useMemo(() => {
    return userProfileTracker.getTopArtists(5);
  }, [appState.recentlyPlayed.length]);

  const loadFeed = useCallback((forceRefresh = false) => {
    const isOffline = !navigator.onLine;
    const isFreshToday = isDailyCacheFresh();

    // 1. If daily cache is fresh and not a forced refresh, keep existing content without reloading skeletons
    if (!forceRefresh && isFreshToday) {
      const cached = getCachedSections(languages);
      if (cached && cached.length > 0) {
        setSections(cached);
      }
      const cachedShelves = getCachedShelves(languages);
      if (cachedShelves && cachedShelves.length > 0) {
        setShelves(cachedShelves);
        setShelvesLoading(false);
      }
      const cachedArts = getCachedArtists();
      if (cachedArts) {
        setTopArtists(cachedArts);
        setArtistsLoading(false);
      }
      return;
    }

    // 2. If offline, maintain the exact existing cached content without reloading skeletons
    if (isOffline && !forceRefresh) {
      const cached = getCachedSections(languages);
      if (cached && cached.length > 0) {
        setSections(cached);
      }
      const cachedShelves = getCachedShelves(languages);
      if (cachedShelves && cachedShelves.length > 0) {
        setShelves(cachedShelves);
        setShelvesLoading(false);
      }
      const cachedArts = getCachedArtists();
      if (cachedArts) {
        setTopArtists(cachedArts);
        setArtistsLoading(false);
      }
      return;
    }

    const defaultInitialSections: Section[] = [
      { id: 'made_for_you', title: 'Made For You', subtitle: 'Personalized AI blend curated from your taste', badge: 'AI Mix', songs: [], loading: true, error: false },
      { id: 'trending', title: 'Trending Now', subtitle: 'What listeners are loving right now', songs: [], loading: true, error: false },
      { id: 'recommend_for_you', title: 'Recommend for You', subtitle: 'Based on your listening history', badge: 'For You', songs: [], loading: true, error: false },
      { id: 'new_releases', title: 'New Releases', subtitle: 'Fresh drops in your languages', songs: [], loading: true, error: false },
      { id: 'discover_new', title: 'Discover Something New', subtitle: 'Fresh picks curated just outside your comfort zone', badge: 'Discovery', songs: [], loading: true, error: false },
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
      // Reconcile with defaultInitialSections: only show sections corresponding to active languages
      const prevMap = new Map(prev.map((s) => [s.id, s]));
      return defaultInitialSections.map((def) => {
        const existing = prevMap.get(def.id);
        if (existing && existing.songs && existing.songs.length > 0) {
          return existing;
        }
        return def;
      });
    });

    function loadSection(id: string, fetcher: () => Promise<Song[]>) {
      fetcher()
        .then((songs) => {
          // Strictly deduplicate by track ID & ensure true 320kbps High Quality stream
          const sanitizedSongs = deduplicateSongs(songs).map((s) => ({
            ...s,
            previewUrl: formatMediaUrlWithQuality(s.previewUrl, 'high'),
          }));

          setSections((prev) => {
            const next = prev.map((s) => (s.id === id ? { ...s, songs: sanitizedSongs, loading: false } : s));
            // Cache populated sections for 24-hour daily cache
            try {
              const allowedIds = new Set([
                'made_for_you',
                'trending',
                'recommend_for_you',
                'new_releases',
                'discover_new',
                ...languages.map((l) => `lang_${l}`),
              ]);
              const withData = next.filter((s) => allowedIds.has(s.id) && s.songs && s.songs.length > 0);
              if (withData.length > 0) {
                localStorage.setItem(HOME_CACHE_KEY, JSON.stringify(withData));
                localStorage.setItem(HOME_CACHE_DATE_KEY, getTodayDateKey());
              }
            } catch {}
            return next;
          });
        })
        .catch(() => {
          setSections((prev) => prev.map((s) => (s.id === id ? { ...s, loading: false, error: !isOffline } : s)));
        });
    }

    // 1. Made For You (AI Personalized Mix)
    loadSection('made_for_you', () => smartRecommendationEngine.getPersonalizedMadeForYou({
      recentlyPlayed: appState.recentlyPlayed,
      favorites: appState.favorites,
    }));

    // 2. Trending Now (Strict Daily AI Ranking of verified chart trends)
    loadSection('trending', () => getPersonalizedTrending(languages, 16));

    // 3. Recommend for You (Personalized from listening history)
    loadSection('recommend_for_you', () => getPersonalizedRecommendForYou(languages, appState.recentlyPlayed, appState.favorites, 16));

    // 4. New Releases
    loadSection('new_releases', () => getPersonalizedNewReleases(languages, 16));

    // 5. Discover Something New
    loadSection('discover_new', () => smartRecommendationEngine.getDiscoverSomethingNew(languages));

    // 6. Language-specific deep dives
    languages.forEach((lang) => {
      loadSection(`lang_${lang}`, () => getPersonalizedTracksByLanguage(lang, 16));
    });

    // 7. Dynamic Learned Behavior Sections (e.g. "Top Bhojpuri Hits", "Best of [Artist]" when user frequently listens to them)
    if (!isOffline) {
      smartRecommendationEngine.getLearnedBehaviorSections({
        recentlyPlayed: appState.recentlyPlayed,
        favorites: appState.favorites,
        userPlaylists: appState.userPlaylists,
      }, languages).then((dynamicList) => {
        if (dynamicList && dynamicList.length > 0) {
          setSections((prev) => {
            const currentIds = new Set(prev.map((s) => s.id));
            const newEntries: Section[] = dynamicList
              .filter((d) => !currentIds.has(d.id))
              .map((d) => ({
                id: d.id,
                title: d.title,
                subtitle: d.subtitle,
                badge: d.badge,
                songs: deduplicateSongs(d.songs).map((s) => ({
                  ...s,
                  previewUrl: formatMediaUrlWithQuality(s.previewUrl, 'high'),
                })),
                loading: false,
                error: false,
              }));
            if (newEntries.length > 0) {
              const updated = [...prev, ...newEntries];
              try {
                localStorage.setItem(HOME_CACHE_KEY, JSON.stringify(updated));
                localStorage.setItem(HOME_CACHE_DATE_KEY, getTodayDateKey());
              } catch {}
              return updated;
            }
            return prev;
          });
        }
      }).catch(() => {});
    }

    // 8. Spotify-Style Curated Playlist Shelves (Personalized)
    setShelvesLoading(true);
    generateSpotifyStyleShelves({
      languages,
      favorites: appState.favorites,
      recentlyPlayed: appState.recentlyPlayed,
      searchRecentlyPlayed: appState.searchRecentlyPlayed,
      userPlaylists: appState.userPlaylists,
      topArtists: userTopArtists,
    })
      .then((generatedShelves) => {
        setShelves(generatedShelves);
      })
      .catch(() => {
        const cached = getCachedShelves();
        if (cached) setShelves(cached);
      })
      .finally(() => {
        setShelvesLoading(false);
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
    if (id === 'made_for_you') {
      smartRecommendationEngine.getPersonalizedMadeForYou({ recentlyPlayed: appState.recentlyPlayed, favorites: appState.favorites }).then((songs) => setSections((prev) => prev.map((s) => (s.id === id ? { ...s, songs, loading: false } : s))));
    } else if (id === 'discover_new') {
      smartRecommendationEngine.getDiscoverSomethingNew(languages).then((songs) => setSections((prev) => prev.map((s) => (s.id === id ? { ...s, songs, loading: false } : s))));
    } else if (id === 'trending') {
      getPersonalizedTrending(languages, 16).then((songs) => setSections((prev) => prev.map((s) => (s.id === id ? { ...s, songs, loading: false } : s))));
    } else if (id === 'recommend_for_you') {
      getPersonalizedRecommendForYou(languages, appState.recentlyPlayed, appState.favorites, 16).then((songs) => setSections((prev) => prev.map((s) => (s.id === id ? { ...s, songs, loading: false } : s))));
    } else if (id === 'new_releases') {
      getPersonalizedNewReleases(languages, 16).then((songs) => setSections((prev) => prev.map((s) => (s.id === id ? { ...s, songs, loading: false } : s))));
    } else if (id.startsWith('lang_')) {
      const lang = id.replace('lang_', '');
      getPersonalizedTracksByLanguage(lang, 16).then((songs) => setSections((prev) => prev.map((s) => (s.id === id ? { ...s, songs, loading: false } : s))));
    }
  }

  const handleOpenPlaylist = (playlist: Playlist) => {
    if (scrollRef.current) {
      persistentHomeScrollTop = scrollRef.current.scrollTop;
    }
    navigate('playlist', { playlistId: playlist.id, playlist });
  };

  const greeting = getGreeting();
  const visibleContinueListening = filterSpotifyAvailableTracksSync(appState.recentlyPlayed).slice(0, 8);

  const trendingSection = sections.find((s) => s.id === 'trending');
  const recommendForYouSection = sections.find((s) => s.id === 'recommend_for_you');
  const newReleasesSection = sections.find((s) => s.id === 'new_releases');
  const langSections = sections.filter((s) => s.id.startsWith('lang_'));

  const moreLikeShelf = shelves.find((sh) => sh.id === 'shelf_more_like_you');
  const jumpBackInShelf = shelves.find((sh) => sh.id === 'shelf_jump_back_in');
  const happyShelf = shelves.find((sh) => sh.id === 'shelf_happy');
  const partyShelf = shelves.find((sh) => sh.id === 'shelf_party');
  const throwbackShelf = shelves.find((sh) => sh.id === 'shelf_throwback');
  const bhojpuriShelf = shelves.find((sh) => sh.id === 'shelf_bhojpuri');
  const recShelf = shelves.find((sh) => sh.id === 'shelf_recommendations');

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="scroll-area"
      style={{ flex: 1, paddingBottom: 'var(--content-bottom-pad)' }}
    >
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
                  src={resizeImageUrl(song.artworkLg || song.artwork, 544, 544)}
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

      {/* ── 1. Continue Listening (Top priority - preserved exactly where it is) ── */}
      {visibleContinueListening.length > 0 && (
        <HorizontalSection
          title="Continue Listening"
          songs={visibleContinueListening}
          loading={false}
          error={false}
        />
      )}

      {/* ── 2. Trending Now (Preserved top song section) ── */}
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

      {/* ── 2.5 Recommend for You (Personalized from past listening history) ── */}
      {recommendForYouSection && (
        <HorizontalSection
          title="Recommend for You"
          subtitle="Based on your listening history"
          badge="For You"
          songs={recommendForYouSection.songs}
          loading={recommendForYouSection.loading}
          error={recommendForYouSection.error}
          onRetry={() => retrySection('recommend_for_you')}
        />
      )}

      {/* ── 3. New Releases (Preserved top song section) ── */}
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

      {/* ── 4. More Like What You Like (Spotify-style playlist shelf) ── */}
      {moreLikeShelf && (
        <PlaylistShelfSection
          title={moreLikeShelf.title}
          subtitle={moreLikeShelf.subtitle}
          playlists={moreLikeShelf.playlists}
          loading={shelvesLoading && shelves.length === 0}
          onOpenPlaylist={handleOpenPlaylist}
        />
      )}

      {/* ── 5. Jump In Back (Spotify-style playlist shelf) ── */}
      {jumpBackInShelf && (
        <PlaylistShelfSection
          title={jumpBackInShelf.title}
          subtitle={jumpBackInShelf.subtitle}
          playlists={jumpBackInShelf.playlists}
          loading={shelvesLoading && shelves.length === 0}
          onOpenPlaylist={handleOpenPlaylist}
        />
      )}

      {/* ── 6. Happy (Spotify-style mood playlist shelf) ── */}
      {happyShelf && (
        <PlaylistShelfSection
          title={happyShelf.title}
          subtitle={happyShelf.subtitle}
          playlists={happyShelf.playlists}
          loading={shelvesLoading && shelves.length === 0}
          onOpenPlaylist={handleOpenPlaylist}
        />
      )}

      {/* ── 7. Party (Spotify-style party playlist shelf) ── */}
      {partyShelf && (
        <PlaylistShelfSection
          title={partyShelf.title}
          subtitle={partyShelf.subtitle}
          playlists={partyShelf.playlists}
          loading={shelvesLoading && shelves.length === 0}
          onOpenPlaylist={handleOpenPlaylist}
        />
      )}

      {/* ── 8. Throwback (Spotify-style nostalgic playlist shelf) ── */}
      {throwbackShelf && (
        <PlaylistShelfSection
          title={throwbackShelf.title}
          subtitle={throwbackShelf.subtitle}
          playlists={throwbackShelf.playlists}
          loading={shelvesLoading && shelves.length === 0}
          onOpenPlaylist={handleOpenPlaylist}
        />
      )}

      {/* ── 9. Bhojpuri Hits (Spotify-style Bhojpuri playlist shelf) ── */}
      {bhojpuriShelf && (
        <PlaylistShelfSection
          title={bhojpuriShelf.title}
          subtitle={bhojpuriShelf.subtitle}
          playlists={bhojpuriShelf.playlists}
          loading={shelvesLoading && shelves.length === 0}
          onOpenPlaylist={handleOpenPlaylist}
        />
      )}

      {/* ── 10. Recommendations For Today (Spotify-style personalized shelf) ── */}
      {recShelf && (
        <PlaylistShelfSection
          title={recShelf.title}
          subtitle={recShelf.subtitle}
          badge={recShelf.badge}
          playlists={recShelf.playlists}
          loading={shelvesLoading && shelves.length === 0}
          onOpenPlaylist={handleOpenPlaylist}
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
          <div className="scroll-x" style={{ padding: '0 20px', gap: 14 }}>
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: 96, flexShrink: 0 }}>
                <div className="skeleton" style={{ width: 80, height: 80, borderRadius: '50%' }} />
                <div className="skeleton" style={{ height: 11, width: 60, borderRadius: 4 }} />
              </div>
            ))}
          </div>
        ) : topArtists.length > 0 ? (
          <div className="scroll-x" style={{ padding: '0 20px', gap: 14 }}>
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

// ─── Horizontal scrollable song section ────────────────────────────────────────

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
        <div className="scroll-x" style={{ padding: '0 20px', gap: 14 }}>
          <SkeletonGrid count={5} />
        </div>
      ) : error ? (
        <div style={{ padding: '0 20px' }}>
          <ErrorState type="api" message="Couldn't load this section." onRetry={onRetry} />
        </div>
      ) : songs.length === 0 ? null : (
        <div className="scroll-x" style={{ padding: '0 20px', gap: 14 }}>
          {songs.map((song, i) => (
            <SongSquareCard key={song.id} song={song} queue={songs} index={i} />
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Spotify-Style Horizontal Playlist Shelf Section ──────────────────────────

function PlaylistShelfSection({
  title,
  subtitle,
  badge,
  playlists,
  loading,
  onOpenPlaylist,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  playlists: Playlist[];
  loading?: boolean;
  onOpenPlaylist: (pl: Playlist) => void;
}) {
  if (!loading && (!playlists || playlists.length === 0)) return null;

  return (
    <section style={{ padding: '24px 0 0' }} aria-label={title}>
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
        <div className="scroll-x" style={{ padding: '0 20px', gap: 14 }}>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} style={{ width: 148, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="skeleton" style={{ width: 148, height: 148, borderRadius: 'var(--radius-lg)' }} />
              <div className="skeleton" style={{ height: 14, width: '80%', borderRadius: 4 }} />
              <div className="skeleton" style={{ height: 11, width: '60%', borderRadius: 4 }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="scroll-x" style={{ padding: '0 20px', gap: 14 }}>
          {playlists.map((pl) => (
            <PlaylistShelfCard
              key={pl.id}
              playlist={pl}
              onClick={() => onOpenPlaylist(pl)}
              size={148}
            />
          ))}
        </div>
      )}
    </section>
  );
}
