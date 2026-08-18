import { useState, useEffect, useRef, useCallback } from "react";
import { useApp } from "../state/AppContext";
import { usePlayer } from "../state/PlayerContext";
import { aiSmartSearchEngine, type AISmartSearchIntent } from "../domain/ai/AISmartSearchEngine";
import { onlineSearchSuggestionViewModel, type SearchSuggestionState } from "../services/OnlineSearchViewModel";
import { insertSearchHistory, deleteSearchHistoryEntry, clearAllSearchHistory } from "../services/SearchHistoryService";
import { isDirectMediaUrl } from "../services/DirectLinkParser";
import { getYouTubeMusicTrending } from "../data/api/youtubeMusicApi";
import type { SearchResult, Song } from "../data/models";
import { SongCard } from "../components/cards/SongCard";
import { ArtistCard } from "../components/cards/ArtistCard";
import { AlbumCard } from "../components/cards/AlbumCard";
import { SkeletonList } from "../components/shared/SkeletonCard";
import { EmptyState } from "../components/shared/ErrorState";
import { SearchHistoryItem } from "../components/search/SearchHistoryItem";
import { SuggestionItem } from "../components/search/SuggestionItem";
import { TopResultCard } from "../components/search/TopResultCard";
import { ExploreGrid } from "../components/search/ExploreGrid";
import { useDebounce } from "../core/hooks";

type SearchMode = "online" | "local";
type ActiveTab = "explore" | "echo-chart" | "albums";
type ResultTab = "all" | "songs" | "artists" | "albums";

// ─── Animated Search Bar ────────────────────────────────────────────────────

interface AnimatedSearchBarProps {
  query: string;
  isActive: boolean;
  mode: SearchMode;
  onQueryChange: (v: string) => void;
  onActivate: () => void;
  onDeactivate: () => void;
  onSubmit: (v: string) => void;
  onClear: () => void;
  onModeToggle: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

function AnimatedSearchBar({ query, isActive, mode, onQueryChange, onActivate, onDeactivate, onSubmit, onClear, onModeToggle, inputRef }: AnimatedSearchBarProps) {
  const hPad = isActive ? 0 : 16;
  const tPad = isActive ? 0 : 8;
  return (
    <div style={{ paddingLeft: hPad, paddingRight: hPad, paddingTop: tPad, transition: "padding 245ms cubic-bezier(0.4,0,0.2,1)" }}>
      <div role="search" style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--color-surface-2)", border: "1.5px solid", borderColor: isActive ? "var(--color-border-focus)" : "var(--color-border)", borderRadius: isActive ? "var(--radius-xl)" : "var(--radius-full)", padding: "0 12px", height: 52, transition: "border-color 200ms ease, border-radius 245ms cubic-bezier(0.4,0,0.2,1)", boxShadow: isActive ? "0 2px 12px rgba(0,0,0,0.15)" : "none" }}>
        <button type="button" aria-label={isActive ? "Back" : "Search"} onClick={isActive ? onDeactivate : onActivate} style={{ background: "none", border: "none", padding: 4, cursor: "pointer", color: isActive ? "var(--color-accent)" : "var(--color-text-muted)", display: "flex", alignItems: "center", flexShrink: 0, transition: "color 200ms ease" }}>
          {isActive
            ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          }
        </button>
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="search" inputMode="search" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
          value={query}
          placeholder={mode === "online" ? "Search YouTube Music" : "Search Library"}
          aria-label="Search"
          onFocus={onActivate}
          onChange={(e) => { onActivate(); onQueryChange(e.target.value); }}
          onKeyDown={(e) => { if (e.key === "Enter") { onSubmit(query); inputRef.current?.blur(); } if (e.key === "Escape") onDeactivate(); }}
          style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontFamily: "var(--font-body)", fontSize: "var(--text-md)", fontWeight: 400, color: "var(--color-text-primary)", caretColor: "var(--color-accent)", minWidth: 0 }}
        />
        {query.length > 0 && (
          <button type="button" aria-label="Clear" onClick={() => { onClear(); inputRef.current?.focus(); }} style={{ background: "var(--color-text-muted)", border: "none", borderRadius: "50%", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, color: "var(--color-bg)", padding: 0 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /><line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg>
          </button>
        )}
        <button type="button" aria-label={mode === "online" ? "Switch to local library" : "Switch to online"} onClick={onModeToggle} style={{ background: "none", border: "none", padding: 6, cursor: "pointer", flexShrink: 0, color: mode === "online" ? "var(--color-accent)" : "var(--color-text-secondary)", display: "flex", alignItems: "center", transition: "color 200ms ease" }}>
          {mode === "online"
            ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
            : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
          }
        </button>
      </div>
    </div>
  );
}

