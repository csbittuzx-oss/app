// ═══════════════════════════════════════════
//  SearchHistoryService — Layer 4
//  localStorage-backed search history (Room DB equivalent)
// ═══════════════════════════════════════════

const HISTORY_KEY = "sw_search_history_v2";
const MAX_HISTORY = 50;

export interface SearchHistoryEntry {
  query: string;
  timestamp: number;
}

function readEntries(): SearchHistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEntries(entries: SearchHistoryEntry[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
  } catch {}
}

/**
 * Insert a search query into history. Skips duplicates and keeps entries sorted by recency.
 */
export function insertSearchHistory(query: string, pause = false): void {
  if (pause) return;
  const clean = (query || "").trim();
  if (!clean || clean.length < 2) return;
  const entries = readEntries().filter(e => e.query.toLowerCase() !== clean.toLowerCase());
  entries.unshift({ query: clean, timestamp: Date.now() });
  writeEntries(entries.slice(0, MAX_HISTORY));
}

/**
 * Fetch history entries that contain the partial query string.
 * Returns most recent matches first (sorted by timestamp DESC).
 */
export function getSearchHistory(partialQuery: string, limit = 3): SearchHistoryEntry[] {
  const norm = (partialQuery || "").trim().toLowerCase();
  const entries = readEntries();
  if (!norm) return entries.slice(0, limit);
  return entries.filter(e => e.query.toLowerCase().includes(norm)).slice(0, limit);
}

/**
 * Delete a single search history entry by query string.
 */
export function deleteSearchHistoryEntry(query: string): void {
  const entries = readEntries().filter(e => e.query.toLowerCase() !== (query || "").trim().toLowerCase());
  writeEntries(entries);
}

/**
 * Wipe entire search history.
 */
export function clearAllSearchHistory(): void {
  try {
    localStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem("sw_search_history");
  } catch {}
}

/**
 * Get all raw history entries (used for full history display).
 */
export function getAllSearchHistory(): SearchHistoryEntry[] {
  return readEntries();
}
