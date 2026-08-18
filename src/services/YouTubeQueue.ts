// ═══════════════════════════════════════════════════════════════════════════════
//  YouTubeQueue.ts
//  Endless Seed Radio & AutoMix Queue Generator
//  • InnerTube WatchEndpoint & Seed Radio (RDAMVM${videoId})
//  • 3-Tier Recommendation Fallback Pipeline
//  • Automated replenishment & non-stop playback buffering
// ═══════════════════════════════════════════════════════════════════════════════

import type { Song } from '../data/models';
import { universalPost } from '../core/utils/http';
import { resizeImageUrl } from '../core/utils/imageUtils';
import { smartRecommendationEngine } from '../domain/recommendation/SmartRecommendationEngine';

const YTM_NEXT_ENDPOINT = 'https://music.youtube.com/youtubei/v1/next?prettyPrint=false';

function parseDurationString(durStr?: string): number {
  if (!durStr) return 210;
  const parts = durStr.split(':').map((p) => parseInt(p, 10));
  if (parts.length === 2) return (parts[0] || 0) * 60 + (parts[1] || 0);
  if (parts.length === 3) return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
  return 210;
}

export class YouTubeQueueService {
  /**
   * Extracts clean YouTube video ID from a song or searches for it.
   */
  private static extractVideoId(song: Song): string | null {
    if (song.id.startsWith('yt_')) {
      const vid = song.id.replace('yt_', '');
      if (vid.length === 11 && /^[a-zA-Z0-9_-]{11}$/.test(vid)) {
        return vid;
      }
    }
    return null;
  }

  /**
   * Generates an Endless Seed Radio queue matching the seed song's genre, vibe, artist, and tempo.
   * Uses a 3-Tier Fallback Pipeline:
   *  Tier 1: YouTube Music Seed Radio (RDAMVM${videoId} / playlistId)
   *  Tier 2: YouTube Music Song Radio (videoId)
   *  Tier 3: SmartRecommendationEngine Contextual Fallback
   */
  public static async generateSeedRadio(
    seedSong: Song | null,
    playlistId?: string,
    existingQueueIds: Set<string> = new Set()
  ): Promise<Song[]> {
    if (!seedSong) return [];

    let videoId = this.extractVideoId(seedSong);

    // If song is from Saavn / Spotify, attempt to resolve YouTube video ID first
    if (!videoId && navigator.onLine) {
      try {
        const { resolveYouTubeFullAudioStream } = await import('../data/api/youtubeMusicApi');
        const resolved = await resolveYouTubeFullAudioStream(
          seedSong.title,
          seedSong.artist,
          seedSong.duration
        );
        if (resolved?.videoId) {
          videoId = resolved.videoId;
        }
      } catch {}
    }

    // ── Tier 1: YouTube Music Seed Radio (RDAMVM${videoId} or custom playlistId) ──
    if (videoId && navigator.onLine) {
      try {
        const targetPlaylistId = playlistId || `RDAMVM${videoId}`;
        const tier1Tracks = await this.callInnerTubeNext(videoId, targetPlaylistId, existingQueueIds);
        if (tier1Tracks.length >= 5) {
          return tier1Tracks;
        }
      } catch (e) {
        console.warn('YouTubeQueue Tier 1 (Playlist/Seed Radio) fallback:', e);
      }

      // ── Tier 2: YouTube Music Song Radio (Direct Video Radio) ──
      try {
        const tier2Tracks = await this.callInnerTubeNext(videoId, undefined, existingQueueIds);
        if (tier2Tracks.length >= 5) {
          return tier2Tracks;
        }
      } catch (e) {
        console.warn('YouTubeQueue Tier 2 (Song Radio) fallback:', e);
      }
    }

    // ── Tier 3: Multi-Source Context & Language Recommendation Fallback ──
    try {
      const tier3Tracks = await smartRecommendationEngine.getSmartNextTracks(seedSong, 20);
      return tier3Tracks.filter((s) => !existingQueueIds.has(s.id));
    } catch (e) {
      console.warn('YouTubeQueue Tier 3 fallback error:', e);
      return [];
    }
  }

  /**
   * Invokes the YouTube Music InnerTube `next` API endpoint.
   */
  private static async callInnerTubeNext(
    videoId: string,
    playlistId?: string,
    existingQueueIds: Set<string> = new Set()
  ): Promise<Song[]> {
    const payload: any = {
      context: {
        client: {
          clientName: 'WEB_REMIX',
          clientVersion: '1.20240101.01.00',
          hl: 'en',
          gl: 'IN',
        },
      },
      videoId,
      isAudioOnly: true,
    };

    if (playlistId) {
      payload.playlistId = playlistId;
    }

    const data = await universalPost(YTM_NEXT_ENDPOINT, payload, {
      Origin: 'https://music.youtube.com',
      Referer: 'https://music.youtube.com/',
    });

    const items =
      data?.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer?.watchNextTabbedResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.musicQueueRenderer?.content?.playlistPanelRenderer?.contents ||
      data?.continuationContents?.playlistPanelContinuation?.contents ||
      [];

    const results: Song[] = [];

    for (const item of items) {
      const r = item.playlistPanelVideoRenderer;
      if (!r) continue;

      const vid = r.videoId || r.navigationEndpoint?.watchEndpoint?.videoId;
      if (!vid) continue;

      const songId = `yt_${vid}`;
      if (existingQueueIds.has(songId) || results.some((s) => s.id === songId)) {
        continue;
      }

      const title = r.title?.runs?.[0]?.text || '';
      const artist =
        r.longBylineText?.runs?.[0]?.text ||
        r.shortBylineText?.runs?.[0]?.text ||
        'YouTube Music';
      const album = r.longBylineText?.runs?.[2]?.text || title;
      const durStr = r.lengthText?.runs?.[0]?.text;
      const rawThumb =
        r.thumbnail?.thumbnails?.slice(-1)[0]?.url ||
        `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;

      if (title) {
        results.push({
          id: songId,
          title,
          artist,
          album,
          artwork: resizeImageUrl(rawThumb, 544, 544),
          artworkLg: resizeImageUrl(rawThumb, 1200, 1200),
          duration: parseDurationString(durStr),
          previewUrl: null,
          provider: 'youtube',
          isLiked: false,
          isDownloaded: false,
          genre: 'YouTube Music',
          popularity: 90,
        });
      }
    }

    return results;
  }
}