// ─── Collapsed Tab Bar ──────────────────────────────────────────────────────

interface CollapsedTabBarProps { activeTab: ActiveTab; onTabChange: (t: ActiveTab) => void; }
function CollapsedTabBar({ activeTab, onTabChange }: CollapsedTabBarProps) {
  const tabs: { key: ActiveTab; label: string }[] = [{ key: "explore", label: "Explore" }, { key: "echo-chart", label: "Echo Chart" }, { key: "albums", label: "Albums" }];
  return (
    <div style={{ display: "flex", padding: "4px 16px 0", borderBottom: "1.5px solid var(--color-border)" }}>
      {tabs.map(t => {
        const sel = activeTab === t.key;
        return (
          <button key={t.key} type="button" onClick={() => onTabChange(t.key)} style={{ flex: 1, background: "none", border: "none", padding: "10px 0 12px", fontFamily: "var(--font-body)", fontSize: "var(--text-sm)", fontWeight: sel ? 700 : 500, color: sel ? "var(--color-accent)" : "var(--color-text-secondary)", cursor: "pointer", position: "relative", transition: "color 200ms ease" }}>
            {t.label}
            {sel && <span style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: 32, height: 3, borderRadius: 2, background: "var(--color-accent)" }} />}
          </button>
        );
      })}
    </div>
  );
}

// ─── Result Filter Tabs ──────────────────────────────────────────────────────

interface ResultFilterTabsProps { activeTab: ResultTab; counts: { songs: number; artists: number; albums: number }; onTabChange: (t: ResultTab) => void; }
function ResultFilterTabs({ activeTab, counts, onTabChange }: ResultFilterTabsProps) {
  const tabs: { key: ResultTab; label: string; count?: number }[] = [{ key: "all", label: "All" }, { key: "songs", label: "Songs", count: counts.songs }, { key: "artists", label: "Artists", count: counts.artists }, { key: "albums", label: "Albums", count: counts.albums }];
  return (
    <div style={{ display: "flex", gap: 8, padding: "8px 16px 12px", overflowX: "auto", scrollbarWidth: "none" }}>
      {tabs.map(t => {
        if (t.count !== undefined && t.count === 0) return null;
        const sel = activeTab === t.key;
        return <button key={t.key} type="button" onClick={() => onTabChange(t.key)} aria-pressed={sel} style={{ background: sel ? "var(--color-accent)" : "var(--color-surface-2)", color: sel ? "var(--color-accent-on)" : "var(--color-text-secondary)", border: `1.5px solid ${sel ? "var(--color-accent)" : "var(--color-border)"}`, borderRadius: "var(--radius-full)", padding: "6px 16px", fontSize: "var(--text-sm)", fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)", flexShrink: 0, transition: "all 200ms var(--ease-standard)" }}>{t.label}{t.count !== undefined ? ` (${t.count})` : ""}</button>;
      })}
    </div>
  );
}

// ─── Section Header ──────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return <p style={{ margin: 0, padding: "14px 16px 8px", fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--color-accent)", textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</p>;
}

// ─── Echo Chart Tab ──────────────────────────────────────────────────────────

