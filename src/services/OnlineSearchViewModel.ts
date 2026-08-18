// ═══════════════════════════════════════════
//  OnlineSearchViewModel — Layer 1 + Layer 2
//  5-Layer Smart Search Engine
//  Layer 1: Suggestions (history + InnerTube autocomplete + URL detection)
//  Layer 2: Full search results (Top Result card + multi-section + pagination)
// ═══════════════════════════════════════════

import type { SearchResult, Song } from "../data/models";
import { parseDirectMusicUrl, isDirectMediaUrl } from "./DirectLinkParser";
import { sanitizeSearchSongs, distinctBy } from "./SearchNoiseFilter";
import { searchMusic, calculateSearchRelevance } from "../data/repository/musicRepository";
import { universalGet } from "../core/utils/http";
import {
  insertSearchHistory,
  getSearchHistory,
  type SearchHistoryEntry,
} from "./SearchHistoryService";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SearchSuggestionState {
  history: SearchHistoryEntry[];
  suggestions: string[];
  items: Song[];
  isFromLink: boolean;
  isLoading: boolean;
}

export interface SearchSummarySection {
  type: "top_result" | "songs" | "albums" | "artists";
  label: string;
  items: Song[];
}

export interface SearchSummaryPage {
  sections: SearchSummarySection[];
  query: string;
  total: number;
  hasMore: boolean;
}

// ─── Class-based ViewModel (used by hooks below) ──────────────────────────────

export class OnlineSearchViewModel {
  /**
   * Layer 2: Full Search Results pipeline
   * 5-step: URL Parser → Local History → InnerTube ML → Noise Filter → Tier Ranking
   */
  async search(query: string, limit = 25): Promise<SearchResult> {
    const cleanQuery = (query || "").trim();
    if (!cleanQuery) {
      return { songs: [], artists: [], albums: [], query: "", total: 0 };
    }

    // ─── Step 1: Smart Direct URL & Link Parser ───
    const directResult = await parseDirectMusicUrl(cleanQuery);
    if (directResult && directResult.searchResult) {
      return directResult.searchResult;
    }

    // ─── Step 2: Local History Matching ───
    const normalizedQ = cleanQuery.toLowerCase();
    const localRecentlyPlayed = _getLocalStoredSongs("sw_search_recently_played");
    const localGeneralPlayed = _getLocalStoredSongs("sw_recently_played");
    const combinedLocal = [...localRecentlyPlayed, ...localGeneralPlayed];
    const localMatches = combinedLocal.filter(s => {
      if (!s) return false;
      const t = (s.title || "").toLowerCase();
      const a = (s.artist || "").toLowerCase();
      return t.includes(normalizedQ) || a.includes(normalizedQ);
    });

    // ─── Step 3: Multi-source InnerTube ML Search ───
    const remoteResult = await searchMusic(cleanQuery, limit);

    // ─── Step 4: Noise & Shorts Filtering ───
    const rawCandidateSongs = [...localMatches.slice(0, 3), ...remoteResult.songs];
    const sanitizedSongs = sanitizeSearchSongs(rawCandidateSongs);

    // ─── Step 5: Tier-Based Ranking (view count + exact title match) ───
    const rankedSongs = [...sanitizedSongs].sort((a, b) => {
      const scoreA = calculateSearchRelevance(a, cleanQuery);
      const scoreB = calculateSearchRelevance(b, cleanQuery);
      return scoreB - scoreA;
    });

    const finalSongs = distinctBy(rankedSongs, s => s.id).slice(0, limit * 2);
    const finalArtists = distinctBy(remoteResult.artists, a => a.name.toLowerCase()).slice(0, 12);
    const finalAlbums = distinctBy(remoteResult.albums, al => al.title.toLowerCase()).slice(0, 12);

    return {
      songs: finalSongs,
      artists: finalArtists,
      albums: finalAlbums,
      query: cleanQuery,
      total: finalSongs.length + finalArtists.length + finalAlbums.length,
    };
  }

  /**
   * Layer 2: Build ordered SearchSummaryPage with Top Result always first.
   */
  async searchSummary(query: string, limit = 25): Promise<SearchSummaryPage> {
    const result = await this.search(query, limit);
    const sections: SearchSummarySection[] = [];

    // Top Result (songs[0]) is always pinned as its own section (musicCardShelfRenderer equivalent)
    if (result.songs.length > 0) {
      sections.push({ type: "top_result", label: isDirectMediaUrl(query) ? "From Link" : "Top Result", items: [result.songs[0]] });
    }

    // Remaining songs (songs[1..])
    if (result.songs.length > 1) {
      sections.push({ type: "songs", label: "Songs", items: result.songs.slice(1) });
    }

    if (result.albums.length > 0) {
      sections.push({ type: "albums", label: "Albums", items: result.albums as unknown as Song[] });
    }

    if (result.artists.length > 0) {
      sections.push({ type: "artists", label: "Artists", items: result.artists as unknown as Song[] });
    }

    return {
      sections,
      query,
      total: result.total,
      hasMore: result.songs.length >= limit,
    };
  }
}

export class OnlineSearchSuggestionViewModel {
  /**
   * Layer 1: Real-time suggestions pipeline
   * Parallel: local history top-3 + YouTube InnerTube autocomplete + URL detection
   */
  async getSuggestions(query: string): Promise<SearchSuggestionState> {
    const cleanQuery = (query || "").trim();

    if (!cleanQuery) {
      return { history: [], suggestions: [], items: [], isFromLink: false, isLoading: false };
    }

    // ─── Pre-check: Is this a direct YouTube/Spotify/JioSaavn URL? ───
    if (isDirectMediaUrl(cleanQuery)) {
      return { history: [], suggestions: [], items: [], isFromLink: true, isLoading: false };
    }

    // ─── Run 2 fetches in parallel: history + live suggestions ───
    const [historyEntries, liveSuggestions] = await Promise.all([
      Promise.resolve(getSearchHistory(cleanQuery, 3)),
      _fetchYouTubeSuggestions(cleanQuery),
    ]);

    // Deduplicate: remove suggestions that are already in history
    const historySet = new Set(historyEntries.map(h => h.query.toLowerCase()));
    const filteredSuggestions = liveSuggestions.filter(s => !historySet.has(s.toLowerCase()));

    return {
      history: historyEntries,
      suggestions: filteredSuggestions.slice(0, 6),
      items: [],
      isFromLink: false,
      isLoading: false,
    };
  }
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

function _getLocalStoredSongs(key: string): Song[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function _fetchYouTubeSuggestions(query: string): Promise<string[]> {
  try {
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(query)}`;
    const data = await universalGet(url);
    if (Array.isArray(data?.[1])) {
      return data[1].filter((s: unknown) => typeof s === "string").slice(0, 8);
    }
  } catch {}
  return [];
}

// ─── Singleton instances ──────────────────────────────────────────────────────

export const onlineSearchViewModel = new OnlineSearchViewModel();
export const onlineSearchSuggestionViewModel = new OnlineSearchSuggestionViewModel();

// ─── Re-export insertSearchHistory for use in SearchScreen ───────────────────
export { insertSearchHistory };
