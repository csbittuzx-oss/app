// ═══════════════════════════════════════════
//  Animated Canvas & Video Backdrop API
//  Fetches full-screen looping video canvases for active songs
// ═══════════════════════════════════════════

import type { TrackCanvas } from '../models';
import { universalGet } from '../../core/utils/http';

const canvasCache = new Map<string, TrackCanvas | null>();

/**
 * Resolves an animated looping video canvas (MP4) for a given song title and artist.
 */
export async function getTrackCanvas(
  title: string,
  artist: string,
  spotifyTrackId?: string
): Promise<TrackCanvas | null> {
  if (!title || !artist) return null;

  const key = `${title.toLowerCase().trim()}_${artist.toLowerCase().trim()}`;
  if (canvasCache.has(key)) {
    return canvasCache.get(key) || null;
  }

  // 1. If we have a Spotify track ID, query Spotify Canvas proxy
  if (spotifyTrackId && !spotifyTrackId.startsWith('track_')) {
    try {
      const cleanId = spotifyTrackId.replace(/^spotify_/, '');
      const canvasEndpoint = `https://canvas.canvasapp.workers.dev/canvas?trackId=${cleanId}`;
      const data = await universalGet(canvasEndpoint);
      if (data?.canvas_url && data.canvas_url.endsWith('.mp4')) {
        const result: TrackCanvas = {
          songId: `${artist}_${title}`,
          canvasUrl: data.canvas_url,
          type: 'video',
          source: 'spotify_canvas',
        };
        canvasCache.set(key, result);
        return result;
      }
    } catch {}
  }

  // 2. Query Echo Canvas API / Paxsenix Motion API
  try {
    const cleanTitle = title.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').trim();
    const primaryArtist = artist.split(/[,&/]|feat\.|ft\./i)[0]?.trim() || '';
    const queryUrl = `https://api.paxsenix.biz.id/media/canvas?title=${encodeURIComponent(cleanTitle)}&artist=${encodeURIComponent(primaryArtist)}`;
    const data = await universalGet(queryUrl);
    if (data?.url && (data.url.endsWith('.mp4') || data.url.includes('video'))) {
      const result: TrackCanvas = {
        songId: `${artist}_${title}`,
        canvasUrl: data.url,
        type: 'video',
        source: 'echo_canvas',
      };
      canvasCache.set(key, result);
      return result;
    }
  } catch {}

  canvasCache.set(key, null);
  return null;
}
