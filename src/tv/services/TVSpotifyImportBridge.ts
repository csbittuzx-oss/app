import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface SpotifyImportServerInfo {
  success: boolean;
  ip?: string;
  port?: number;
  token?: string;
  url?: string;
  error?: string;
}

export interface PlaylistReceivedEvent {
  playlistUrl: string;
  playlistId: string;
}

export interface SpotifyImportPluginInterface {
  startServer(): Promise<SpotifyImportServerInfo>;
  stopServer(): Promise<{ success: boolean }>;
  getServerStatus(): Promise<{ running: boolean; ip?: string; port?: number; url?: string }>;
  addListener(
    eventName: 'playlistReceived',
    listenerFunc: (data: PlaylistReceivedEvent) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'clientConnected',
    listenerFunc: () => void
  ): Promise<PluginListenerHandle>;
}

export const SpotifyImportNative = registerPlugin<SpotifyImportPluginInterface>('SpotifyImport');
