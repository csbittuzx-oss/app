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
        height: '100vh',
        overflowY: 'auto',
        padding: '36px 48px 120px 48px',
        display: 'flex',
        flexDirection: 'column',
        gap: '28px',
      }}
    >
      {/* ── Search Input & Header ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#FFFFFF', margin: 0 }}>
          Search Music
        </h1>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '16px',
            padding: '14px 20px',
            gap: '14px',
            width: '100%',
            maxWidth: '680px',
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="2.5">
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
              fontSize: '18px',
              fontWeight: 600,
              width: '100%',
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
                width: 28,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
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
          gap: '8px',
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          borderRadius: '20px',
          padding: '16px 20px',
          maxWidth: '680px',
        }}
      >
        {KEYBOARD_KEYS.map((row, rowIdx) => (
          <div key={rowIdx} style={{ display: 'flex', gap: '8px' }}>
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
                  height: '44px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '10px',
                  color: '#FFFFFF',
                  fontSize: '15px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {k === 'BACKSPACE' ? '⌫ Delete' : k === 'SPACE' ? '␣ Space' : k}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* ── Search Results Grid ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '12px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#FFFFFF', margin: 0 }}>
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
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: '20px',
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
                  fontSize: '15px',
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
                  fontSize: '13px',
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
