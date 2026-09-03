// ══════════════════════════════════════════════════════════════════════════════
//  InnerTube Audio Stream Resolver
//  Direct audio stream URL extraction from YouTube Music InnerTube API
//  • Multi-Client Contexts (ANDROID_MUSIC, WEB_REMIX, TVHTML5_SIMPLY_EMBEDDED_PLAYER)
//  • Best Audio Quality Filter: itag 251 (Opus 160kbps) > itag 140 (AAC 128kbps)
//  • Zero API Key Required — Native GoogleVideo CDN Stream Resolution
// ══════════════════════════════════════════════════════════════════════════════

import { universalPost } from '../../core/utils/http';

export interface InnerTubeAudioStream {
  streamUrl: string;
  itag: number;
  mimeType: string;
  bitrate?: number;
  duration?: number;
  expiresAt?: number;
}

const INNERTUBE_PLAYER_URL = 'https://music.youtube.com/youtubei/v1/player?prettyPrint=false';

// Multi-client configurations for maximum stability and anti-blocking resilience
const CLIENT_CONFIGS = [
  {
    name: 'ANDROID_MUSIC',
    client: {
      clientName: 'ANDROID_MUSIC',
      clientVersion: '7.02.51',
      androidSdkVersion: 34,
      hl: 'en',
      gl: 'IN',
    },
  },
  {
    name: 'WEB_REMIX',
    client: {
      clientName: 'WEB_REMIX',
      clientVersion: '1.20240101.01.00',
      hl: 'en',
      gl: 'IN',
    },
  },
  {
    name: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
    client: {
      clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
      clientVersion: '2.0',
      hl: 'en',
      gl: 'IN',
    },
  },
  {
    name: 'IOS_MUSIC',
    client: {
      clientName: 'IOS_MUSIC',
      clientVersion: '7.02',
      deviceModel: 'iPhone16,1',
      hl: 'en',
      gl: 'IN',
    },
  },
];

/**
 * Resolves direct audio stream URL from a YouTube videoId using the InnerTube Player API.
 */
export async function resolveInnerTubeAudioStream(videoId: string): Promise<InnerTubeAudioStream | null> {
  if (!videoId) return null;
  const cleanId = videoId.replace(/^yt_/, '').replace('/watch?v=', '').trim();
  if (!cleanId || cleanId.length !== 11) return null;

  for (const config of CLIENT_CONFIGS) {
    try {
      const payload = {
        context: {
          client: config.client,
        },
        videoId: cleanId,
        playbackContext: {
          contentPlaybackContext: {
            html5Preference: 'HTML5_PREF_WANTS',
          },
        },
      };

      const res = await universalPost(INNERTUBE_PLAYER_URL, payload, {
        'Origin': 'https://music.youtube.com',
        'Referer': 'https://music.youtube.com/',
        'Content-Type': 'application/json',
      });

      if (!res || !res.streamingData) continue;

      const adaptiveFormats = res.streamingData.adaptiveFormats || [];
      if (adaptiveFormats.length === 0) continue;

      // Extract duration in seconds
      const lengthSeconds = parseInt(
        res.videoDetails?.lengthSeconds ||
        adaptiveFormats[0]?.approxDurationMs ? String(Math.round(parseInt(adaptiveFormats[0].approxDurationMs, 10) / 1000)) : '0',
        10
      );

      // Filter and prioritize audio formats
      // Priority 1: itag 251 (Opus ~160kbps, audio/webm)
      // Priority 2: itag 140 (AAC ~128kbps, audio/mp4)
      // Priority 3: any other audio/* stream
      const audioStreams: InnerTubeAudioStream[] = [];

      for (const format of adaptiveFormats) {
        const mimeType = format.mimeType || '';
        if (!mimeType.startsWith('audio/')) continue;

        let streamUrl = format.url;
        if (!streamUrl && format.signatureCipher) {
          // Handle signature cipher if needed
          const params = new URLSearchParams(format.signatureCipher);
          streamUrl = params.get('url') || undefined;
        }

        if (streamUrl && streamUrl.startsWith('http')) {
          const itag = format.itag || 0;
          const bitrate = format.bitrate || format.averageBitrate;

          // Parse expiry timestamp from URL query param 'expire'
          let expiresAt: number | undefined;
          try {
            const urlObj = new URL(streamUrl);
            const expParam = urlObj.searchParams.get('expire');
            if (expParam) {
              expiresAt = parseInt(expParam, 10) * 1000;
            }
          } catch {}

          audioStreams.push({
            streamUrl,
            itag,
            mimeType,
            bitrate,
            duration: lengthSeconds > 0 ? lengthSeconds : undefined,
            expiresAt,
          });
        }
      }

      if (audioStreams.length > 0) {
        // Sort priority: itag 251 > itag 140 > highest bitrate
        audioStreams.sort((a, b) => {
          if (a.itag === 251) return -1;
          if (b.itag === 251) return 1;
          if (a.itag === 140) return -1;
          if (b.itag === 140) return 1;
          return (b.bitrate || 0) - (a.bitrate || 0);
        });

        const selected = audioStreams[0];
        return selected;
      }
    } catch (err) {
      // Try next client configuration
      continue;
    }
  }

  return null;
}
