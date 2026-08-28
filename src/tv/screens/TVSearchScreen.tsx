import { useState, useEffect } from 'react';
import type { Song } from '../../data/models';
import { usePlayer } from '../../state/PlayerContext';
import { searchMusic } from '../../data/repository/musicRepository';

const KEYBOARD_KEYS = [
  ['A', 'B', 'C', 'D', 'E', 'F', '1', '2', '3'],
  ['G', 'H', 'I', 'J', 'K', 'L', '4', '5', '6'],
  ['M', 'N', 'O', 'P', 'Q', 'R', '7', '8', '9'],
  ['S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '0'],
  ['SPACE', 'BACKSPACE', 'CLEAR'],
];

export function TVSearchScreen() {
  const { playSong } = usePlayer();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Song[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const searchRes = await searchMusic(query.trim(), 24);
        setResults(searchRes.songs || []);
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [query]);

  const handleKeyPress = (key: string) => {
    if (key === 'SPACE') {
      setQuery((q) => q + ' ');
    } else if (key === 'BACKSPACE') {
      setQuery((q) => q.slice(0, -1));
    } else if (key === 'CLEAR') {
      setQuery('');
    } else {
      setQuery((q) => q + key);
    }
  };

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
        gap: '20px',
        boxSizing: 'border-box',
      }}
    >
      {/* ── Search Input & Header ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
        <h1
          style={{
            fontSize: 'clamp(20px, 2.2vw, 28px)',
            fontWeight: 800,
            color: '#FFFFFF',
            margin: 0,
          }}
        >
          Search Music
        </h1>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '14px',
            padding: '10px 16px',
            gap: '12px',
            width: '100%',
            maxWidth: '560px',
            boxSizing: 'border-box',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="2.5" style={{ flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            id="tv-search-input"
            data-tv-focus="true"
            data-tv-section="search-header"
            tabIndex={0}
            type="text"
            placeholder="Type artist, song, or album..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#FFFFFF',
              fontSize: 'clamp(14px, 1.4vw, 17px)',
              fontWeight: 600,
              width: '100%',
              minWidth: 0,
            }}
          />
          {query.length > 0 && (
            <button
              id="tv-search-clear-btn"
              data-tv-focus="true"
              data-tv-section="search-header"
              tabIndex={0}
              onClick={() => setQuery('')}
              className="tv-focusable"
              style={{
                background: 'rgba(255, 255, 255, 0.12)',
                border: 'none',
                color: '#FFFFFF',
                borderRadius: '50%',
                width: 26,
                height: 26,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ── On-Screen TV Remote Keyboard ── */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          borderRadius: '16px',
          padding: '12px 14px',
          width: '100%',
          maxWidth: '560px',
          boxSizing: 'border-box',
        }}
      >
        {KEYBOARD_KEYS.map((row, rowIdx) => (
          <div key={rowIdx} style={{ display: 'flex', gap: '6px', width: '100%' }}>
            {row.map((k) => (
              <button
                key={k}
                id={`tv-key-${k.toLowerCase()}`}
                data-tv-focus="true"
                data-tv-section="keyboard"
                tabIndex={0}
                onClick={() => handleKeyPress(k)}
                className="tv-focusable"
                style={{
                  flex: k === 'SPACE' ? 3 : k === 'BACKSPACE' || k === 'CLEAR' ? 2 : 1,
                  minWidth: 0,
                  height: '38px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: '#FFFFFF',
                  fontSize: 'clamp(11px, 1.1vw, 14px)',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 4px',
                  boxSizing: 'border-box',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                }}
              >
                {k === 'BACKSPACE' ? '⌫' : k === 'SPACE' ? 'Space' : k}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* ── Search Results Grid ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', width: '100%', marginTop: '6px' }}>
        <h2 style={{ fontSize: 'clamp(16px, 1.6vw, 20px)', fontWeight: 700, color: '#FFFFFF', margin: 0 }}>
          {isSearching
            ? 'Searching songs...'
            : results.length > 0
            ? `Search Results (${results.length})`
            : query.length > 0
            ? 'No songs found'
            : 'Popular Searches'}
        </h2>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(clamp(130px, 14vw, 175px), 1fr))',
            gap: '16px',
            width: '100%',
            boxSizing: 'border-box',
          }}
          data-tv-section="search-results"
        >
          {results.map((song, idx) => (
            <div
              key={`search-${song.id}-${idx}`}
              id={`tv-search-result-${idx}`}
              data-tv-focus="true"
              data-tv-section="search-results"
              tabIndex={0}
              onClick={() => playSong(song, results)}
              className="tv-song-card tv-focusable"
              style={{ width: '100%' }}
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
    </div>
  );
}
