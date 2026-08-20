// ═════════════════════════════════════════════════════════════════════
//  Last.fm Read-Only Metadata & Recommendations API Client
//  Soundwave Music Streaming Platform
//
//  Features Implemented:
//  • FEATURE 1: Artist Biography & Wiki (artist.getInfo)
//  • FEATURE 2: Similar Songs & Recommendations (track.getSimilar & artist.getSimilar)
//  • FEATURE 3: Album Wiki & Backstory (album.getInfo)
//  • FEATURE 4: Global Top Charts (chart.getTopTracks & chart.getTopArtists)
//  • FEATURE 5: Genre & Mood Tags (tag.getTopTracks)
// ═════════════════════════════════════════════════════════════════════

import type { Artist, Album } from '../models';
import { CONFIG } from '../../config';

const API_KEY = CONFIG.LASTFM_API_KEY || 'b25b959554ed76058ac220b7b2e0a026';
const BASE = CONFIG.LASTFM_BASE_URL || 'https://ws.audioscrobbler.com/2.0';
const BACKEND_BASE = CONFIG.BACKEND_URL ? `${CONFIG.BACKEND_URL.replace(/\/$/, '')}/api/lastfm` : '';

// 15-Minute Local Memory Cache to avoid redundant network requests
const memoryCache = new Map<string, { data: any; expiresAt: number }>();
const CACHE_TTL_MS = 15 * 60 * 1000;

function getFromCache<T>(key: string): T | null {
  const item = memoryCache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return item.data as T;
}

function saveToCache(key: string, data: any): void {
  memoryCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

function buildDirectUrl(method: string, params: Record<string, string>): string {
  const p = new URLSearchParams({
    method,
    api_key: API_KEY,
    format: 'json',
    autocorrect: '1',
    ...params,
  });
  return `${BASE}/?${p.toString()}`;
}

function stripHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .trim()
    .split('Read more')[0]
    .trim();
}

function extractImage(images: any): string {
  if (!Array.isArray(images)) return '';
  const mega = images.find((i) => i.size === 'mega')?.['#text'];
  const xl = images.find((i) => i.size === 'extralarge')?.['#text'];
  const lg = images.find((i) => i.size === 'large')?.['#text'];
  const med = images.find((i) => i.size === 'medium')?.['#text'];
  return mega || xl || lg || med || '';
}

// ── FEATURE 1: Artist Biography & Wiki (artist.getInfo) ─────────────────────

export interface LastFmArtistInfo extends Partial<Artist> {
  listeners?: number;
  playCount?: number;
  tags?: string[];
  bioSummary?: string;
  bioFull?: string;
}

