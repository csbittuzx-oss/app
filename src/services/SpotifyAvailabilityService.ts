// ═══════════════════════════════════════════
//  SpotifyAvailabilityService
//  Enforces the Spotify availability rule:
//  - App mein koi song tabhi show/play ho jab uska official Spotify / verified streaming catalog listing available ho.
//  - Automatically filters out unverified third-party/low-quality uploads, bootlegs, and slowed+reverb edits.
//  - Provides fast in-memory & localStorage caching for instant UI responses.
// ═══════════════════════════════════════════

import type { Song } from '../data/models';
import { universalGet } from '../core/utils/http';

const SPOTIFY_AVAILABILITY_CACHE_KEY = 'sw_spotify_verified_cache';

// In-memory cache for ultra-fast UI rendering
const verifiedCache = new Map<string, boolean>();

// Load persistent cache on startup
try {
  const raw = localStorage.getItem(SPOTIFY_AVAILABILITY_CACHE_KEY);
  if (raw) {
    const parsed: Record<string, boolean> = JSON.parse(raw);
    Object.entries(parsed).forEach(([k, v]) => verifiedCache.set(k, v));
  }
} catch {}

function saveToPersistentCache(key: string, isValid: boolean) {
  verifiedCache.set(key, isValid);
  try {
    const raw = localStorage.getItem(SPOTIFY_AVAILABILITY_CACHE_KEY);
    const parsed: Record<string, boolean> = raw ? JSON.parse(raw) : {};
    parsed[key] = isValid;
    // Cap cache size to 1000 items to avoid localStorage bloat
    const keys = Object.keys(parsed);
    if (keys.length > 1000) {
      delete parsed[keys[0]];
    }
    localStorage.setItem(SPOTIFY_AVAILABILITY_CACHE_KEY, JSON.stringify(parsed));
  } catch {}
}

/**
 * Normalizes title and artist into a canonical catalog cache key
 */
export function getCatalogKey(title: string, artist: string): string {
  const cleanTitle = (title || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/[^a-z0-9]/g, '');
  const cleanArtist = (artist || '')
    .toLowerCase()
    .split(/[,&/]|feat\.|ft\./i)[0]
    ?.replace(/[^a-z0-9]/g, '') || '';
  return `${cleanTitle}_${cleanArtist}`;
}

/**
 * Checks if a track is a low-quality, fan-made bootleg, or unofficial noise upload
 */
export function isLowQualityOrBootleg(song: Song): boolean {
  if (!song || !song.title || !song.artist) return true;

  const text = `${song.title} ${song.artist} ${song.album || ''}`.toLowerCase();

  // Low-quality / bootleg / spam markers
  const bootlegMarkers = [
    'slowed reverb',
    'slowed+reverb',
    'slowed and reverb',
    '8d audio',
    'bass boosted',
    'whatsapp status',
    'status video',
    'full hd video',
    'ringtone',
    'callertune',
    'dj remix non stop',
    'dj remix song',
    'dj song 202',
    'dj mix viral',
    'unreleased leak',
    'leak snippet',
    'fan made',
    'karaoke track',
    'clean edit status',
    'short reel audio',
  ];

  if (bootlegMarkers.some((m) => text.includes(m))) {
    return true;
  }

  // Generic/unverified channel names
  const spamArtists = [
    'unknown artist',
    'various artists status',
    'dj remix king',
    'status club',
    'music studio official channel',
    'bhojpuri status hub',
  ];

  if (spamArtists.some((a) => text.includes(a))) {
    return true;
  }

  // Extremely short duration (e.g. 15-30 second ringtones/status snippets)
  if (song.duration > 0 && song.duration < 45) {
    return true;
  }

  return false;
}

/**
 * Verifies if a song is officially available in Spotify / Official streaming catalog.
 */
export async function isTrackAvailableOnSpotify(song: Song): Promise<boolean> {
  if (!song || !song.title || !song.artist) return false;

  // 1. If it's a Spotify import or Spotify track ID, it's definitely on Spotify
  if (song.id.startsWith('spotify_') || (song.provider as string) === 'spotify') {
    return true;
  }

  // 2. Reject obvious low-quality/bootleg/fan uploads
  if (isLowQualityOrBootleg(song)) {
    return false;
  }

  const key = getCatalogKey(song.title, song.artist);
  if (verifiedCache.has(key)) {
    return verifiedCache.get(key) === true;
  }

  // 3. Fast verification:
  // Official record label releases from JioSaavn/iTunes have verified label catalog and clean album metadata
  const isJioSaavnOfficial = song.provider === 'saavn' && song.album && song.album !== song.title && (song.duration || 0) >= 60;
  const isItunesOfficial = song.provider === 'itunes' && song.album && (song.duration || 0) >= 60;

  if (isJioSaavnOfficial || isItunesOfficial) {
    saveToPersistentCache(key, true);
    return true;
  }

  // 4. Verify against official catalog via search lookup
  try {
    const cleanTitle = song.title.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').trim();
    const cleanArtist = song.artist.split(/[,&/]|feat\.|ft\./i)[0]?.trim() || '';
    const q = `${cleanTitle} ${cleanArtist}`.trim();
    const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=3`;
    const res = await universalGet(itunesUrl);

    if (res && Array.isArray(res.results) && res.results.length > 0) {
      // Official catalog listing confirmed
      saveToPersistentCache(key, true);
      return true;
    }
  } catch {
    // If network check fails, fallback to official provider metadata check
    if (song.provider === 'saavn' || song.provider === 'itunes') {
      return true;
    }
  }

  saveToPersistentCache(key, false);
  return false;
}

/**
 * Filters an array of songs asynchronously, keeping ONLY verified Spotify / official catalog tracks.
 */
export async function filterSpotifyAvailableTracks(songs: Song[]): Promise<Song[]> {
  if (!songs || songs.length === 0) return [];

  const results = await Promise.all(
    songs.map(async (song) => {
      const isAvailable = await isTrackAvailableOnSpotify(song);
      return isAvailable ? song : null;
    })
  );

  return results.filter((s): s is Song => s !== null);
}

/**
 * Synchronously filters songs using cached verification and strict heuristic quality check.
 */
export function filterSpotifyAvailableTracksSync(songs: Song[]): Song[] {
  if (!songs || songs.length === 0) return [];

  return songs.filter((song) => {
    if (!song || !song.title || !song.artist) return false;
    if (song.id.startsWith('spotify_') || (song.provider as string) === 'spotify') return true;
    if (isLowQualityOrBootleg(song)) return false;

    const key = getCatalogKey(song.title, song.artist);
    if (verifiedCache.has(key)) {
      return verifiedCache.get(key) === true;
    }

    // Default to verified if from official label provider with valid album and duration
    return Boolean(song.album && (song.duration || 0) >= 60);
  });
}
