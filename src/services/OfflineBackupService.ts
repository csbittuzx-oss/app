import type { Song, Playlist } from '../data/models';
import { universalGet } from '../core/utils/http';
import { resolveFullTrack, formatMediaUrlWithQuality, isPreviewAudioUrl } from '../data/api/saavnApi';
import { CONFIG } from '../config';

const DB_NAME = 'soundwave_offline_db';
const DB_VERSION = 2;
const STORE_NAME = 'cached_tracks';
const MAX_OFFLINE_TRACKS = 100; // Keep up to 100 songs (~500MB - 1GB)
const MIN_AUDIO_SIZE_BYTES = 200_000; // Minimum 200KB to ensure valid playable track

export interface CachedRecord {
  id: string;
  song: Song;
  audioBlob: Blob;
  audioSize: number;
  artworkData?: string; // Base64 data URL for 100% offline artwork rendering
  cachedAt: number;
  lastPlayedAt: number;
}

// In-memory set of cached song IDs for instant synchronous lookups
const cachedSongIds = new Set<string>();
const inFlightCaches = new Map<string, Promise<boolean>>();
let activePlayingSongId: string | null = null;
let isInitialized = false;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported'));
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('cachedAt', 'cachedAt', { unique: false });
        store.createIndex('lastPlayedAt', 'lastPlayedAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Initialize offline cache registry on app launch.
 */
export async function initOfflineStorage(): Promise<void> {
  if (isInitialized) return;
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAllKeys();
    req.onsuccess = () => {
      cachedSongIds.clear();
      (req.result as string[]).forEach((id) => cachedSongIds.add(id));
      isInitialized = true;
    };
  } catch (err) {
    console.warn('initOfflineStorage error:', err);
  }
}

// Auto-run init
if (typeof window !== 'undefined') {
  initOfflineStorage().catch(() => {});
}

/**
 * Synchronously checks if a song is available offline.
 */
export function isSongCached(songId: string): boolean {
  return cachedSongIds.has(songId);
}

/**
 * Inform cache manager of active playing track to prevent eviction.
 */
export function setCurrentlyPlayingSongId(songId: string | null) {
  activePlayingSongId = songId;
}

/**
 * Helper to download and convert artwork to persistent Base64 Data URL for offline display.
 */
async function fetchArtworkBase64(url: string): Promise<string | undefined> {
  if (!url || url.startsWith('data:')) return url;
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (res.ok) {
      const blob = await res.blob();
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve(url);
        reader.readAsDataURL(blob);
      });
    }
  } catch {
    try {
      const arrayBuf = await universalGet<ArrayBuffer>(url);
      if (arrayBuf) {
        const blob = new Blob([arrayBuf], { type: 'image/jpeg' });
        return new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = () => resolve(url);
          reader.readAsDataURL(blob);
        });
      }
    } catch {}
  }
  return undefined;
}

/**
 * Progressively caches a song's audio & artwork in the background while listening.
 */
export async function cacheSongForOfflineBackup(song: Song, streamUrl?: string): Promise<boolean> {
  if (!song || !song.id) return false;

  // If already in flight, reuse existing promise
  if (inFlightCaches.has(song.id)) {
    return inFlightCaches.get(song.id)!;
  }

  const cachePromise = (async () => {
    try {
      let targetUrl: string | null =
        streamUrl || (song.previewUrl && !song.previewUrl.startsWith('blob:') ? song.previewUrl : null);

      // 1. Resolve authentic 320kbps stream if missing or short preview
      if (
        !targetUrl ||
        isPreviewAudioUrl(targetUrl) ||
        targetUrl.includes('youtube') ||
        targetUrl.includes('googlevideo')
      ) {
        try {
          const resolved = await resolveFullTrack(song.title, song.artist, 'high', song.duration);
          if (resolved?.streamUrl && !isPreviewAudioUrl(resolved.streamUrl)) {
            targetUrl = resolved.streamUrl;
          }
        } catch {}
      }

      if (!targetUrl || isPreviewAudioUrl(targetUrl)) {
        return false;
      }

      const highQualityUrl = formatMediaUrlWithQuality(targetUrl, 'high');

      // 2. Fetch audio blob progressively
      let blob: Blob | null = null;
      try {
        const res = await fetch(highQualityUrl, { mode: 'cors' });
        if (res.ok) {
          blob = await res.blob();
        }
      } catch {
        try {
          const arrayBuf = await universalGet<ArrayBuffer>(highQualityUrl);
          if (arrayBuf) {
            blob = new Blob([arrayBuf], { type: 'audio/mp4' });
          }
        } catch {}
      }

      // Verify valid playable track
      if (!blob || blob.size < MIN_AUDIO_SIZE_BYTES) {
        return false;
      }

      // 3. Cache artwork as Base64 data for offline rendering
      const artworkData = await fetchArtworkBase64(song.artworkLg || song.artwork || '');

      // 4. Save to IndexedDB
      const db = await openDatabase();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const record: CachedRecord = {
        id: song.id,
        song: {
          ...song,
          artwork: artworkData || song.artwork,
          artworkLg: artworkData || song.artworkLg || song.artwork,
          isDownloaded: true,
          previewUrl: '', // Cleaned so fresh local blob URL is assigned on load
        },
        audioBlob: blob,
        audioSize: blob.size,
        artworkData,
        cachedAt: Date.now(),
        lastPlayedAt: Date.now(),
      };

      await new Promise<void>((resolve, reject) => {
        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });

      cachedSongIds.add(song.id);

      // 5. Enforce LRU cache limits (evict oldest unplayed, never evict currently playing)
      enforceCacheLimits(store);

      return true;
    } catch (err) {
      console.warn('Smart offline caching error:', err);
      return false;
    } finally {
      inFlightCaches.delete(song.id);
    }
  })();

  inFlightCaches.set(song.id, cachePromise);
  return cachePromise;
}