export async function getLastfmArtist(artistName: string): Promise<LastFmArtistInfo | null> {
  const cleanName = artistName?.trim();
  if (!cleanName) return null;

  const cacheKey = `artist_info_${cleanName.toLowerCase()}`;
  const cached = getFromCache<LastFmArtistInfo>(cacheKey);
  if (cached) return cached;

  // 1. Try Render Backend Proxy First
  if (BACKEND_BASE) {
    try {
      const res = await fetch(`${BACKEND_BASE}/artist/${encodeURIComponent(cleanName)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.artist) {
          const result: LastFmArtistInfo = {
            id: data.artist.id,
            name: data.artist.name,
            image: data.artist.image || CONFIG.ARTWORK_PLACEHOLDER,
            imageLg: data.artist.image || CONFIG.ARTWORK_PLACEHOLDER,
            followerCount: data.artist.listeners,
            listeners: data.artist.listeners,
            playCount: data.artist.playcount,
            bio: data.artist.bio,
            bioSummary: data.artist.bio,
            tags: data.artist.tags || [],
            provider: 'lastfm',
            externalUrl: data.artist.url,
          };
          saveToCache(cacheKey, result);
          return result;
        }
      }
    } catch {
      // Fall through to direct API
    }
  }

  // 2. Direct Last.fm API Call
  if (!API_KEY) return null;
  try {
    const res = await fetch(buildDirectUrl('artist.getInfo', { artist: cleanName }));
    if (!res.ok) return null;
    const data = await res.json();
    const a = data?.artist;
    if (!a) return null;
    const image = extractImage(a.image);
    const tags = Array.isArray(a.tags?.tag) ? a.tags.tag.map((t: any) => t.name) : [];

    const result: LastFmArtistInfo = {
      id: `lastfm_${a.mbid || encodeURIComponent(a.name)}`,
      name: a.name,
      image: image || CONFIG.ARTWORK_PLACEHOLDER,
      imageLg: image || CONFIG.ARTWORK_PLACEHOLDER,
      followerCount: parseInt(a.stats?.listeners || '0'),
      listeners: parseInt(a.stats?.listeners || '0'),
      playCount: parseInt(a.stats?.playcount || '0'),
      bio: stripHtml(a.bio?.summary || ''),
      bioSummary: stripHtml(a.bio?.summary || ''),
      bioFull: stripHtml(a.bio?.content || ''),
      tags,
      provider: 'lastfm',
      externalUrl: a.url,
    };
    saveToCache(cacheKey, result);
    return result;
  } catch {
    return null;
  }
}

// ── FEATURE 2: Similar Songs & Recommendations (track.getSimilar & artist.getSimilar) ──

export interface SimilarTrack {
  title: string;
  artist: string;
  match?: number;
  duration?: number;
  playcount?: number;
  image?: string;
  url?: string;
}

export async function getSimilarTracks(artist: string, track: string, limit = 10): Promise<SimilarTrack[]> {
  const cleanArtist = artist?.trim();
  const cleanTrack = track?.trim();
  if (!cleanArtist || !cleanTrack) return [];

  const cacheKey = `similar_tracks_${cleanArtist.toLowerCase()}_${cleanTrack.toLowerCase()}_${limit}`;
  const cached = getFromCache<SimilarTrack[]>(cacheKey);
  if (cached) return cached;

  // 1. Try Backend Proxy First
  if (BACKEND_BASE) {
    try {
      const res = await fetch(`${BACKEND_BASE}/track/similar?artist=${encodeURIComponent(cleanArtist)}&track=${encodeURIComponent(cleanTrack)}&limit=${limit}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.tracks)) {
          saveToCache(cacheKey, data.tracks);
          return data.tracks;
        }
      }
    } catch {
      // Fall through to direct API
    }
  }

  // 2. Direct Last.fm API Call
  if (!API_KEY) return [];
  try {
    const res = await fetch(buildDirectUrl('track.getSimilar', { artist: cleanArtist, track: cleanTrack, limit: String(limit) }));
    if (!res.ok) return [];
    const data = await res.json();
    const raw = data?.similartracks?.track || [];
    const list = Array.isArray(raw) ? raw : [raw];

    const results = list.map((t: any) => ({
      title: t.name,
      artist: t.artist?.name || '',
      match: parseFloat(t.match || '0'),
      duration: parseInt(t.duration || '0'),
      playcount: parseInt(t.playcount || '0'),
      image: extractImage(t.image),
      url: t.url,
    }));
    saveToCache(cacheKey, results);
    return results;
  } catch {
    return [];
  }
}

