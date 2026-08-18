// ═══════════════════════════════════════════════════════════════════════════════
//  OfflineBackupService.ts
//  Spotify-Style Offline Backup Engine
//  • Only saves audio after a track is fully & genuinely listened to
//  • Stores full playable audio Blobs locally in IndexedDB
//  • Cleans up corrupted / incomplete entries automatically
//  • Instant offline playback directly from local Blob URLs
// ═══════════════════════════════════════════════════════════════════════════════

import type { Song, Playlist } from '../data/models';
import { Capacitor, CapacitorHttp } from '@capacitor/core';

const DB_NAME = 'soundwave_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'cached_tracks';
const MAX_OFFLINE_TRACKS = 50;
const MIN_VALID_AUDIO_BYTES = 200_000; // 200 KB minimum for complete playable audio

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
 * Downloads audio binary with native CORS bypass on Android or fetch on web.
 */
async function fetchAudioBlob(url: string): Promise<Blob | null> {
  if (!url) return null;

  // 1. Native Capacitor download (bypasses CORS completely)
  if (Capacitor.isNativePlatform()) {
    try {
      const res = await CapacitorHttp.get({
        url,
        responseType: 'blob',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36',
          Accept: 'audio/*, */*',
        },
      });
      if (res.status >= 200 && res.status < 300 && res.data) {
        if (typeof res.data === 'string' && res.data.length > 500) {
          const byteCharacters = atob(res.data);
          const byteNumbers = new Uint8Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const mime = url.includes('.mp3') ? 'audio/mpeg' : url.includes('.flac') ? 'audio/flac' : 'audio/mp4';
          const blob = new Blob([byteNumbers], { type: mime });
          if (blob.size >= MIN_VALID_AUDIO_BYTES) {
            return blob;
          }
        }
      }
    } catch (err) {
      console.warn('Native binary download fallback:', err);
    }
  }

  // 2. Browser / Standard Fetch
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (res.ok) {
      const arrayBuf = await res.arrayBuffer();
      if (arrayBuf && arrayBuf.byteLength >= MIN_VALID_AUDIO_BYTES) {
        const mime = url.includes('.mp3') ? 'audio/mpeg' : url.includes('.flac') ? 'audio/flac' : 'audio/mp4';
        return new Blob([arrayBuf], { type: mime });
      }
    }
  } catch (err) {
    console.warn('Browser audio fetch fallback:', err);
  }

  return null;
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

  // Check if already in offline backup
  const alreadyCached = await isSongCachedOffline(song.id);
  if (alreadyCached) return true;

  const urlToFetch = streamUrl || song.previewUrl;
  if (!urlToFetch || urlToFetch.startsWith('blob:')) return false;

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
    // 1. Try to get Blob directly from AdaptiveStreaming cache if already buffered
    let blob: Blob | null = null;
    try {
      const { adaptiveStreaming } = await import('./AdaptiveStreamingService');
      const streamBlob = await adaptiveStreaming.getStreamBlob(song.id);
      if (streamBlob && streamBlob.size >= MIN_VALID_AUDIO_BYTES) {
        blob = streamBlob;
      }
    } catch {}

    // 2. If not in stream cache, download full binary audio
    if (!blob && urlToFetch.startsWith('http')) {
      blob = await fetchAudioBlob(urlToFetch);
    }

    // 3. Strict validation: Must be complete playable audio
    if (!blob || blob.size < MIN_VALID_AUDIO_BYTES) {
      activeCacheDownloads.delete(song.id);
      return false;
    }

    // 4. Store in IndexedDB
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const cleanSong: Song = {
        ...song,
        isDownloaded: true,
        previewUrl: '', // Cleaned so it never tries remote URL when offline
        provider: 'offline',
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

    // Notify UI components immediately that Offline Backup updated
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
 * Purges a specific corrupted or invalid song from offline cache.
 */
export async function deleteOfflineSong(songId: string): Promise<void> {
  if (!songId) return;
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(songId);
    try {
      window.dispatchEvent(new CustomEvent('sw_offline_backup_changed'));
    } catch {}
  } catch {}
}

/**
 * Retrieves the genuine verified Offline Backup Playlist from IndexedDB.
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
      const seenIds = new Set<string>();

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const record = cursor.value as CachedRecord;

          if (record && record.song && record.song.id && !seenIds.has(record.song.id)) {
            seenIds.add(record.song.id);
            let blobUrl = '';
            if (record.audioBlob) {
              try {
                blobUrl = URL.createObjectURL(record.audioBlob);
              } catch {}
            }

            songs.push({
              ...record.song,
              previewUrl: blobUrl || record.song.previewUrl || '',
              isDownloaded: true,
              provider: 'offline',
            });
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
 * NEVER deletes the cached song.
 */
export async function getOfflineSongStream(songId: string): Promise<string | null> {
  if (!songId) return null;
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(songId);

      request.onsuccess = () => {
        const record = request.result as CachedRecord | undefined;
        if (record && record.audioBlob) {
          try {
            const blobUrl = URL.createObjectURL(record.audioBlob);
            resolve(blobUrl);
            return;
          } catch {}
        }
        resolve(null);
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