function EchoChartTab() {
  const [trending, setTrending] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const { addRecentlyPlayed } = useApp();

  useEffect(() => {
    setLoading(true);
    getYouTubeMusicTrending(20).then(s => { setTrending(s); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: "0 16px" }}><SkeletonList count={6} /></div>;
  return (
    <div>
      <SectionHeader label="Echo Chart — Trending Now" />
      <div style={{ padding: "0 16px" }}>
        {trending.map((song, i) => <SongCard key={song.id} song={song} queue={trending} index={i} showIndex onPlay={() => addRecentlyPlayed(song)} />)}
      </div>
    </div>
  );
}

// ─── Local Search Results ────────────────────────────────────────────────────

function LocalSearchResults({ query, onPlay }: { query: string; onPlay: (s: Song) => void }) {
  const { state } = useApp();
  const norm = query.toLowerCase();
  const matches = [...state.favorites, ...state.recentlyPlayed, ...state.downloads].filter(s => (s.title || "").toLowerCase().includes(norm) || (s.artist || "").toLowerCase().includes(norm));
  const unique = Array.from(new Map(matches.map(s => [s.id, s])).values());
  if (unique.length === 0) return <EmptyState title={`No local results for "${query}"`} subtitle="Try searching online." />;
  return (
    <div>
      <SectionHeader label={`Library Results (${unique.length})`} />
      <div style={{ padding: "0 16px" }}>
        {unique.map((song, i) => <SongCard key={song.id} song={song} queue={unique} index={i} onPlay={() => onPlay(song)} />)}
      </div>
    </div>
  );
}

// ─── Main Search Screen ──────────────────────────────────────────────────────

export function SearchScreen() {
  const { state: appState, addSearchRecentPlayed, clearSearchRecentPlayed } = useApp();
  const { playSong } = usePlayer();

  const [query, setQuery] = useState("");
  const [searchActive, setSearchActive] = useState(false);
  const [searchMode, setSearchMode] = useState<SearchMode>("online");
  const [collapsedTab, setCollapsedTab] = useState<ActiveTab>("explore");
  const [resultTab, setResultTab] = useState<ResultTab>("all");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [smartIntent, setSmartIntent] = useState<AISmartSearchIntent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [suggestions, setSuggestions] = useState<SearchSuggestionState>({ history: [], suggestions: [], items: [], isFromLink: false, isLoading: false });

  const searchReqIdRef = useRef<number>(0);
  const suggReqIdRef = useRef<number>(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);

  const debouncedQuery = useDebounce(query, isDirectMediaUrl(query) ? 0 : 300);

  // Hide keyboard on scroll
  useEffect(() => {
    const el = scrollAreaRef.current;
    if (!el) return;
    const onScroll = () => { if (document.activeElement === inputRef.current) inputRef.current?.blur(); };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Layer 1: suggestions
  useEffect(() => {
    const q = query.trim();
    if (!q || !searchActive) { setSuggestions({ history: [], suggestions: [], items: [], isFromLink: false, isLoading: false }); return; }
    const id = ++suggReqIdRef.current;
    onlineSearchSuggestionViewModel.getSuggestions(q).then(s => { if (suggReqIdRef.current === id) setSuggestions(s); });
  }, [query, searchActive]);

  // Layer 2: full search
  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    if (!trimmed || !hasSearched) { if (!trimmed) { setResults(null); setSmartIntent(null); setError(false); setHasSearched(false); } return; }
    const id = ++searchReqIdRef.current;
    setLoading(true); setError(false); setResultTab("all");
    aiSmartSearchEngine.executeSearch(trimmed, 24)
      .then(({ result, intent }) => { if (searchReqIdRef.current === id) { setResults(result); setSmartIntent(intent); setLoading(false); } })
      .catch(() => { if (searchReqIdRef.current === id) { setError(true); setLoading(false); } });
  }, [debouncedQuery, hasSearched]);

  const handleActivate = useCallback(() => { setSearchActive(true); setTimeout(() => inputRef.current?.focus(), 50); }, []);
  const handleDeactivate = useCallback(() => { setSearchActive(false); setQuery(""); setResults(null); setHasSearched(false); setSmartIntent(null); setError(false); setSuggestions({ history: [], suggestions: [], items: [], isFromLink: false, isLoading: false }); inputRef.current?.blur(); }, []);
  const handleSubmit = useCallback((q: string) => { const t = q.trim(); if (!t) return; insertSearchHistory(t); setHasSearched(true); setSearchActive(false); inputRef.current?.blur(); }, []);
  const handleSuggestionSelect = useCallback((s: string) => { setQuery(s); handleSubmit(s); }, [handleSubmit]);
  const handleFill = useCallback((s: string) => { setQuery(s); setTimeout(() => inputRef.current?.focus(), 50); }, []);
  const handleHistoryDelete = useCallback((q: string) => { deleteSearchHistoryEntry(q); setSuggestions(prev => ({ ...prev, history: prev.history.filter(h => h.query !== q) })); }, []);
  const handleChipSelect = useCallback((q: string) => { setQuery(q); handleSubmit(q); }, [handleSubmit]);
  const handleClear = useCallback(() => { setResults(null); setSmartIntent(null); setError(false); setHasSearched(false); setSuggestions({ history: [], suggestions: [], items: [], isFromLink: false, isLoading: false }); }, []);
  const handleSongPlay = useCallback((song: Song) => {
    playSong(song, [song], 0);
    addSearchRecentPlayed(song);
  }, [playSong, addSearchRecentPlayed]);

  const hasResults = results && (results.songs.length + results.artists.length + results.albums.length) > 0;
  const topSong = results?.songs[0] ?? null;
  const remainingSongs = results?.songs.slice(1) ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Sticky Header */}
      <div style={{ flexShrink: 0 }}>
        {!searchActive && <header style={{ padding: "20px 16px 10px" }}><h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "var(--text-2xl)", color: "var(--color-text-primary)" }}>Search</h1></header>}
        <div style={{ paddingTop: searchActive ? 10 : 0 }}>
          <AnimatedSearchBar query={query} isActive={searchActive} mode={searchMode} onQueryChange={setQuery} onActivate={handleActivate} onDeactivate={handleDeactivate} onSubmit={handleSubmit} onClear={handleClear} onModeToggle={() => setSearchMode(m => m === "online" ? "local" : "online")} inputRef={inputRef} />
        </div>
        {!searchActive && !hasResults && <CollapsedTabBar activeTab={collapsedTab} onTabChange={setCollapsedTab} />}
      </div>

      {/* Scrollable Content */}
      <div ref={scrollAreaRef} className="scroll-area" style={{ flex: 1, paddingBottom: "var(--content-bottom-pad)" }}>

        {/* ACTIVE: Suggestions */}
        {searchActive && (
          <div style={{ paddingBottom: 24 }}>
            {suggestions.isFromLink && (
              <div style={{ margin: "12px 16px 0", padding: "10px 14px", borderRadius: "var(--radius-md)", background: "var(--color-accent-dim)", border: "1px solid rgba(245,158,11,0.25)", display: "flex", alignItems: "center", gap: 8, fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--color-accent)" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                Direct link detected — press Enter to play instantly
              </div>
            )}

            {suggestions.history.length > 0 && (
              <div>
                <SectionHeader label="Search History" />
                {suggestions.history.map(e => <SearchHistoryItem key={e.query} query={e.query} onDelete={handleHistoryDelete} onFill={handleFill} />)}
                <button type="button" onClick={() => { clearAllSearchHistory(); setSuggestions(prev => ({ ...prev, history: [] })); }} style={{ background: "none", border: "none", padding: "8px 16px", fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--color-text-muted)", cursor: "pointer" }}>
                  Clear search history
                </button>
              </div>
            )}

            {suggestions.suggestions.length > 0 && (
              <div>
                <SectionHeader label="Suggestions" />
                {suggestions.suggestions.map(s => <SuggestionItem key={s} suggestion={s} onSelect={handleSuggestionSelect} onFill={handleFill} />)}
              </div>
            )}

            {!suggestions.isFromLink && suggestions.history.length === 0 && suggestions.suggestions.length === 0 && query.length > 0 && (
              <div style={{ padding: "24px 16px", textAlign: "center" }}>
                <p style={{ color: "var(--color-text-muted)", fontSize: "var(--text-sm)", margin: 0 }}>Press Enter to search for <strong style={{ color: "var(--color-text-secondary)" }}>"{query}"</strong></p>
              </div>
            )}

            {!query && appState.searchRecentlyPlayed.length > 0 && (
              <div>
                <SectionHeader label="Recents" />
                <div style={{ padding: "0 16px" }}>
                  {appState.searchRecentlyPlayed.slice(0, 20).map((song) => <SongCard key={song.id} song={song} queue={[song]} index={0} onPlay={() => handleSongPlay(song)} />)}
                </div>
                <div style={{ display: "flex", justifyContent: "center", padding: "12px 0" }}>
                  <button type="button" onClick={clearSearchRecentPlayed} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-full)", padding: "9px 20px", fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--color-text-secondary)", cursor: "pointer" }}>Clear recents</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* COLLAPSED: Explore / Echo Chart / Albums */}
        {!searchActive && !hasResults && !loading && (
          <div>
            {collapsedTab === "explore" && (
              <div>
                <p style={{ padding: "12px 16px 8px", margin: 0, fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Browse by Mood</p>
                <ExploreGrid onChipSelect={handleChipSelect} />
              </div>
            )}
            {collapsedTab === "echo-chart" && <EchoChartTab />}
            {collapsedTab === "albums" && <EmptyState title="New Releases" subtitle="Browse new album releases in your library." />}
          </div>
        )}

        {/* RESULTS */}
        {!searchActive && (
          <>
            {loading && <div style={{ padding: "16px" }}><SkeletonList count={6} /></div>}
            {error && !loading && <div style={{ padding: "16px" }}><EmptyState title="Search unavailable" subtitle="Couldn't reach the music service. Check your connection." /></div>}
            {results && !hasResults && !loading && <EmptyState title={`No results for "${query}"`} subtitle="Try a different song, artist, or album name." />}

            {searchMode === "local" && query && !loading && <LocalSearchResults query={query} onPlay={s => handleSongPlay(s)} />}

            {hasResults && !loading && searchMode === "online" && (
              <>
                {smartIntent?.isNaturalLanguage && smartIntent.smartTag && (
                  <div style={{ margin: "8px 16px 4px", padding: "8px 14px", borderRadius: "var(--radius-md)", background: "var(--color-accent-dim)", border: "1px solid rgba(245,158,11,0.25)", display: "flex", alignItems: "center", justifyContent: "space-between", color: "var(--color-accent)", fontSize: "var(--text-xs)", fontWeight: 600 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span>✨</span><span>AI Intent: <strong>{smartIntent.smartTag}</strong></span></div>
                    {smartIntent.categoryHint && <span style={{ opacity: 0.75, fontSize: "11px" }}>{smartIntent.categoryHint}</span>}
                  </div>
                )}

                <ResultFilterTabs activeTab={resultTab} counts={{ songs: results!.songs.length, artists: results!.artists.length, albums: results!.albums.length }} onTabChange={setResultTab} />

                {resultTab === "all" && (
                  <div>
                    {topSong && <TopResultCard song={topSong} label={suggestions.isFromLink ? "From Link" : "Top Result"} onPlay={s => handleSongPlay(s)} onMore={() => {}} />}
                    {remainingSongs.length > 0 && (
                      <div>
                        <SectionHeader label="Songs" />
                        <div style={{ padding: "0 16px" }}>
                          {remainingSongs.slice(0, 12).map((song) => <SongCard key={song.id} song={song} queue={[song]} index={0} onPlay={() => handleSongPlay(song)} />)}
                        </div>
                      </div>
                    )}
                    {results!.artists.length > 0 && (
                      <div>
                        <SectionHeader label="Artists" />
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, padding: "4px 16px 8px" }}>
                          {results!.artists.slice(0, 8).map(a => <ArtistCard key={a.id} artist={a} size={72} />)}
                        </div>
                      </div>
                    )}
                    {results!.albums.length > 0 && (
                      <div>
                        <SectionHeader label="Albums" />
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14, padding: "4px 16px 12px" }}>
                          {results!.albums.slice(0, 6).map(al => <AlbumCard key={al.id} album={al} size={140} />)}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {resultTab === "songs" && results!.songs.length > 0 && (
                  <div>
                    {topSong && <TopResultCard song={topSong} label="Top Result" onPlay={s => handleSongPlay(s)} onMore={() => {}} />}
                    <div style={{ padding: "4px 16px" }}>
                      {results!.songs.slice(1).map((song) => <SongCard key={song.id} song={song} queue={[song]} index={0} onPlay={() => handleSongPlay(song)} />)}
                    </div>
                  </div>
                )}

                {resultTab === "artists" && <div style={{ display: "flex", flexWrap: "wrap", gap: 16, padding: "8px 16px" }}>{results!.artists.map(a => <ArtistCard key={a.id} artist={a} size={80} />)}</div>}
                {resultTab === "albums" && <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16, padding: "8px 16px" }}>{results!.albums.map(al => <AlbumCard key={al.id} album={al} size={150} />)}</div>}
              </>
            )}
          </>
        )}

        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}