export async function getSimilarArtists(artistName: string, limit = 8): Promise<Artist[]> {
  const cleanName = artistName?.trim();
  if (!cleanName) return [];

  const cacheKey = `similar_artists_${cleanName.toLowerCase()}_${limit}`;
  const cached = getFromCache<Artist[]>(cacheKey);
  if (cached) return cached;

  // 1. Try Backend Proxy First
  if (BACKEND_BASE) {
    try {
      const res = await fetch(`${BACKEND_BASE}/artist/${encodeURIComponent(cleanName)}/similar?limit=${limit}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.artists)) {
          const artists = data.artists.map((a: any) => ({
            id: `lastfm_${encodeURIComponent(a.name)}`,
            name: a.name,
            image: a.image || CONFIG.ARTWORK_PLACEHOLDER,
            provider: 'lastfm' as const,
            externalUrl: a.url,
          }));
          saveToCache(cacheKey, artists);
          return artists;
        }
      }
    } catch {
      // Fall through to direct API
    }
  }

  // 2. Direct Last.fm API Call
  if (!API_KEY) return [];
  try {
    const res = await fetch(buildDirectUrl('artist.getSimilar', { artist: cleanName, limit: String(limit) }));
    if (!res.ok) return [];
    const data = await res.json();
    const raw = data?.similarartists?.artist || [];
    const list = Array.isArray(raw) ? raw : [raw];

    const results = list.map((a: any) => ({
      id: `lastfm_${encodeURIComponent(a.name)}`,
      name: a.name,
      image: extractImage(a.image) || CONFIG.ARTWORK_PLACEHOLDER,
      provider: 'lastfm' as const,
      externalUrl: a.url,
    }));
    saveToCache(cacheKey, results);
    return results;
  } catch {
    return [];
  }
}

// ── FEATURE 3: Album Wiki & Summary (album.getInfo) ─────────────────────────

export interface LastFmAlbumInfo extends Partial<Album> {
  listeners?: number;
  playCount?: number;
  releaseDate?: string;
  summary?: string;
  tags?: string[];
  tracklist?: { title: string; duration: number; rank: number }[];
}

export async function getLastfmAlbumInfo(artist: string, album: string): Promise<LastFmAlbumInfo | null> {
  const cleanArtist = artist?.trim();
  const cleanAlbum = album?.trim();
  if (!cleanArtist || !cleanAlbum) return null;

  const cacheKey = `album_info_${cleanArtist.toLowerCase()}_${cleanAlbum.toLowerCase()}`;
  const cached = getFromCache<LastFmAlbumInfo>(cacheKey);
  if (cached) return cached;

  // 1. Try Backend Proxy First
  if (BACKEND_BASE) {
    try {
      const res = await fetch(`${BACKEND_BASE}/album/info?artist=${encodeURIComponent(cleanArtist)}&album=${encodeURIComponent(cleanAlbum)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.album) {
          const alb = data.album;
          const result: LastFmAlbumInfo = {
            id: `lastfm_alb_${encodeURIComponent(cleanArtist)}_${encodeURIComponent(cleanAlbum)}`,
            title: alb.title,
            artist: alb.artist,
            artwork: alb.image || CONFIG.ARTWORK_PLACEHOLDER,
            listeners: alb.listeners,
            playCount: alb.playcount,
            releaseDate: alb.releasedate,
            summary: alb.summary,
            tags: alb.tags || [],
            tracklist: alb.tracks || [],
            provider: 'lastfm',
            externalUrl: alb.url,
          };
          saveToCache(cacheKey, result);
          return result;
        }
      }
    } catch {
      // Fall through to direct API
    }
  }

  // 2. Direct Last.fm API Call
  if (!API_KEY) return null;
  try {
    const res = await fetch(buildDirectUrl('album.getInfo', { artist: cleanArtist, album: cleanAlbum }));
    if (!res.ok) return null;
    const data = await res.json();
    const alb = data?.album;
    if (!alb) return null;

    const rawTracks = alb.tracks?.track || [];
    const tracks = (Array.isArray(rawTracks) ? rawTracks : [rawTracks]).map((t: any) => ({
      title: t.name,
      duration: parseInt(t.duration || '0'),
      rank: parseInt(t['@attr']?.rank || '0'),
    }));

    const result: LastFmAlbumInfo = {
      id: `lastfm_alb_${alb.mbid || encodeURIComponent(alb.name)}`,
      title: alb.name,
      artist: alb.artist,
      artwork: extractImage(alb.image) || CONFIG.ARTWORK_PLACEHOLDER,
      listeners: parseInt(alb.listeners || '0'),
      playCount: parseInt(alb.playcount || '0'),
      releaseDate: alb.wiki?.published || '',
      summary: stripHtml(alb.wiki?.summary || ''),
      tags: Array.isArray(alb.tags?.tag) ? alb.tags.tag.map((t: any) => t.name) : [],
      tracklist: tracks,
      provider: 'lastfm',
      externalUrl: alb.url,
    };
    saveToCache(cacheKey, result);
    return result;
  } catch {
    return null;
  }
}

