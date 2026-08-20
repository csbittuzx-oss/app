// ═══════════════════════════════════════════════════════════════════════════════
//  YouTubeQueue.ts
//  Endless Seed Radio & Smart AutoMix Queue Generator
//  • InnerTube WatchEndpoint & Seed Radio (RDAMVM${videoId})
//  • AI User Taste Profile Alignment & Behavioral Scoring
//  • Strict Freshness-First Prioritization (Unplayed songs over library/history)
//  • Strict Title & ID Deduplication (Never duplicate title, version or clone)
//  • Artist Diversity Enforcement & Multi-tier Fallback Pipeline
// ═══════════════════════════════════════════════════════════════════════════════

import type { Song } from '../data/models';
import { universalPost } from '../core/utils/http';
import { resizeImageUrl } from '../core/utils/imageUtils';
import {
  classifySongContext,
  getCoreTitle,
  isSameOrSimilarTitle,
  normalizeArtist,
  isPhonkSong,
  smartRecommendationEngine,
  analyzeSongCharacteristics,
  calculateSongSimilarityScore,
} from '../domain/recommendation/SmartRecommendationEngine';
import { isSongMatchingLanguage } from '../data/repository/musicRepository';
import { userProfileTracker } from '../domain/recommendation/UserProfileTracker';

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
   * Prioritizes FRESH unplayed songs tailored to the user's AI taste profile.
   */
  public static async generateSeedRadio(
    seedSong: Song | null,
    playlistId?: string,
    existingQueueIds: Set<string> = new Set(),
    existingQueue: Song[] = []
  ): Promise<Song[]> {
    if (!seedSong) return [];

    const musicCtx = classifySongContext(seedSong);
    const playedSongIds = userProfileTracker.getAllKnownPlayedSongIds();

    const blacklistedCoreTitles = new Set<string>();
    const seedCore = getCoreTitle(seedSong.title);
    if (seedCore) blacklistedCoreTitles.add(seedCore);

    existingQueue.forEach((s) => {
      const core = getCoreTitle(s.title);
      if (core) blacklistedCoreTitles.add(core);
    });

    const knownCoreTitles = new Set<string>();
    existingQueue.forEach((s) => {
      const core = getCoreTitle(s.title);
      if (core) knownCoreTitles.add(core);
    });

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

    let candidates: Song[] = [];

    // ── Tier 1: YouTube Music Seed Radio (RDAMVM${videoId} or custom playlistId) ──
    if (videoId && navigator.onLine) {
      try {
        const targetPlaylistId = playlistId || `RDAMVM${videoId}`;
        const tier1Tracks = await this.callInnerTubeNext(
          videoId,
          targetPlaylistId,
          seedSong,
          musicCtx,
          existingQueueIds,
          blacklistedCoreTitles
        );
        candidates.push(...tier1Tracks);
      } catch (e) {
        console.warn('YouTubeQueue Tier 1 fallback:', e);
      }

      // ── Tier 2: YouTube Music Song Radio (Direct Video Radio) ──
      if (candidates.length < 8) {
        try {
          const tier2Tracks = await this.callInnerTubeNext(
            videoId,
            undefined,
            seedSong,
            musicCtx,
            existingQueueIds,
            blacklistedCoreTitles
          );
          for (const t of tier2Tracks) {
            if (!candidates.some((c) => c.id === t.id)) {
              candidates.push(t);
            }
          }
        } catch (e) {
          console.warn('YouTubeQueue Tier 2 fallback:', e);
        }
      }
    }

    // ── Tier 3: Multi-Source Context, Language & AI Taste Recommendation Fallback ──
    if (candidates.length < 12) {
      try {
        const tier3Tracks = await smartRecommendationEngine.getSmartNextTracks(seedSong, 20, {
          queue: existingQueue,
        });
        for (const t of tier3Tracks) {
          const core = getCoreTitle(t.title);
          if (
            !existingQueueIds.has(t.id) &&
            !candidates.some((c) => c.id === t.id) &&
            !isSameOrSimilarTitle(t.title, seedSong.title) &&
            (!core || !blacklistedCoreTitles.has(core))
          ) {
            candidates.push(t);
          }
        }
      } catch (e) {
        console.warn('YouTubeQueue Tier 3 fallback error:', e);
      }
    }

    // ── Score & Rank Candidates with Style Similarity & Freshness ──────────
    const seedChars = analyzeSongCharacteristics(seedSong);

    const scored = candidates.map((song) => {
      const candChars = analyzeSongCharacteristics(song);
      const similarityScore = calculateSongSimilarityScore(
        seedSong,
        song,
        seedChars,
        candChars,
        [],
        playedSongIds
      );

      const songCore = getCoreTitle(song.title);
      const isFresh = !playedSongIds.has(song.id) && (!songCore || !knownCoreTitles.has(songCore));

      let score = similarityScore;
      if (isFresh) score += 35;

      return { song, score, isFresh };
    });

    const freshList = scored.filter((i) => i.score > -100 && i.isFresh).sort((a, b) => b.score - a.score);
    const knownList = scored.filter((i) => i.score > -100 && !i.isFresh).sort((a, b) => b.score - a.score);

    const orderedPool: Song[] = [
      ...freshList.map((i) => i.song),
      ...knownList.map((i) => i.song),
    ];

    return this.applyArtistDiversity(orderedPool, seedSong);
  }

  /**
   * Enforces artist diversity: avoids placing multiple consecutive tracks by the same artist.
   */
  private static applyArtistDiversity(songs: Song[], seedSong: Song): Song[] {
    if (songs.length <= 1) return songs;

    const seedArtist = normalizeArtist(seedSong.artist);
    const result: Song[] = [];
    const remaining = [...songs];
    let lastArtist = seedArtist;

    while (remaining.length > 0) {
      // Find the first track with a different artist
      let nextIndex = remaining.findIndex((s) => {
        const a = normalizeArtist(s.artist);
        return a && a !== lastArtist;
      });

      if (nextIndex === -1) {
        // If all remaining tracks are from the same artist, take the first
        nextIndex = 0;
      }

      const [selected] = remaining.splice(nextIndex, 1);
      result.push(selected);
      lastArtist = normalizeArtist(selected.artist);
    }

    return result;
  }

  /**
   * Invokes the YouTube Music InnerTube `next` API endpoint with strict filtering.
   */
  private static async callInnerTubeNext(
    videoId: string,
    playlistId: string | undefined,
    seedSong: Song,
    musicCtx: ReturnType<typeof classifySongContext>,
    existingQueueIds: Set<string>,
    blacklistedCoreTitles: Set<string>
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
    const seenCores = new Set<string>(blacklistedCoreTitles);

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

      if (!title) continue;

      // ── 1. Strict duplicate / same-title check against seedSong ──
      if (isSameOrSimilarTitle(title, seedSong.title)) {
        continue;
      }

      const core = getCoreTitle(title);
      if (!core || seenCores.has(core)) {
        continue;
      }

      // ── 2. Language & Genre Context Gate ──
      if (musicCtx.isPhonk) {
        if (!isPhonkSong({ title, artist, genre: 'Phonk' } as any)) {
          continue;
        }
      } else if (musicCtx.language && musicCtx.language !== 'International') {
        const seedArtistNorm = normalizeArtist(seedSong.artist);
        const candArtistNorm = normalizeArtist(artist);
        const isSameArtist = seedArtistNorm && candArtistNorm && seedArtistNorm === candArtistNorm;

        if (!isSameArtist && !isSongMatchingLanguage({ title, artist, genre: '' } as any, musicCtx.language)) {
          continue;
        }
      }

      seenCores.add(core);

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
        genre: musicCtx.genre || 'YouTube Music',
        popularity: 90,
      });
    }

    return results;
  }
}