/**
 * Enforces maximum offline track limit by removing least recently used songs.
 */
function enforceCacheLimits(store: IDBObjectStore) {
  try {
    const countReq = store.count();
    countReq.onsuccess = () => {
      if (countReq.result > MAX_OFFLINE_TRACKS) {
        const index = store.index('lastPlayedAt');
        const openCursorReq = index.openCursor();
        let deleted = 0;
        const excess = countReq.result - MAX_OFFLINE_TRACKS;

        openCursorReq.onsuccess = (ev) => {
          const cursor = (ev.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor && deleted < excess) {
            const item = cursor.value as CachedRecord;
            // Never delete currently active playing track
            if (item.id !== activePlayingSongId) {
              cachedSongIds.delete(item.id);
              cursor.delete();
              deleted++;
            }
            cursor.continue();
          }
        };
      }
    };
  } catch {}
}

/**
 * Retrieves the count of all offline cached tracks.
 */
export async function getOfflineTracksCount(): Promise<number> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.count();
      req.onsuccess = () => {
        cachedSongIds.clear();
        const cursorReq = store.openCursor();
        cursorReq.onsuccess = (e) => {
          const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor) {
            cachedSongIds.add(cursor.key as string);
            cursor.continue();
          }
        };
        resolve(req.result || 0);
      };
      req.onerror = () => resolve(0);
    });
  } catch {
    return cachedSongIds.size;
  }
}

/**
 * Retrieves all offline backup cached songs as a Playlist.
 */
export async function getOfflineBackupPlaylist(): Promise<Playlist> {
  const fallbackPlaylist: Playlist = {
    id: 'offline_backup_mix',
    title: 'Offline Backup',
    description: 'Your cached songs, available for offline listening anytime with zero internet.',
    artwork: '',
    creator: 'Soundwave Smart Cache',
    tracks: [],
    isUserCreated: false,
    totalDuration: 0,
  };

  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('lastPlayedAt');
      const request = index.openCursor(null, 'prev'); // Most recently played first
      const songs: Song[] = [];

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const record = cursor.value as CachedRecord;
          if (record.audioBlob && record.audioBlob.size >= MIN_AUDIO_SIZE_BYTES) {
            const blobUrl = URL.createObjectURL(record.audioBlob);
            songs.push({
              ...record.song,
              artwork: record.artworkData || record.song.artwork || CONFIG.ARTWORK_PLACEHOLDER,
              artworkLg: record.artworkData || record.song.artworkLg || record.song.artwork,
              previewUrl: blobUrl,
              isDownloaded: true,
            });
            cachedSongIds.add(record.id);
          }
          cursor.continue();
        } else {
          resolve({
            ...fallbackPlaylist,
            artwork: songs[0]?.artwork || '',
            tracks: songs,
            totalDuration: songs.reduce((sum, s) => sum + (s.duration || 0), 0),
          });
        }
      };

      request.onerror = () => resolve(fallbackPlaylist);
    });
  } catch {
    return fallbackPlaylist;
  }
}

/**
 * Checks if a specific song is cached for offline playback and returns its local Blob URL & artwork.
 */
export async function getOfflineSongStream(
  songId: string
): Promise<{ streamUrl: string; artwork?: string; song?: Song } | null> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(songId);

      request.onsuccess = () => {
        const record = request.result as CachedRecord | undefined;
        if (record && record.audioBlob && record.audioBlob.size >= MIN_AUDIO_SIZE_BYTES) {
          // Update lastPlayedAt timestamp
          record.lastPlayedAt = Date.now();
          store.put(record);
          cachedSongIds.add(songId);

          const blobUrl = URL.createObjectURL(record.audioBlob);
          resolve({
            streamUrl: blobUrl,
            artwork: record.artworkData || record.song.artwork,
            song: {
              ...record.song,
              isDownloaded: true,
              previewUrl: blobUrl,
            },
          });
        } else {
          if (record) {
            // Remove corrupted/incomplete blob
            store.delete(songId);
            cachedSongIds.delete(songId);
          }
          resolve(null);
        }
      };
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Clears all offline cached tracks.
 */
export async function clearOfflineBackupCache(): Promise<void> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    cachedSongIds.clear();
  } catch {
    // ignore
  }
}