// ── FEATURE 4: Global Top Charts (chart.getTopTracks & chart.getTopArtists) ──

export async function getLastfmTopArtists(limit = 20): Promise<Artist[]> {
  const cacheKey = `chart_top_artists_${limit}`;
  const cached = getFromCache<Artist[]>(cacheKey);
  if (cached) return cached;

  // 1. Try Backend Proxy First
  if (BACKEND_BASE) {
    try {
      const res = await fetch(`${BACKEND_BASE}/chart/top-artists?limit=${limit}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.artists)) {
          const results = data.artists.map((a: any) => ({
            id: `lastfm_${encodeURIComponent(a.name)}`,
            name: a.name,
            image: a.image || CONFIG.ARTWORK_PLACEHOLDER,
            followerCount: a.listeners,
            provider: 'lastfm' as const,
            externalUrl: a.url,
          }));
          saveToCache(cacheKey, results);
          return results;
        }
      }
    } catch {
      // Fall through to direct API
    }
  }

  // 2. Direct Last.fm API Call
  if (!API_KEY) return [];
  try {
    const res = await fetch(buildDirectUrl('chart.getTopArtists', { limit: String(limit) }));
    if (!res.ok) return [];
    const data = await res.json();
    const raw = data?.artists?.artist || [];
    const list = Array.isArray(raw) ? raw : [raw];

    const results = list.map((a: any) => ({
      id: `lastfm_${encodeURIComponent(a.name)}`,
      name: a.name,
      image: extractImage(a.image) || CONFIG.ARTWORK_PLACEHOLDER,
      followerCount: parseInt(a.listeners || '0'),
      provider: 'lastfm' as const,
      externalUrl: a.url,
    }));
    saveToCache(cacheKey, results);
    return results;
  } catch {
    return [];
  }
}

export async function getLastfmTopTracks(limit = 20): Promise<{ title: string; artist: string; image?: string; playcount?: number; listeners?: number }[]> {
  const cacheKey = `chart_top_tracks_${limit}`;
  const cached = getFromCache<any[]>(cacheKey);
  if (cached) return cached;

  // 1. Try Backend Proxy First
  if (BACKEND_BASE) {
    try {
      const res = await fetch(`${BACKEND_BASE}/chart/top-tracks?limit=${limit}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.tracks)) {
          saveToCache(cacheKey, data.tracks);
          return data.tracks;
        }
      }
    } catch {
      // Fall through to direct API
    }
  }

  // 2. Direct Last.fm API Call
  if (!API_KEY) return [];
  try {
    const res = await fetch(buildDirectUrl('chart.getTopTracks', { limit: String(limit) }));
    if (!res.ok) return [];
    const data = await res.json();
    const raw = data?.tracks?.track || [];
    const list = Array.isArray(raw) ? raw : [raw];

    const results = list.map((t: any) => ({
      title: t.name,
      artist: t.artist?.name || '',
      image: extractImage(t.image),
      playcount: parseInt(t.playcount || '0'),
      listeners: parseInt(t.listeners || '0'),
    }));
    saveToCache(cacheKey, results);
    return results;
  } catch {
    return [];
  }
}

// ── FEATURE 5: Genre & Mood Tags (tag.getTopTracks) ─────────────────────────

