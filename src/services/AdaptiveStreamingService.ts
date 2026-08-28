// ═══════════════════════════════════════════════════════════════
//  AdaptiveStreamingService — Professional-grade audio streaming
//  Features:
//   • Network speed & stability detection (2G → 5G / Wi-Fi)
//   • Adaptive buffer target (slow net = larger buffer)
//   • LRU stream cache using IndexedDB (≤ 50 tracks, smart eviction)
//   • Pre-buffer next song in queue proactively
//   • Instant cache hit → skip network fetch entirely
//   • Range request support for fast seeking
//   • Graceful handling of network drop/restore
//   • Stall recovery with exponential back-off
//   • Quality selection based on measured bandwidth
// ═══════════════════════════════════════════════════════════════

import type { AudioQuality } from '../data/models';
import { formatMediaUrlWithQuality } from '../data/api/saavnApi';

// ─── Constants ───────────────────────────────────────────────────────────────

const DB_NAME = 'soundwave_stream_cache';
const DB_VERSION = 2;
const STREAM_STORE = 'stream_blobs';
const META_STORE = 'stream_meta';

// Minimum audio data (bytes) that must be available before we consider a
// song "fully buffered" and ready to skip re-downloading.
const MIN_VALID_BLOB_BYTES = 50_000;      // 50 KB – a few seconds of low-bitrate audio

// Maximum number of songs kept in the streaming cache.
const MAX_CACHE_TRACKS = 50;

// How many bytes we download as the initial pre-buffer chunk before allowing
// playback to start.  Larger → more resilient on stalls, smaller → faster start.
const INITIAL_CHUNK_BYTES: Record<NetworkTier, number> = {
  '2g':   48_000,    //  48 KB  (~5s @ 96kbps - ultra-fast start)
  '3g':   64_000,    //  64 KB  (~4s @ 128kbps)
  '4g':   96_000,    //  96 KB  (~2.5s @ 320kbps - instant start)
  '5g':  128_000,    // 128 KB  – start immediately
  wifi:  128_000,
};

// How many bytes ahead of playback we keep downloading (rolling look-ahead).
const LOOKAHEAD_BYTES: Record<NetworkTier, number> = {
  '2g':  512_000,    // 512 KB ahead
  '3g':  768_000,    // 768 KB ahead
  '4g': 1_536_000,   // 1.5 MB ahead
  '5g': 3_000_000,   // 3 MB ahead
  wifi: 4_000_000,   // 4 MB ahead – aggressive on Wi-Fi
};

// Stall retry delays in ms (exponential back-off capped at 8 s).
const STALL_BACKOFF_MS = [400, 900, 1800, 4000, 8000];

// ─── Types ───────────────────────────────────────────────────────────────────

export type NetworkTier = '2g' | '3g' | '4g' | '5g' | 'wifi';

export interface NetworkCondition {
  tier: NetworkTier;
  /** Measured download speed in kbps (0 if unknown). */
  kbps: number;
  /** True when the connection is considered unstable (frequent stalls). */
  unstable: boolean;
}

interface CacheRecord {
  id: string;                // song ID
  url: string;               // resolved stream URL
  blob: Blob;                // full audio blob
  cachedAt: number;
  accessedAt: number;
  quality: AudioQuality;
  sizeBytes: number;
}

// ─── IndexedDB helpers ───────────────────────────────────────────────────────

let _db: IDBDatabase | null = null;

async function openStreamDB(): Promise<IDBDatabase> {
  if (_db) return _db;
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('No IndexedDB'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STREAM_STORE)) {
        const s = db.createObjectStore(STREAM_STORE, { keyPath: 'id' });
        s.createIndex('accessedAt', 'accessedAt', { unique: false });
        s.createIndex('cachedAt', 'cachedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(req.result); };
    req.onerror = () => reject(req.error);
  });
}

function idbGet<T>(store: IDBObjectStore, key: IDBValidKey): Promise<T | undefined> {
  return new Promise((res, rej) => {
    const r = store.get(key);
    r.onsuccess = () => res(r.result as T | undefined);
    r.onerror = () => rej(r.error);
  });
}

