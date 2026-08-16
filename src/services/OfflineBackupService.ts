import type { Song, Playlist } from '../data/models';
import { universalGet } from '../core/utils/http';

const DB_NAME = 'soundwave_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'cached_tracks';
const MAX_OFFLINE_TRACKS = 30;

interface CachedRecord {
  id: string;
  song: Song;
  audioBlob: Blob;
  cachedAt: number;
}

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
 * Caches a recently played song's audio in the background for Spotify-style Offline Backup.
 */
export async function cacheSongForOfflineBackup(song: Song, streamUrl?: string): Promise<void> {
  const urlToFetch = streamUrl || song.previewUrl;
  if (!urlToFetch || !urlToFetch.startsWith('http')) return;

  try {
    // 1. Fetch audio blob in background
    let blob: Blob | null = null;
    try {
      const res = await fetch(urlToFetch, { mode: 'cors' });
      if (res.ok) {
        blob = await res.blob();
      }
    } catch {
      // Fallback via universalGet if CORS or direct fetch fails
      try {
        const arrayBuf = await universalGet<ArrayBuffer>(urlToFetch);
        if (arrayBuf) blob = new Blob([arrayBuf], { type: 'audio/mp4' });
      } catch {
        // audio caching silent fallback
      }
    }

    if (!blob || blob.size < 10000) return; // Must be valid audio

    // 2. Store in IndexedDB
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const record: CachedRecord = {
      id: song.id,
      song: { ...song, isDownloaded: true },
      audioBlob: blob,
      cachedAt: Date.now(),
    };

    store.put(record);

    // 3. Limit offline cache to MAX_OFFLINE_TRACKS
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
  } catch (err) {
    console.warn('Offline backup caching background notice:', err);
  }
}

/**
 * Retrieves all offline backup cached songs.
 */
export async function getOfflineBackupPlaylist(): Promise<Playlist | null> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('cachedAt');
      const request = index.openCursor(null, 'prev'); // Most recently cached first
      const songs: Song[] = [];

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const record = cursor.value as CachedRecord;
          const blobUrl = URL.createObjectURL(record.audioBlob);
          songs.push({
            ...record.song,
            previewUrl: blobUrl,
            isDownloaded: true,
          });
          cursor.continue();
        } else {
          if (songs.length === 0) {
            return resolve(null);
          }
          const playlist: Playlist = {
            id: 'offline_backup_mix',
            title: 'Offline Backup',
            description: 'Your recently played songs, automatically cached for offline listening.',
            artwork: songs[0]?.artwork || '',
            creator: 'Soundwave Auto-Backup',
            tracks: songs,
            isUserCreated: false,
            totalDuration: songs.reduce((sum, s) => sum + s.duration, 0),
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
 * Checks if a specific song is cached for offline playback and returns its local Blob URL.
 */
export async function getOfflineSongStream(songId: string): Promise<string | null> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(songId);
      request.onsuccess = () => {
        if (request.result && request.result.audioBlob) {
          const blobUrl = URL.createObjectURL(request.result.audioBlob);
          resolve(blobUrl);
        } else {
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
 * Clears offline cached tracks.
 */
export async function clearOfflineBackupCache(): Promise<void> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
  } catch {
    // ignore
  }
}
