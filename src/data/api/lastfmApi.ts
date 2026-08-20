// ═════════════════════════════════════════════════════════════════════
//  Last.fm Metadata API Client — Soundwave Music Platform
//
//  Supports:
//  • Render Backend API Proxy with 15-min in-memory caching
//  • Direct Last.fm audioscrobbler API fallback
//  • Rich artist biographies, tags, listeners, similar artists & charts
// ═════════════════════════════════════════════════════════════════════

import type { Artist } from '../models';
import { CONFIG } from '../../config';

const API_KEY = CONFIG.LASTFM_API_KEY || 'b25b959554ed76058ac220b7b2e0a026';
const BASE = CONFIG.LASTFM_BASE_URL || 'https://ws.audioscrobbler.com/2.0';
const BACKEND_BASE = CONFIG.BACKEND_URL ? `${CONFIG.BACKEND_URL.replace(/\/$/, '')}/api/lastfm` : '';

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

// ── 1. Artist Information ───────────────────────────────────────────────────

export async function getLastfmArtist(artistName: string): Promise<Partial<Artist> | null> {
  const cleanName = artistName?.trim();
  if (!cleanName) return null;

  // Try Backend Proxy First
  if (BACKEND_BASE) {
    try {
      const res = await fetch(`${BACKEND_BASE}/artist/${encodeURIComponent(cleanName)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.artist) {
          return {
            id: data.artist.id,
            name: data.artist.name,
            image: data.artist.image || CONFIG.ARTWORK_PLACEHOLDER,
            imageLg: data.artist.image || CONFIG.ARTWORK_PLACEHOLDER,
            followerCount: data.artist.listeners,
            bio: data.artist.bio,
            provider: 'lastfm',
            externalUrl: data.artist.url,
          };
        }
      }
    } catch {
      // Fallback to direct API
    }
  }

  // Direct Last.fm API Fallback
  if (!API_KEY) return null;
  try {
    const res = await fetch(buildDirectUrl('artist.getInfo', { artist: cleanName }));
    if (!res.ok) return null;
    const data = await res.json();
    const a = data?.artist;
    if (!a) return null;
    const image = extractImage(a.image);

    return {
      id: `lastfm_${a.mbid || encodeURIComponent(a.name)}`,
      name: a.name,
      image: image || CONFIG.ARTWORK_PLACEHOLDER,
      imageLg: image || CONFIG.ARTWORK_PLACEHOLDER,
      followerCount: parseInt(a.stats?.listeners || '0'),
      bio: stripHtml(a.bio?.summary || ''),
      provider: 'lastfm',
      externalUrl: a.url,
    };
  } catch {
    return null;
  }
}

// ── 2. Similar Artists ──────────────────────────────────────────────────────

export async function getSimilarArtists(artistName: string, limit = 8): Promise<Artist[]> {
  const cleanName = artistName?.trim();
  if (!cleanName) return [];

  // Try Backend Proxy First
  if (BACKEND_BASE) {
    try {
      const res = await fetch(`${BACKEND_BASE}/artist/${encodeURIComponent(cleanName)}/similar?limit=${limit}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.artists)) {
          return data.artists.map((a: any) => ({
            id: `lastfm_${encodeURIComponent(a.name)}`,
            name: a.name,
            image: a.image || CONFIG.ARTWORK_PLACEHOLDER,
            provider: 'lastfm' as const,
            externalUrl: a.url,
          }));
        }
      }
    } catch {
      // Fallback to direct API
    }
  }

  // Direct Last.fm API Fallback
  if (!API_KEY) return [];
  try {
    const res = await fetch(buildDirectUrl('artist.getSimilar', { artist: cleanName, limit: String(limit) }));
    if (!res.ok) return [];
    const data = await res.json();
    const raw = data?.similarartists?.artist || [];
    const list = Array.isArray(raw) ? raw : [raw];

    return list.map((a: any) => ({
      id: `lastfm_${encodeURIComponent(a.name)}`,
      name: a.name,
      image: extractImage(a.image) || CONFIG.ARTWORK_PLACEHOLDER,
      provider: 'lastfm' as const,
      externalUrl: a.url,
    }));
  } catch {
    return [];
  }
}

// ── 3. Top Artists Global Chart ─────────────────────────────────────────────

