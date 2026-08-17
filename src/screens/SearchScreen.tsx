import { useState, useEffect } from 'react';
import { useApp } from '../state/AppContext';
import { usePlayer } from '../state/PlayerContext';
import { aiSmartSearchEngine, type AISmartSearchIntent } from '../domain/ai/AISmartSearchEngine';
import { songRecognitionService } from '../services/SongRecognitionService';
import type { SearchResult, Song, RecognitionResult } from '../data/models';
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
  const [smartIntent, setSmartIntent] = useState<AISmartSearchIntent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [activeTab, setActiveTab] = useState<'songs' | 'artists' | 'albums'>('songs');

  // Shazam Song Recognition State
  const [showShazamModal, setShowShazamModal] = useState(false);
  const [recognitionState, setRecognitionState] = useState<'listening' | 'identifying' | 'success' | 'error'>('listening');
  const [recognizedResult, setRecognizedResult] = useState<RecognitionResult | null>(null);
  const [recognitionErrorMsg, setRecognitionErrorMsg] = useState<string | null>(null);

  const debouncedQuery = useDebounce(query, 400);

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults(null);
      setSmartIntent(null);
      setError(false);
      return;
    }
    setLoading(true);
    setError(false);
    aiSmartSearchEngine.executeSearch(debouncedQuery, 24)
      .then(({ result, intent }) => {
        setResults(result);
        setSmartIntent(intent);
        setLoading(false);
      })
      .catch(() => { setError(true); setLoading(false); });
  }, [debouncedQuery]);

  const handleSubmit = (q: string) => {
    if (q.trim()) addSearchHistory(q.trim());
  };

  const handleStartShazam = async () => {
    setShowShazamModal(true);
    setRecognitionState('listening');
    setRecognizedResult(null);
    setRecognitionErrorMsg(null);

    const unsubscribe = songRecognitionService.subscribe((e) => {
      if (e.state === 'listening' || e.state === 'identifying') {
        setRecognitionState(e.state);
      } else if (e.state === 'success' && e.result) {
        setRecognitionState('success');
        setRecognizedResult(e.result);
      } else if (e.state === 'error') {
        setRecognitionState('error');
        setRecognitionErrorMsg(e.error || 'No match found.');
      }
    });

    await songRecognitionService.startListening();
    unsubscribe();
  };

  const hasResults = results && (results.songs.length + results.artists.length + results.albums.length) > 0;
  // ONLY songs searched and played by the user
  const recentSongs: Song[] = appState.searchRecentlyPlayed.slice(0, 30);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* ── Header ── */}
      <header style={{ padding: '20px 20px 8px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)', color: 'var(--color-text-primary)' }}>
            Search
          </h1>
          <button
            id="shazam-recognize-btn"
            onClick={handleStartShazam}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              borderRadius: 'var(--radius-full)',
              background: 'rgba(245, 158, 11, 0.14)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              color: 'var(--color-accent)',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 150ms ease',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14h2v2h-2v-2zm0-10h2v8h-2V6z"/>
            </svg>
            Recognize Song
          </button>
        </div>
        <SearchBar
          value={query}
          onChange={setQuery}
          onSubmit={handleSubmit}
          onClear={() => { setResults(null); setSmartIntent(null); setError(false); }}
          autoFocus={false}
        />
      </header>

      {/* ── AI Smart Search Intent Quick Inspiration Chips ── */}
      {!query && (
        <div style={{ padding: '4px 20px 14px', display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none', flexShrink: 0 }}>
          {[
            {
              icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 18v-6a9 9 0 0 1 18 0v6"/>
                  <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
                </svg>
              ),
              text: 'Chill songs for studying',
            },
            {
              icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>
              ),
              text: 'Energetic workout hits',
            },
            {
              icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              ),
              text: 'Late night drive vibes',
            },
            {
              icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
                  <path d="m12 5-1 5 3 2-2 5"/>
                </svg>
              ),
              text: 'Sad Hindi songs',
            },
            {
              icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9 18V5l12-2v13"/>
                  <circle cx="6" cy="18" r="3"/>
                  <circle cx="18" cy="16" r="3"/>
                </svg>
              ),
              text: 'Relaxing instrumental',
            },
            {
              icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
              ),
              text: 'Popular songs from the 2000s',
            },
          ].map((chip) => (
            <button
              key={chip.text}
              type="button"
              onClick={() => {
                setQuery(chip.text);
                handleSubmit(chip.text);
              }}
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-full)',
                padding: '6px 14px',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                color: 'var(--color-text-secondary)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                flexShrink: 0,
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--color-accent)' }}>
                {chip.icon}
              </span>
              <span>{chip.text}</span>
            </button>
          ))}
        </div>
      )}

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
            {/* AI Smart Intent Badge */}
            {smartIntent?.isNaturalLanguage && smartIntent.smartTag && (
              <div style={{
                margin: '0 20px 10px',
                padding: '8px 14px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-accent-dim)',
                border: '1px solid rgba(245, 158, 11, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                color: 'var(--color-accent)',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '13px' }}>✨</span>
                  <span>AI Intent: <strong>{smartIntent.smartTag}</strong></span>
                </div>
                {smartIntent.categoryHint && (
                  <span style={{ opacity: 0.75, fontSize: '11px', fontWeight: 500 }}>
                    {smartIntent.categoryHint}
                  </span>
                )}
              </div>
            )}

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

      {/* ── Shazam Ambient Song Recognition Modal ── */}
      {showShazamModal && (
        <div
          id="shazam-modal-backdrop"
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 350,
            background: 'var(--color-scrim)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && recognitionState !== 'listening') {
              songRecognitionService.cancel();
              setShowShazamModal(false);
            }
          }}
        >
          <div
            style={{
              background: 'var(--color-surface)',
              width: '100%',
              maxWidth: 480,
              borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0',
              padding: '28px 24px',
              paddingBottom: 'calc(28px + env(safe-area-inset-bottom, 0px))',
              animation: 'slideUp 300ms var(--ease-decelerate)',
              borderTop: '1px solid var(--color-border)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              position: 'relative',
            }}
          >
            {/* Close Button */}
            <button
              onClick={() => {
                songRecognitionService.cancel();
                setShowShazamModal(false);
              }}
              className="btn-icon"
              style={{ position: 'absolute', top: 16, right: 16, color: 'var(--color-text-muted)' }}
              aria-label="Close"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            {/* Listening / Identifying Radar Animation */}
            {(recognitionState === 'listening' || recognitionState === 'identifying') && (
              <div style={{ padding: '20px 0 10px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ position: 'relative', width: 96, height: 96, marginBottom: 20 }}>
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: '50%',
                      background: 'rgba(245, 158, 11, 0.2)',
                      animation: 'pulse 1.5s infinite',
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      inset: 12,
                      borderRadius: '50%',
                      background: 'var(--color-accent)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--color-accent-on)',
                      boxShadow: 'var(--shadow-accent)',
                    }}
                  >
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                      <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                    </svg>
                  </div>
                </div>
                <h3 style={{ margin: '0 0 6px', fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  {recognitionState === 'listening' ? 'Listening to Music...' : 'Identifying Song...'}
                </h3>
                <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', maxWidth: 280, lineHeight: 1.5 }}>
                  {recognitionState === 'listening'
                    ? 'Hold your device close to the audio source for 4 seconds.'
                    : 'Searching audio fingerprints across music catalogs...'}
                </p>
              </div>
            )}

            {/* Success Match Found */}
            {recognitionState === 'success' && recognizedResult && (
              <div style={{ width: '100%', padding: '8px 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  background: 'rgba(34, 197, 94, 0.15)',
                  color: 'var(--color-success)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 14,
                }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
                <h3 style={{ margin: '0 0 4px', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-success)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Song Recognized!
                </h3>
                <h2 style={{ margin: '2px 0', fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  {recognizedResult.title}
                </h2>
                <p style={{ margin: '0 0 16px', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                  {recognizedResult.artist} {recognizedResult.album ? `· ${recognizedResult.album}` : ''}
                </p>

                {recognizedResult.song && (
                  <div style={{ width: '100%', marginBottom: 16 }}>
                    <SongCard song={recognizedResult.song} queue={[recognizedResult.song]} index={0} />
                  </div>
                )}

                <button
                  onClick={() => {
                    if (recognizedResult.song) {
                      playSong(recognizedResult.song, [recognizedResult.song], 0);
                      addSearchRecentPlayed(recognizedResult.song);
                    }
                    setShowShazamModal(false);
                  }}
                  className="btn-primary"
                  style={{ width: '100%', padding: '12px', fontSize: 'var(--text-sm)' }}
                >
                  Play Now
                </button>
              </div>
            )}

            {/* Error / No Match Found */}
            {recognitionState === 'error' && (
              <div style={{ padding: '12px 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  background: 'rgba(239, 68, 68, 0.15)',
                  color: 'var(--color-error)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 14,
                }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
                <h3 style={{ margin: '0 0 6px', fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  Couldn't Identify Song
                </h3>
                <p style={{ margin: '0 0 20px', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', maxWidth: 280, lineHeight: 1.5 }}>
                  {recognitionErrorMsg || 'Make sure the music is clearly audible and try again.'}
                </p>
                <button
                  onClick={handleStartShazam}
                  className="btn-primary"
                  style={{ padding: '10px 24px', fontSize: 'var(--text-xs)' }}
                >
                  Try Again
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
