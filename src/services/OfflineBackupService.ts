import type { Song, Playlist } from '../data/models';
import { universalGet } from '../core/utils/http';
import { resolveFullTrack, formatMediaUrlWithQuality, isPreviewAudioUrl } from '../data/api/saavnApi';

const DB_NAME = 'soundwave_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'cached_tracks';
const MAX_OFFLINE_TRACKS = 50;

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
 * Caches a song's audio in the background for Offline Backup.
 * Called ONLY after the user has completely finished playing the song.
 */
export async function cacheSongForOfflineBackup(song: Song, streamUrl?: string): Promise<void> {
  if (!song || !song.id) return;

  try {
    let targetUrl: string | null = streamUrl || (song.previewUrl && !song.previewUrl.startsWith('blob:') ? song.previewUrl : null);

    // 1. If stream URL is missing, or is a 30s preview or non-direct stream, resolve direct 320kbps stream
    if (!targetUrl || isPreviewAudioUrl(targetUrl) || targetUrl.includes('youtube') || targetUrl.includes('googlevideo')) {
      try {
        const resolved = await resolveFullTrack(song.title, song.artist, 'high', song.duration);
        if (resolved?.streamUrl && !isPreviewAudioUrl(resolved.streamUrl)) {
          targetUrl = resolved.streamUrl;
        }
      } catch {}
    }

    if (!targetUrl || isPreviewAudioUrl(targetUrl)) {
      return;
    }

    // Force highest 320kbps fidelity for offline storage
    const highQualityUrl = formatMediaUrlWithQuality(targetUrl, 'high');

    // 2. Fetch audio blob in background
    let blob: Blob | null = null;
    try {
      const res = await fetch(highQualityUrl, { mode: 'cors' });
      if (res.ok) {
        blob = await res.blob();
      }
    } catch {
      // Fallback via universalGet if CORS fails
      try {
        const arrayBuf = await universalGet<ArrayBuffer>(highQualityUrl);
        if (arrayBuf) {
          blob = new Blob([arrayBuf], { type: 'audio/mp4' });
        }
      } catch {}
    }

    // Must be a valid audio track (minimum 250 KB)
    if (!blob || blob.size < 250000) return;

    // 3. Store in IndexedDB
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const record: CachedRecord = {
      id: song.id,
      song: {
        ...song,
        isDownloaded: true,
        previewUrl: '', // Cleaned so it creates fresh blob URL on load
      },
      audioBlob: blob,
      cachedAt: Date.now(),
    };

    store.put(record);

    // 4. Limit offline cache to MAX_OFFLINE_TRACKS (FIFO)
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
    console.warn('Offline backup caching notice:', err);
  }
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
      req.onsuccess = () => resolve(req.result || 0);
      req.onerror = () => resolve(0);
    });
  } catch {
    return 0;
  }
}

/**
 * Retrieves all offline backup cached songs as a Playlist.
 */
export async function getOfflineBackupPlaylist(): Promise<Playlist> {
  const fallbackPlaylist: Playlist = {
    id: 'offline_backup_mix',
    title: 'Offline Backup',
    description: 'Your recently finished songs, automatically cached for high-quality offline listening.',
    artwork: '',
    creator: 'Soundwave Auto-Backup',
    tracks: [],
    isUserCreated: false,
    totalDuration: 0,
  };

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
          if (record.audioBlob && record.audioBlob.size >= 250000) {
            const blobUrl = URL.createObjectURL(record.audioBlob);
            songs.push({
              ...record.song,
              previewUrl: blobUrl,
              isDownloaded: true,
            });
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
 * Checks if a specific song is cached for offline playback and returns its local Blob URL.
 */
export async function getOfflineSongStream(songId: string): Promise<string | null> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(songId);
      request.onsuccess = () => {
        if (request.result && request.result.audioBlob && request.result.audioBlob.size >= 250000) {
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