export async function getLastfmTopArtists(limit = 12): Promise<Artist[]> {
  // Try Backend Proxy First
  if (BACKEND_BASE) {
    try {
      const res = await fetch(`${BACKEND_BASE}/chart/top-artists?limit=${limit}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.artists)) {
          return data.artists.map((a: any) => ({
            id: `lastfm_${encodeURIComponent(a.name)}`,
            name: a.name,
            image: a.image || CONFIG.ARTWORK_PLACEHOLDER,
            followerCount: a.listeners,
            provider: 'lastfm' as const,
            externalUrl: a.url,
          }));
        }
      }
    } catch {
      // Fallback to direct API
    }
  }

  // Direct Last.fm API Fallback
  if (!API_KEY) return [];
  try {
    const res = await fetch(buildDirectUrl('chart.getTopArtists', { limit: String(limit) }));
    if (!res.ok) return [];
    const data = await res.json();
    const raw = data?.artists?.artist || [];
    const list = Array.isArray(raw) ? raw : [raw];

    return list.map((a: any) => ({
      id: `lastfm_${encodeURIComponent(a.name)}`,
      name: a.name,
      image: extractImage(a.image) || CONFIG.ARTWORK_PLACEHOLDER,
      followerCount: parseInt(a.listeners || '0'),
      provider: 'lastfm' as const,
      externalUrl: a.url,
    }));
  } catch {
    return [];
  }
}

// ── 4. Top Tracks Global Chart ──────────────────────────────────────────────

export async function getLastfmTopTracks(limit = 20): Promise<{ title: string; artist: string; image?: string; playcount?: number }[]> {
  // Try Backend Proxy First
  if (BACKEND_BASE) {
    try {
      const res = await fetch(`${BACKEND_BASE}/chart/top-tracks?limit=${limit}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.tracks)) {
          return data.tracks;
        }
      }
    } catch {
      // Fallback to direct API
    }
  }

  // Direct Last.fm API Fallback
  if (!API_KEY) return [];
  try {
    const res = await fetch(buildDirectUrl('chart.getTopTracks', { limit: String(limit) }));
    if (!res.ok) return [];
    const data = await res.json();
    const raw = data?.tracks?.track || [];
    const list = Array.isArray(raw) ? raw : [raw];

    return list.map((t: any) => ({
      title: t.name,
      artist: t.artist?.name || '',
      image: extractImage(t.image),
      playcount: parseInt(t.playcount || '0'),
    }));
  } catch {
    return [];
  }
}

// ── 5. Track Information & Wiki Summary ─────────────────────────────────────

export async function getLastfmTrackInfo(artist: string, track: string): Promise<{
  title: string;
  artist: string;
  album?: string;
  image?: string;
  duration?: number;
  summary?: string;
  tags?: string[];
} | null> {
  if (!artist || !track) return null;

  // Try Backend Proxy First
  if (BACKEND_BASE) {
    try {
      const res = await fetch(`${BACKEND_BASE}/track/info?artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(track)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.track) {
          return data.track;
        }
      }
    } catch {
      // Fallback to direct API
    }
  }

  // Direct Last.fm API Fallback
  if (!API_KEY) return null;
  try {
    const res = await fetch(buildDirectUrl('track.getInfo', { artist, track }));
    if (!res.ok) return null;
    const data = await res.json();
    const t = data?.track;
    if (!t) return null;

    return {
      title: t.name,
      artist: t.artist?.name || artist,
      album: t.album?.title || '',
      image: extractImage(t.album?.image),
      duration: parseInt(t.duration || '0') / 1000,
      summary: stripHtml(t.wiki?.summary || ''),
      tags: Array.isArray(t.toptags?.tag) ? t.toptags.tag.map((tag: any) => tag.name) : [],
    };
  } catch {
    return null;
  }
}

// ── 6. Artist Top Tracks ────────────────────────────────────────────────────

export async function getLastfmArtistTopTracks(artistName: string, limit = 20): Promise<{
  title: string;
  artist: string;
  image?: string;
  listeners?: number;
}[]> {
  const cleanName = artistName?.trim();
  if (!cleanName) return [];

  // Try Backend Proxy First
  if (BACKEND_BASE) {
    try {
      const res = await fetch(`${BACKEND_BASE}/artist/${encodeURIComponent(cleanName)}/top-tracks?limit=${limit}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.tracks)) {
          return data.tracks;
        }
      }
    } catch {
      // Fallback to direct API
    }
  }

  // Direct Last.fm API Fallback
  if (!API_KEY) return [];
  try {
    const res = await fetch(buildDirectUrl('artist.getTopTracks', { artist: cleanName, limit: String(limit) }));
    if (!res.ok) return [];
    const data = await res.json();
    const raw = data?.toptracks?.track || [];
    const list = Array.isArray(raw) ? raw : [raw];

    return list.map((t: any) => ({
      title: t.name,
      artist: t.artist?.name || cleanName,
      image: extractImage(t.image),
      listeners: parseInt(t.listeners || '0'),
    }));
  } catch {
    return [];
  }
}

// ── 7. Tag / Genre Top Tracks ───────────────────────────────────────────────

export async function getLastfmTagTopTracks(tag: string, limit = 20): Promise<{
  title: string;
  artist: string;
  image?: string;
}[]> {
  const cleanTag = tag?.trim();
  if (!cleanTag) return [];

  // Try Backend Proxy First
  if (BACKEND_BASE) {
    try {
      const res = await fetch(`${BACKEND_BASE}/tag/${encodeURIComponent(cleanTag)}/top-tracks?limit=${limit}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.tracks)) {
          return data.tracks;
        }
      }
    } catch {
      // Fallback to direct API
    }
  }

  // Direct Last.fm API Fallback
  if (!API_KEY) return [];
  try {
    const res = await fetch(buildDirectUrl('tag.getTopTracks', { tag: cleanTag, limit: String(limit) }));
    if (!res.ok) return [];
    const data = await res.json();
    const raw = data?.tracks?.track || [];
    const list = Array.isArray(raw) ? raw : [raw];

    return list.map((t: any) => ({
      title: t.name,
      artist: t.artist?.name || '',
      image: extractImage(t.image),
    }));
  } catch {
    return [];
  }
}
