// ═══════════════════════════════════════════════════════════════════════════════
//  audioDeviceUtils.ts
//  Audio Hardware Detection & Quality Spec Formatter
// ═══════════════════════════════════════════════════════════════════════════════

import type { AudioQuality } from '../../data/models';

/**
 * Detects whether the device hardware/browser audio pipeline supports Dolby Atmos / Spatial multi-channel audio.
 */
export function checkDolbyAtmosSupport(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const audioEl = document.createElement('audio');

    // Test for Dolby Digital Plus / Atmos codec support in HTML5 container
    const canPlayEc3 = audioEl.canPlayType('audio/mp4; codecs="ec-3"');
    const canPlayEac3 = audioEl.canPlayType('audio/mp4; codecs="eac3"');
    const canPlayAtmos = audioEl.canPlayType('audio/mp4; codecs="mp4a.a6"') || audioEl.canPlayType('audio/mp4; codecs="mlpa"');

    if (canPlayEc3 === 'probably' || canPlayEac3 === 'probably' || canPlayAtmos === 'probably') {
      return true;
    }

    // Check Web Audio destination channel count
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtx) {
      const testCtx = new AudioCtx();
      const maxChannels = testCtx.destination?.maxChannelCount || 2;
      testCtx.close().catch(() => {});
      if (maxChannels >= 6) {
        return true;
      }
    }

    return canPlayEc3 === 'maybe' || canPlayEac3 === 'maybe';
  } catch {
    return false;
  }
}

export interface QualityOptionSpec {
  id: AudioQuality;
  title: string;
  badge: string;
  desc: string;
  isLossless?: boolean;
  isSpatial?: boolean;
}

export const AUDIO_QUALITY_OPTIONS: QualityOptionSpec[] = [
  {
    id: 'auto',
    title: 'Auto Quality',
    badge: 'Smart Auto',
    desc: 'Selects highest quality available for song & connection (Recommended)',
  },
  {
    id: 'low',
    title: 'Low Quality',
    badge: '96 kbps',
    desc: 'Data saver mode for slower connections',
  },
  {
    id: 'medium',
    title: 'Medium Quality',
    badge: '192 kbps',
    desc: 'Balanced streaming with moderate data usage',
  },
  {
    id: 'high',
    title: 'High Quality',
    badge: '320 kbps',
    desc: 'Crystal clear studio master audio',
  },
  {
    id: 'flac_16_44',
    title: 'FLAC — 16-bit / 44.1 kHz',
    badge: 'Lossless CD',
    desc: 'Bit-perfect CD quality lossless audio',
    isLossless: true,
  },
  {
    id: 'flac_24_48',
    title: 'FLAC — 24-bit / 48 kHz',
    badge: 'Studio 24/48',
    desc: 'Studio master 24-bit lossless streaming',
    isLossless: true,
  },
  {
    id: 'flac_24_96',
    title: 'FLAC — 24-bit / 96 kHz',
    badge: 'Hi-Res 24/96',
    desc: 'High-resolution audiophile master audio',
    isLossless: true,
  },
  {
    id: 'flac_24_192',
    title: 'FLAC — 24-bit / 192 kHz',
    badge: 'Ultra HD 24/192',
    desc: 'Maximum bit-depth ultra high-resolution',
    isLossless: true,
  },
  {
    id: 'dolby_atmos',
    title: 'Dolby Atmos',
    badge: 'Spatial Audio',
    desc: 'Supported devices only (Hardware & spatial audio route)',
    isSpatial: true,
  },
];
