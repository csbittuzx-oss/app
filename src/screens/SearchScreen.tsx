import { useState, useEffect } from 'react';
import { useApp } from '../state/AppContext';
import { usePlayer } from '../state/PlayerContext';
import { searchMusic } from '../data/repository/musicRepository';
import type { SearchResult, Song } from '../data/models';
import { SearchBar } from '../components/shared/SearchBar';
import { SongCard } from '../components/cards/SongCard';
import { ArtistCard } from '../components/cards/ArtistCard';
import { AlbumCard } from '../components/cards/AlbumCard';
import { SkeletonList } from '../components/shared/SkeletonCard';
import { EmptyState } from '../components/shared/ErrorState';
import { useDebounce } from '../core/hooks';
import { CONFIG } from '../config';

export function SearchScreen() {
  const {
    state: appState,
    addSearchHistory,
    addSearchRecentPlayed,
    removeSearchRecentPlayed,
    clearSearchRecentPlayed,
    clearSearchHistory,
    isFavorite,
    toggleFavorite,
  } = useApp();
  const { playSong } = usePlayer();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [activeTab, setActiveTab] = useState<'songs' | 'artists' | 'albums'>('songs');

  const debouncedQuery = useDebounce(query, 400);

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults(null);
      setError(false);
      return;
    }
    setLoading(true);
    setError(false);
    searchMusic(debouncedQuery, 20)
      .then(res => { setResults(res); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [debouncedQuery]);

  const handleSubmit = (q: string) => {
    if (q.trim()) addSearchHistory(q.trim());
  };

  const hasResults = results && (results.songs.length + results.artists.length + results.albums.length) > 0;
  // ONLY songs searched and played by the user
  const recentSongs: Song[] = appState.searchRecentlyPlayed.slice(0, 30);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* ── Header ── */}
      <header style={{ padding: '20px 20px 12px', flexShrink: 0 }}>
        <h1 style={{ margin: '0 0 14px', fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)', color: 'var(--color-text-primary)' }}>
          Search
        </h1>
        <SearchBar
          value={query}
          onChange={setQuery}
          onSubmit={handleSubmit}
          onClear={() => { setResults(null); setError(false); }}
          autoFocus={false}
        />
      </header>

      <div className="scroll-area" style={{ flex: 1, paddingBottom: 'var(--content-bottom-pad)' }}>

        {/* ── No query: show Spotify-style Recents list if available, else clean EmptyState ── */}
        {!query && (
          recentSongs.length > 0 ? (
            <section style={{ padding: '4px 20px 20px' }} aria-label="Recent played searched songs">
              <div style={{ marginBottom: 12 }}>
                <h2 style={{
                  margin: 0,
                  fontSize: 'var(--text-xl)',
                  fontWeight: 800,
                  color: 'var(--color-text-primary)',
                  fontFamily: 'var(--font-display)',
                  letterSpacing: '-0.02em',
                }}>
                  Recents
                </h2>
              </div>

              {/* Vertical Recents Song List (up to 30 items) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {recentSongs.map((song) => {
                  const liked = isFavorite(song.id);
                  return (
                    <div
                      key={song.id}
                      id={`recent-song-${song.id}`}
                      onClick={() => {
                        playSong(song, [song], 0);
                        addSearchRecentPlayed(song);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '8px 0',
                        gap: 14,
                        cursor: 'pointer',
                        borderRadius: 'var(--radius-md)',
                        transition: 'background 120ms ease',
                      }}
                    >
                      {/* Artwork */}
                      <div style={{
                        width: 52,
                        height: 52,
                        borderRadius: 'var(--radius-md)',
                        overflow: 'hidden',
                        background: 'var(--color-surface-2)',
                        flexShrink: 0,
                      }}>
                        <img
                          src={song.artwork || CONFIG.ARTWORK_PLACEHOLDER}
                          alt=""
                          width={52}
                          height={52}
                          loading="lazy"
                          onError={(e) => { (e.target as HTMLImageElement).src = CONFIG.ARTWORK_PLACEHOLDER; }}
                          style={{ objectFit: 'cover', width: '100%', height: '100%' }}
                        />
                      </div>

                      {/* Title & Subtitle */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{
                          margin: 0,
                          fontWeight: 600,
                          fontSize: 'var(--text-md)',
                          color: 'var(--color-text-primary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {song.title}
                        </p>
                        <p style={{
                          margin: '3px 0 0',
                          fontSize: 'var(--text-sm)',
                          color: 'var(--color-text-secondary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          Song • {song.artist}
                        </p>
                      </div>

                      {/* Right Actions: Favorite Check/Plus + Remove X */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                        {/* Like / Added status */}
                        <button
                          type="button"
                          aria-label={liked ? 'Remove from library' : 'Save to library'}
                          onClick={() => toggleFavorite(song)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: liked ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 4,
                          }}
                        >
                          {liked ? (
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                            </svg>
                          ) : (
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10" />
                              <line x1="12" y1="8" x2="12" y2="16" />
                              <line x1="8" y1="12" x2="16" y2="12" />
                            </svg>
                          )}
                        </button>

                        {/* Close / Dismiss X icon */}
                        <button
                          type="button"
                          id={`remove-recent-${song.id}`}
                          aria-label="Remove from recents"
                          onClick={() => removeSearchRecentPlayed(song.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--color-text-secondary)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 4,
                          }}
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Option for Clear Recent Searches at the bottom */}
              <div style={{ marginTop: 16, marginBottom: 8, display: 'flex', justifyContent: 'center' }}>
                <button
                  id="clear-all-recents-btn"
                  onClick={() => {
                    clearSearchRecentPlayed();
                    clearSearchHistory();
                  }}
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-full)',
                    padding: '10px 22px',
                    fontSize: 'var(--text-sm)',
                    fontWeight: 600,
                    color: 'var(--color-text-secondary)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-body)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    transition: 'all 150ms ease',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                  </svg>
                  <span>Clear recent searches</span>
                </button>
              </div>
            </section>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
              <EmptyState
                icon={
                  <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                }
                title="Play what you love"
                subtitle="Search for songs, artists, albums, and more."
              />
            </div>
          )
        )}

        {/* ── Loading ── */}
        {loading && (
          <div style={{ padding: '16px 20px' }}>
            <SkeletonList count={6} />
          </div>
        )}

        {/* ── Error ── */}
        {error && !loading && (
          <div style={{ padding: '16px 20px' }}>
            <EmptyState
              title="Search unavailable"
              subtitle="Couldn't reach the music service. Check your connection."
            />
          </div>
        )}

        {/* ── No results ── */}
        {results && !hasResults && !loading && (
          <EmptyState
            title={`No results for "${query}"`}
            subtitle="Try a different song, artist, or album name."
          />
        )}

        {/* ── Results ── */}
        {hasResults && !loading && (
          <>
            {/* Tab bar */}
            <div style={{ display: 'flex', gap: 8, padding: '4px 20px 12px', overflowX: 'auto', scrollbarWidth: 'none' }}>
              {(['songs', 'artists', 'albums'] as const).map(tab => {
                const counts: Record<string, number> = {
                  songs: results.songs.length,
                  artists: results.artists.length,
                  albums: results.albums.length,
                };
                if (counts[tab] === 0) return null;
                return (
                  <button
                    key={tab}
                    id={`tab-${tab}`}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      background: activeTab === tab ? 'var(--color-accent)' : 'var(--color-surface-2)',
                      color: activeTab === tab ? 'var(--color-accent-on)' : 'var(--color-text-secondary)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-full)',
                      padding: '6px 16px',
                      fontSize: 'var(--text-sm)',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: 'var(--font-body)',
                      flexShrink: 0,
                      transition: 'all 200ms var(--ease-standard)',
                    }}
                    aria-pressed={activeTab === tab}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)} ({counts[tab]})
                  </button>
                );
              })}
            </div>

            {/* Songs tab */}
            {activeTab === 'songs' && results.songs.length > 0 && (
              <div style={{ padding: '0 20px' }}>
                {results.songs.map((song) => (
                  <SongCard
                    key={song.id}
                    song={song}
                    queue={[song]}
                    index={0}
                    onPlay={() => addSearchRecentPlayed(song)}
                  />
                ))}
              </div>
            )}

            {/* Artists tab */}
            {activeTab === 'artists' && results.artists.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, padding: '0 20px' }}>
                {results.artists.map(artist => (
                  <ArtistCard key={artist.id} artist={artist} size={80} />
                ))}
              </div>
            )}

            {/* Albums tab */}
            {activeTab === 'albums' && results.albums.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, padding: '0 20px' }}>
                {results.albums.map(album => (
                  <AlbumCard key={album.id} album={album} size={150} />
                ))}
              </div>
            )}
          </>
        )}

        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}
