import { registerPlugin, Capacitor } from '@capacitor/core';
import type { Song } from '../data/models';

export interface MediaNotificationPluginInterface {
  update(options: {
    title: string;
    artist: string;
    album?: string;
    artwork?: string;
    isPlaying: boolean;
    duration?: number;
    position?: number;
  }): Promise<void>;
  clear(): Promise<void>;
  requestPermissions?(): Promise<{ notifications: string }>;
  checkPermissions?(): Promise<{ notifications: string }>;
  addListener?(eventName: string, listenerFunc: (data: any) => void): Promise<any>;
}

const NativeMediaNotification = registerPlugin<MediaNotificationPluginInterface>('MediaNotification');

export class MediaNotificationService {
  private static isInitialized = false;

  static async init(callbacks: {
    onPlay: () => void;
    onPause: () => void;
    onNext: () => void;
    onPrev: () => void;
    onSeekTo: (position: number) => void;
  }) {
    if (!Capacitor.isNativePlatform()) return;
    if (this.isInitialized) return;
    this.isInitialized = true;

    try {
      if (NativeMediaNotification.checkPermissions && NativeMediaNotification.requestPermissions) {
        const perm = await NativeMediaNotification.checkPermissions();
        if (perm.notifications !== 'granted') {
          await NativeMediaNotification.requestPermissions();
        }
      }

      if (NativeMediaNotification.addListener) {
        NativeMediaNotification.addListener('mediaAction', (data: { action: string; position?: number }) => {
          if (data.action === 'play') callbacks.onPlay();
          else if (data.action === 'pause') callbacks.onPause();
          else if (data.action === 'next') callbacks.onNext();
          else if (data.action === 'prev') callbacks.onPrev();
          else if (data.action === 'seekTo' && typeof data.position === 'number') callbacks.onSeekTo(data.position);
        });
      }
    } catch (e) {
      console.warn('Native MediaNotification listener setup error:', e);
    }
  }

  static async update(song: Song, isPlaying: boolean, duration = 0, position = 0) {
    if (!Capacitor.isNativePlatform()) return;
    try {
      await NativeMediaNotification.update({
        title: song.title,
        artist: song.artist,
        album: song.album || 'Soundwave',
        artwork: song.artworkLg || song.artwork || '',
        isPlaying,
        duration: Math.round(duration || song.duration || 0),
        position: Math.round(position || 0),
      });
    } catch (e) {
      console.warn('Native MediaNotification update error:', e);
    }
  }

  static async clear() {
    if (!Capacitor.isNativePlatform()) return;
    try {
      await NativeMediaNotification.clear();
    } catch (e) {
      console.warn('Native MediaNotification clear error:', e);
    }
  }
}