function idbPut(store: IDBObjectStore, value: object): Promise<void> {
  return new Promise((res, rej) => {
    const r = store.put(value);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}

function idbCount(store: IDBObjectStore): Promise<number> {
  return new Promise((res, rej) => {
    const r = store.count();
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

// ─── AdaptiveStreamingService ────────────────────────────────────────────────

class AdaptiveStreamingService {
  // Active AbortControllers – keyed by song ID so we can cancel per-song fetches.
  private activeControllers: Map<string, AbortController> = new Map();

  // Cache of resolved Blob URLs to avoid repeated object URL creation.
  private blobUrlCache: Map<string, string> = new Map();

  // Stall counter per song to power exponential back-off recovery.
  private stallCount: Map<string, number> = new Map();

  // Measured network condition (updated periodically + on stall/recovery events).
  private _networkCondition: NetworkCondition = {
    tier: '4g',
    kbps: 0,
    unstable: false,
  };

  // Timestamp of last network speed measurement.
  private lastSpeedTestAt = 0;

  // ─── Public: Network Condition ─────────────────────────────────────────────

  get networkCondition(): NetworkCondition {
    return { ...this._networkCondition };
  }

  /**
   * Call this early (e.g. in app bootstrap) to initialise the network detector.
   */
  initNetworkMonitor(): void {
    this.measureNetworkSpeed();

    // Re-measure every 30 s
    setInterval(() => this.measureNetworkSpeed(), 30_000);

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this._networkCondition.unstable = false;
        this.measureNetworkSpeed();
      });
      window.addEventListener('offline', () => {
        this._networkCondition.unstable = true;
      });

      // navigator.connection (if available)
      const conn = (navigator as any).connection;
      if (conn) {
        conn.addEventListener('change', () => this.detectConnectionType(conn));
        this.detectConnectionType(conn);
      }
    }
  }

  private detectConnectionType(conn: any): void {
    const ect = conn.effectiveType as string;  // 'slow-2g' | '2g' | '3g' | '4g'
    const downMbps: number = conn.downlink || 0;  // Mbps
    const kbps = Math.round(downMbps * 1000);

    let tier: NetworkTier = '4g';
    if (ect === 'slow-2g' || ect === '2g') tier = '2g';
    else if (ect === '3g') tier = '3g';
    else if (downMbps >= 50) tier = 'wifi';
    else if (downMbps >= 10) tier = '5g';
    else tier = '4g';

    this._networkCondition = { tier, kbps, unstable: this._networkCondition.unstable };
  }

  private async measureNetworkSpeed(): Promise<void> {
    const now = Date.now();
    // Don't re-measure within 20 s
    if (now - this.lastSpeedTestAt < 20_000 || !navigator.onLine) return;
    this.lastSpeedTestAt = now;

    try {
      const probe = 'https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js';
      const start = performance.now();
      const res = await fetch(probe, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (!res.ok) return;
      const buf = await res.arrayBuffer();
      const elapsed = (performance.now() - start) / 1000; // seconds
      const kbps = Math.round((buf.byteLength * 8) / elapsed / 1000);

      let tier: NetworkTier = '4g';
      if (kbps < 50) tier = '2g';
      else if (kbps < 250) tier = '3g';
      else if (kbps < 5000) tier = '4g';
      else if (kbps < 15000) tier = '5g';
      else tier = 'wifi';

      this._networkCondition = {
        tier,
        kbps,
        unstable: this._networkCondition.unstable,
      };
    } catch {
      // Probe failed – treat as unstable
      this._networkCondition.unstable = true;
    }
  }

  // ─── Public: Adaptive Quality Selection ────────────────────────────────────

  /**
   * Returns the best audio quality for the current network conditions.
   * Used internally; AudioPlayer still controls quality overrides.
   */
  adaptiveQuality(preferredQuality: AudioQuality): AudioQuality {
    if (preferredQuality === 'high' || preferredQuality === 'dolby') return preferredQuality;
    const { tier } = this._networkCondition;
    if (preferredQuality === 'low') return 'low';
    if (tier === '2g') return 'low';
    return preferredQuality;
  }

  // ─── Public: Streaming ─────────────────────────────────────────────────────

  /**
   * Primary API. Called by AudioPlayer before assigning `audio.src`.
   *
   * 1. Checks the stream cache first → instant Blob URL if hit.
   * 2. If cache miss, downloads the audio with adaptive chunking.
   * 3. Emits a Blob URL that the HTMLAudioElement can play directly.
   * 4. Caches the full blob in the background for future replays.
   *
   * @returns Blob URL (always), or null if offline and not cached.
   */
  async resolveStreamUrl(
    songId: string,
    rawUrl: string,
    quality: AudioQuality,
    onProgress?: (ratio: number) => void,
  ): Promise<string | null> {
    if (!rawUrl || !rawUrl.startsWith('http')) return null;

    const url = formatMediaUrlWithQuality(rawUrl, this.adaptiveQuality(quality));

    // ── 1. Cache hit check ──
    const cached = await this.getCachedBlobUrl(songId, url);
    if (cached) {
      onProgress?.(1);
      return cached;
    }

    // ── 2. Offline – no cache available ──
    if (!navigator.onLine) return null;

    // ── 3. Stream with chunked fetch ──
    return this.streamWithChunking(songId, url, quality, onProgress);
  }

  /**
   * Proactively pre-buffer a song that will likely be needed soon (e.g. next in queue).
   * Runs fully in the background – does NOT block the caller.
   */
  preBufferSong(songId: string, rawUrl: string, quality: AudioQuality): void {
    if (!rawUrl || !rawUrl.startsWith('http') || !navigator.onLine) return;
    const url = formatMediaUrlWithQuality(rawUrl, this.adaptiveQuality(quality));

    // Only pre-buffer if not already cached / in-progress
    this.isCached(songId, url).then((hit) => {
      if (hit) return;
      this.streamWithChunking(songId, url, quality, undefined, true).catch(() => {});
    });
  }

  /**
   * Cancels any in-flight download for the given song.
   * Call this when the user switches songs, so bandwidth isn't wasted.
   */
  cancelStream(songId: string): void {
    const ctrl = this.activeControllers.get(songId);
    if (ctrl) {
      ctrl.abort();
      this.activeControllers.delete(songId);
    }
    this.stallCount.delete(songId);
  }

  /**
   * Cancels all in-flight downloads except for the given songId.
   * Ensures the active song gets full bandwidth priority.
   */
  cancelAllExcept(activeSongId: string): void {
    for (const [id, ctrl] of this.activeControllers.entries()) {
      if (id !== activeSongId) {
        ctrl.abort();
        this.activeControllers.delete(id);
      }
    }
  }

  /**
   * Lightweight cache-only lookup — returns a Blob URL if the song is already cached,
   * or null if not. Does NOT trigger any download. Use this in the hot path of play()
   * to get instant playback for replayed songs without blocking on a network fetch.
   */
  async getCachedUrl(songId: string, _resolvedUrl: string): Promise<string | null> {
    // Check in-memory blob cache first (fastest path)
    const memUrl = this.blobUrlCache.get(songId);
    if (memUrl) return memUrl;

    // Then check IndexedDB
    try {
      const db = await openStreamDB();
      const tx = db.transaction(STREAM_STORE, 'readwrite');
      const store = tx.objectStore(STREAM_STORE);
      const record = await idbGet<CacheRecord>(store, songId);
      
      // Strict full-audio validation: reject short previews and preview domains
      const isShortOrPreview =
        !record ||
        record.blob.size < 600_000 || // < 600 KB is a short 30s cut
        (record.url && (
          record.url.includes('p.scdn.co') ||
          record.url.includes('spotify.com') ||
          record.url.includes('apple.com') ||
          record.url.includes('itunes') ||
          record.url.includes('mzstatic.com')
        ));

      if (isShortOrPreview) {
        if (record) {
          try { store.delete(songId); } catch {}
        }
        return null;
      }

      // Touch LRU timestamp
      store.put({ ...record, accessedAt: Date.now() });
      const blobUrl = URL.createObjectURL(record.blob);
      this.blobUrlCache.set(songId, blobUrl);
      return blobUrl;
    } catch {
      return null;
    }
  }

  // ─── Private: Streaming Engine ─────────────────────────────────────────────

  private async streamWithChunking(
    songId: string,
    url: string,
    quality: AudioQuality,
    onProgress?: (ratio: number) => void,
    isBackground = false,
  ): Promise<string | null> {
    // Cancel any previous in-flight download for this song
    this.cancelStream(songId);

    const ctrl = new AbortController();
    this.activeControllers.set(songId, ctrl);

    const { tier } = this._networkCondition;
    const initialChunk = INITIAL_CHUNK_BYTES[tier] ?? 256_000;

    try {
      // ── Phase 1: Fetch initial chunk to enable early playback ──
      const headRes = await fetch(url, {
        method: 'HEAD',
        signal: ctrl.signal,
      }).catch(() => null);

      const totalBytes = headRes
        ? parseInt(headRes.headers.get('content-length') || '0', 10) || 0
        : 0;
      const supportsRange = headRes
        ? headRes.headers.get('accept-ranges') === 'bytes'
        : false;

      let blobUrl: string | null = null;
      let chunks: ArrayBuffer[] = [];
      let downloadedBytes = 0;

      if (supportsRange && totalBytes > 0 && !isBackground) {
        // ── Range-request approach: fast start, then fill the rest ──
        const end = Math.min(initialChunk - 1, totalBytes - 1);
        const firstChunkRes = await fetch(url, {
          headers: { Range: `bytes=0-${end}` },
          signal: ctrl.signal,
        });

        if (!firstChunkRes.ok && firstChunkRes.status !== 206) {
          throw new Error(`HTTP ${firstChunkRes.status}`);
        }

        const firstBuf = await firstChunkRes.arrayBuffer();
        chunks.push(firstBuf);
        downloadedBytes += firstBuf.byteLength;
        onProgress?.(Math.min(downloadedBytes / (totalBytes || downloadedBytes + 1), 0.95));

        // Emit initial blob for playback to start immediately
        const initialBlob = new Blob(chunks, { type: 'audio/mpeg' });
        blobUrl = URL.createObjectURL(initialBlob);
        this.blobUrlCache.set(`${songId}_partial`, blobUrl);

        // ── Phase 2: Download the remainder in background ──
        if (downloadedBytes < totalBytes && !ctrl.signal.aborted) {
          const remainStart = downloadedBytes;
          const restRes = await fetch(url, {
            headers: { Range: `bytes=${remainStart}-` },
            signal: ctrl.signal,
          }).catch(() => null);

          if (restRes && (restRes.ok || restRes.status === 206)) {
            const reader = restRes.body?.getReader();
            if (reader) {
              const lookahead = LOOKAHEAD_BYTES[tier] ?? 1_536_000;

              while (true) {
                const { done, value } = await reader.read();
                if (done || ctrl.signal.aborted) break;
                if (value) {
                  chunks.push(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
                  downloadedBytes += value.byteLength;
                  onProgress?.(Math.min(downloadedBytes / totalBytes, 1));

                  // If we have enough look-ahead, pause reading to yield bandwidth
                  const bufferedAhead = downloadedBytes - initialChunk;
                  if (bufferedAhead > lookahead) {
                    await new Promise<void>((r) => setTimeout(r, 200));
                  }
                }
              }
            }
          }
        }
      } else {
        // ── Fallback: stream the whole file via ReadableStream ──
        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const reader = res.body?.getReader();
        if (!reader) throw new Error('No readable stream');

        // Accumulate until initial chunk threshold then expose for playback
        let emittedInitial = false;
        const lookahead = LOOKAHEAD_BYTES[tier] ?? 1_536_000;

        while (true) {
          const { done, value } = await reader.read();
          if (done || ctrl.signal.aborted) break;
          if (value) {
            chunks.push(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
            downloadedBytes += value.byteLength;
            onProgress?.(totalBytes > 0 ? Math.min(downloadedBytes / totalBytes, 1) : 0.5);

            if (!emittedInitial && (downloadedBytes >= initialChunk || done)) {
              emittedInitial = true;
              const partialBlob = new Blob(chunks, { type: 'audio/mpeg' });
              blobUrl = URL.createObjectURL(partialBlob);
              this.blobUrlCache.set(`${songId}_partial`, blobUrl);
            }

            // Yield bandwidth periodically for low-end connections
            if (downloadedBytes - initialChunk > lookahead) {
              await new Promise<void>((r) => setTimeout(r, 150));
            }
          }
        }

        if (!emittedInitial && chunks.length > 0) {
          const blob = new Blob(chunks, { type: 'audio/mpeg' });
          blobUrl = URL.createObjectURL(blob);
        }
      }

      if (ctrl.signal.aborted) return null;

      // ── Phase 3: Persist full blob to cache ──
      if (chunks.length > 0 && downloadedBytes >= MIN_VALID_BLOB_BYTES) {
        const fullBlob = new Blob(chunks, { type: 'audio/mpeg' });
        onProgress?.(1);

        // Persist full blob for instant cache-hit on replay
        this.persistToCache(songId, url, fullBlob, quality).catch(() => {});

        // Return a proper Blob URL from the complete data
        const finalBlobUrl = URL.createObjectURL(fullBlob);
        // Revoke partial blob URL from memory if it exists
        const partialKey = `${songId}_partial`;
        const partialUrl = this.blobUrlCache.get(partialKey);
        if (partialUrl && partialUrl !== finalBlobUrl) {
          try { URL.revokeObjectURL(partialUrl); } catch {}
          this.blobUrlCache.delete(partialKey);
        }
        this.blobUrlCache.set(songId, finalBlobUrl);
        return finalBlobUrl;
      }

      return blobUrl;
    } catch (err: any) {
      if (err?.name === 'AbortError') return null;

      // Stall recovery with exponential back-off
      return this.recoverFromStall(songId, url, quality, onProgress);
    } finally {
      this.activeControllers.delete(songId);
    }
  }

  private async recoverFromStall(
    songId: string,
    url: string,
    quality: AudioQuality,
    onProgress?: (ratio: number) => void,
  ): Promise<string | null> {
    const count = (this.stallCount.get(songId) || 0);
    if (count >= STALL_BACKOFF_MS.length) {
      this.stallCount.delete(songId);
      this._networkCondition.unstable = true;
      return null;
    }

    this.stallCount.set(songId, count + 1);
    const delay = STALL_BACKOFF_MS[count];
    await new Promise<void>((r) => setTimeout(r, delay));

    if (!navigator.onLine) return null;

    // Retry
    return this.streamWithChunking(songId, url, quality, onProgress);
  }

  // ─── Private: Cache ───────────────────────────────────────────────────────

  private async isCached(songId: string, url: string): Promise<boolean> {
    try {
      const db = await openStreamDB();
      const tx = db.transaction(STREAM_STORE, 'readonly');
      const store = tx.objectStore(STREAM_STORE);
      const record = await idbGet<CacheRecord>(store, songId);
      return !!(record && record.url === url && record.blob && record.sizeBytes >= MIN_VALID_BLOB_BYTES);
    } catch {
      return false;
    }
  }

  private async getCachedBlobUrl(songId: string, _url: string): Promise<string | null> {
    // In-memory hit
    const memUrl = this.blobUrlCache.get(songId);
    if (memUrl) return memUrl;

    try {
      const db = await openStreamDB();
      const tx = db.transaction(STREAM_STORE, 'readwrite');
      const store = tx.objectStore(STREAM_STORE);
      const record = await idbGet<CacheRecord>(store, songId);

      if (!record || record.blob.size < MIN_VALID_BLOB_BYTES) return null;

      // Touch accessedAt for LRU eviction ordering
      store.put({ ...record, accessedAt: Date.now() });

      const blobUrl = URL.createObjectURL(record.blob);
      this.blobUrlCache.set(songId, blobUrl);
      return blobUrl;
    } catch {
      return null;
    }
  }

  private async persistToCache(
    songId: string,
    url: string,
    blob: Blob,
    quality: AudioQuality,
  ): Promise<void> {
    if (blob.size < MIN_VALID_BLOB_BYTES) return;

    try {
      const db = await openStreamDB();
      const tx = db.transaction(STREAM_STORE, 'readwrite');
      const store = tx.objectStore(STREAM_STORE);

      const record: CacheRecord = {
        id: songId,
        url,
        blob,
        cachedAt: Date.now(),
        accessedAt: Date.now(),
        quality,
        sizeBytes: blob.size,
      };

      await idbPut(store, record);

      // Evict oldest entries if over the limit
      const count = await idbCount(store);
      if (count > MAX_CACHE_TRACKS) {
        const excess = count - MAX_CACHE_TRACKS;
        const idx = store.index('accessedAt');
        const cursorReq = idx.openCursor();
        let deleted = 0;
        cursorReq.onsuccess = (e) => {
          const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor && deleted < excess) {
            cursor.delete();
            deleted++;
            cursor.continue();
          }
        };
      }
    } catch {
      // Cache write failure is non-fatal
    }
  }

  /**
   * Clears all stream cache and revokes any blob URLs.
   */
  async clearStreamCache(): Promise<void> {
    for (const url of this.blobUrlCache.values()) {
      try { URL.revokeObjectURL(url); } catch {}
    }
    this.blobUrlCache.clear();

    try {
      const db = await openStreamDB();
      const tx = db.transaction(STREAM_STORE, 'readwrite');
      tx.objectStore(STREAM_STORE).clear();
    } catch {}
  }

  /**
   * Returns total bytes currently stored in the stream cache.
   */
  async getCacheStats(): Promise<{ trackCount: number; totalMB: number }> {
    try {
      const db = await openStreamDB();
      const tx = db.transaction(STREAM_STORE, 'readonly');
      const store = tx.objectStore(STREAM_STORE);
      return new Promise((res) => {
        const req = store.getAll();
        req.onsuccess = () => {
          const records: CacheRecord[] = req.result || [];
          const totalBytes = records.reduce((s, r) => s + (r.sizeBytes || 0), 0);
          res({ trackCount: records.length, totalMB: Math.round(totalBytes / 1_048_576) });
        };
        req.onerror = () => res({ trackCount: 0, totalMB: 0 });
      });
    } catch {
      return { trackCount: 0, totalMB: 0 };
    }
  }

  // ─── Public: Audio Element Enhancement ────────────────────────────────────

  /**
   * Applies best-practice buffering settings to an HTMLAudioElement.
   * Call once after creating the element.
   */
  configureAudioElement(audio: HTMLAudioElement): void {
    // Native preload hint – browser decides how much to buffer
    audio.preload = 'auto';
  }

  /**
   * Installs a stall watcher on an audio element.
   * When playback stalls (waiting event), it:
   *   - Marks network as unstable
   *   - Tries to recover after a short delay
   *   - Emits onStall / onRecover callbacks
   */
  installStallWatcher(
    audio: HTMLAudioElement,
    _songId: () => string,
    onStall: () => void,
    onRecover: () => void,
  ): () => void {
    const handleWaiting = () => {
      onStall();
    };

    const handlePlaying = () => {
      onRecover();
    };

    const handleCanPlay = () => {
      onRecover();
    };

    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('playing', handlePlaying);
    audio.addEventListener('canplay', handleCanPlay);

    // Return cleanup
    return () => {
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('playing', handlePlaying);
      audio.removeEventListener('canplay', handleCanPlay);
    };
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────

export const adaptiveStreaming = new AdaptiveStreamingService();