export async function getLastfmTagTopTracks(tag: string, limit = 20): Promise<{
  title: string;
  artist: string;
  image?: string;
  rank?: number;
}[]> {
  const cleanTag = tag?.trim();
  if (!cleanTag) return [];

  const cacheKey = `tag_top_tracks_${cleanTag.toLowerCase()}_${limit}`;
  const cached = getFromCache<any[]>(cacheKey);
  if (cached) return cached;

  // 1. Try Backend Proxy First
  if (BACKEND_BASE) {
    try {
      const res = await fetch(`${BACKEND_BASE}/tag/${encodeURIComponent(cleanTag)}/top-tracks?limit=${limit}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.tracks)) {
          saveToCache(cacheKey, data.tracks);
          return data.tracks;
        }
      }
    } catch {
      // Fall through to direct API
    }
  }

  // 2. Direct Last.fm API Call
  if (!API_KEY) return [];
  try {
    const res = await fetch(buildDirectUrl('tag.getTopTracks', { tag: cleanTag, limit: String(limit) }));
    if (!res.ok) return [];
    const data = await res.json();
    const raw = data?.tracks?.track || [];
    const list = Array.isArray(raw) ? raw : [raw];

    const results = list.map((t: any) => ({
      title: t.name,
      artist: t.artist?.name || '',
      image: extractImage(t.image),
      rank: parseInt(t['@attr']?.rank || '0'),
    }));
    saveToCache(cacheKey, results);
    return results;
  } catch {
    return [];
  }
}

// ── Additional Helper: Track Information & Wiki Summary ────────────────────

export async function getLastfmTrackInfo(artist: string, track: string): Promise<{
  title: string;
  artist: string;
  album?: string;
  image?: string;
  duration?: number;
  summary?: string;
  tags?: string[];
  listeners?: number;
  playcount?: number;
} | null> {
  if (!artist || !track) return null;

  const cacheKey = `track_info_${artist.toLowerCase()}_${track.toLowerCase()}`;
  const cached = getFromCache<any>(cacheKey);
  if (cached) return cached;

  // 1. Try Backend Proxy First
  if (BACKEND_BASE) {
    try {
      const res = await fetch(`${BACKEND_BASE}/track/info?artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(track)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.track) {
          saveToCache(cacheKey, data.track);
          return data.track;
        }
      }
    } catch {
      // Fall through to direct API
    }
  }

  // 2. Direct Last.fm API Call
  if (!API_KEY) return null;
  try {
    const res = await fetch(buildDirectUrl('track.getInfo', { artist, track }));
    if (!res.ok) return null;
    const data = await res.json();
    const t = data?.track;
    if (!t) return null;

    const result = {
      title: t.name,
      artist: t.artist?.name || artist,
      album: t.album?.title || '',
      image: extractImage(t.album?.image),
      duration: parseInt(t.duration || '0') / 1000,
      summary: stripHtml(t.wiki?.summary || ''),
      tags: Array.isArray(t.toptags?.tag) ? t.toptags.tag.map((tag: any) => tag.name) : [],
      listeners: parseInt(t.listeners || '0'),
      playcount: parseInt(t.playcount || '0'),
    };
    saveToCache(cacheKey, result);
    return result;
  } catch {
    return null;
  }
}

// ── Artist Top Tracks ───────────────────────────────────────────────────────

export async function getLastfmArtistTopTracks(artistName: string, limit = 20): Promise<{
  title: string;
  artist: string;
  image?: string;
  listeners?: number;
  playcount?: number;
}[]> {
  const cleanName = artistName?.trim();
  if (!cleanName) return [];

  const cacheKey = `artist_top_tracks_${cleanName.toLowerCase()}_${limit}`;
  const cached = getFromCache<any[]>(cacheKey);
  if (cached) return cached;

  // 1. Try Backend Proxy First
  if (BACKEND_BASE) {
    try {
      const res = await fetch(`${BACKEND_BASE}/artist/${encodeURIComponent(cleanName)}/top-tracks?limit=${limit}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.tracks)) {
          saveToCache(cacheKey, data.tracks);
          return data.tracks;
        }
      }
    } catch {
      // Fall through to direct API
    }
  }

  // 2. Direct Last.fm API Call
  if (!API_KEY) return [];
  try {
    const res = await fetch(buildDirectUrl('artist.getTopTracks', { artist: cleanName, limit: String(limit) }));
    if (!res.ok) return [];
    const data = await res.json();
    const raw = data?.toptracks?.track || [];
    const list = Array.isArray(raw) ? raw : [raw];

    const results = list.map((t: any) => ({
      title: t.name,
      artist: t.artist?.name || cleanName,
      image: extractImage(t.image),
      listeners: parseInt(t.listeners || '0'),
      playcount: parseInt(t.playcount || '0'),
    }));
    saveToCache(cacheKey, results);
    return results;
  } catch {
    return [];
  }
}

