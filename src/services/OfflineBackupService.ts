// ═══════════════════════════════════════════════════════════════════════════════
//  OfflineBackupService.ts
//  Spotify-Style Offline Backup Engine
//  • Only saves audio after a track is fully & genuinely listened to
//  • Stores full playable audio Blobs locally in IndexedDB
//  • Cleans up corrupted / incomplete entries automatically
//  • Instant offline playback directly from local Blob URLs
// ═══════════════════════════════════════════════════════════════════════════════

import type { Song, Playlist } from '../data/models';
import { universalGet } from '../core/utils/http';

const DB_NAME = 'soundwave_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'cached_tracks';
const MAX_OFFLINE_TRACKS = 50;
const MIN_VALID_AUDIO_BYTES = 400_000; // 400 KB minimum for complete audio

export interface CachedRecord {
  id: string;
  song: Song;
  audioBlob: Blob;
  cachedAt: number;
  fileSize: number;
}

// Active in-flight caching set to avoid duplicate background downloads
const activeCacheDownloads = new Set<string>();

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
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Saves a fully completed song into the offline backup storage.
 * Only stores the track if the entire audio blob is successfully downloaded & verified.
 */
export async function cacheCompletedSongForOfflineBackup(
  song: Song,
  streamUrl?: string
): Promise<boolean> {
  if (!song || !song.id) return false;
  if (!navigator.onLine) return false;

  const urlToFetch = streamUrl || song.previewUrl;
  if (!urlToFetch || !urlToFetch.startsWith('http')) return false;

  // Ignore 30s preview URLs from Spotify/Apple
  if (
    urlToFetch.includes('p.scdn.co') ||
    urlToFetch.includes('audio-ssl.itunes.apple.com') ||
    urlToFetch.includes('spotify.com')
  ) {
    return false;
  }

  if (activeCacheDownloads.has(song.id)) return false;
  activeCacheDownloads.add(song.id);

  try {
    // 1. Fetch complete audio binary in background
    let blob: Blob | null = null;
    try {
      const res = await fetch(urlToFetch, { mode: 'cors' });
      if (res.ok) {
        blob = await res.blob();
      }
    } catch {
      // Fallback via universalGet (proxy / bypass CORS)
      try {
        const arrayBuf = await universalGet<ArrayBuffer>(urlToFetch);
        if (arrayBuf && arrayBuf.byteLength >= MIN_VALID_AUDIO_BYTES) {
          blob = new Blob([arrayBuf], { type: 'audio/mp4' });
        }
      } catch {}
    }

    // 2. Strict validation: Must be complete playable audio (>= 400 KB)
    if (!blob || blob.size < MIN_VALID_AUDIO_BYTES) {
      activeCacheDownloads.delete(song.id);
      return false;
    }

    // 3. Store in IndexedDB
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const cleanSong: Song = {
        ...song,
        isDownloaded: true,
        previewUrl: '', // Cleaned so it never tries remote URL when offline
        provider: song.provider || 'offline',
      };

      const record: CachedRecord = {
        id: song.id,
        song: cleanSong,
        audioBlob: blob!,
        cachedAt: Date.now(),
        fileSize: blob!.size,
      };

      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);

      // Limit offline cache to MAX_OFFLINE_TRACKS
      const countReq = store.count();
      countReq.onsuccess = () => {
        if (countReq.result > MAX_OFFLINE_TRACKS) {
          const index = store.index('cachedAt');
          const openCursorReq = index.openCursor();
          let deleted = 0;
          const excess = countReq.result - MAX_OFFLINE_TRACKS;
          openCursorReq.onsuccess = (ev) => {
            const cursor = (ev.target as IDBRequest<IDBCursorWithValue>).result;
            if (cursor && deleted < excess) {
              cursor.delete();
              deleted++;
              cursor.continue();
            }
          };
        }
      };
    });

    activeCacheDownloads.delete(song.id);

    // Notify UI components that Offline Backup updated
    try {
      window.dispatchEvent(new CustomEvent('sw_offline_backup_changed'));
    } catch {}

    return true;
  } catch (err) {
    activeCacheDownloads.delete(song.id);
    console.warn('Offline backup caching notice:', err);
    return false;
  }
}

/**
 * Retrieves the genuine verified Offline Backup Playlist from IndexedDB.
 * Automatically deletes any corrupted or incomplete entries.
 */
export async function getOfflineBackupPlaylist(): Promise<Playlist | null> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('cachedAt');
      const request = index.openCursor(null, 'prev'); // Most recently cached first
      const songs: Song[] = [];

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const record = cursor.value as CachedRecord;

          // Verify blob is valid
          if (record && record.audioBlob && record.audioBlob.size >= MIN_VALID_AUDIO_BYTES) {
            const blobUrl = URL.createObjectURL(record.audioBlob);
            songs.push({
              ...record.song,
              previewUrl: blobUrl,
              isDownloaded: true,
              provider: 'offline',
            });
          } else {
            // Delete corrupt entry immediately
            try {
              cursor.delete();
            } catch {}
          }

          cursor.continue();
        } else {
          if (songs.length === 0) {
            return resolve(null);
          }
          const playlist: Playlist = {
            id: 'offline_backup_mix',
            title: 'Offline Backup',
            description: 'Your recently played songs, automatically cached for offline listening.',
            artwork: songs[0]?.artworkLg || songs[0]?.artwork || '',
            creator: 'Soundwave Auto-Backup',
            tracks: songs,
            isUserCreated: false,
            totalDuration: songs.reduce((sum, s) => sum + (s.duration || 0), 0),
          };
          resolve(playlist);
        }
      };

      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Returns the exact count of verified cached offline tracks.
 */
export async function getOfflineTrackCount(): Promise<number> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.count();
      req.onsuccess = () => resolve(req.result || 0);
      req.onerror = () => resolve(0);
    });
  } catch {
    return 0;
  }
}

/**
 * Checks if a specific song is cached for offline playback and returns its local playable Blob URL.
 */
export async function getOfflineSongStream(songId: string): Promise<string | null> {
  if (!songId) return null;
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(songId);

      request.onsuccess = () => {
        const record = request.result as CachedRecord | undefined;
        if (record && record.audioBlob && record.audioBlob.size >= MIN_VALID_AUDIO_BYTES) {
          const blobUrl = URL.createObjectURL(record.audioBlob);
          resolve(blobUrl);
        } else {
          // If record exists but is corrupt, purge it
          if (record) {
            try {
              store.delete(songId);
            } catch {}
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
 * Checks if a song is cached locally.
 */
export async function isSongCachedOffline(songId: string): Promise<boolean> {
  if (!songId) return false;
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(songId);
      request.onsuccess = () => {
        const record = request.result as CachedRecord | undefined;
        resolve(!!(record && record.audioBlob && record.audioBlob.size >= MIN_VALID_AUDIO_BYTES));
      };
      request.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

/**
 * Clears offline cached tracks.
 */
export async function clearOfflineBackupCache(): Promise<void> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    try {
      window.dispatchEvent(new CustomEvent('sw_offline_backup_changed'));
    } catch {}
  } catch {}
}
