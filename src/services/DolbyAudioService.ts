// ═══════════════════════════════════════════════════════════════
//  DolbyAudioService — Hardware Native Dolby Atmos / Audio Engine
//  Detects device hardware support and controls system audio DSP
// ═══════════════════════════════════════════════════════════════

import { registerPlugin } from '@capacitor/core';

interface DolbyPlugin {
  isSupported(): Promise<{
    supported: boolean;
    hardwareSupported?: boolean;
    headsetConnected?: boolean;
    canEnable?: boolean;
    effectName?: string;
  }>;
  setEnabled(options: { enabled: boolean }): Promise<{
    success: boolean;
    enabled: boolean;
    reason?: string;
  }>;
  isEnabled(): Promise<{ enabled: boolean }>;
}

const DolbyNative = registerPlugin<DolbyPlugin>('DolbyAudio');

export interface DolbyStatus {
  supported: boolean;
  hardwareSupported: boolean;
  headsetConnected: boolean;
  canEnable: boolean;
  effectName: string;
}

class DolbyAudioService {
  private effectName = 'Dolby Atmos';
  private enabled = false;

  public async getStatus(): Promise<DolbyStatus> {
    try {
      const res = await DolbyNative.isSupported();
      this.effectName = res?.effectName || 'Dolby Atmos';
      return {
        supported: true,
        hardwareSupported: Boolean(res?.hardwareSupported),
        headsetConnected: Boolean(res?.headsetConnected),
        canEnable: Boolean(res?.canEnable),
        effectName: this.effectName,
      };
    } catch {
      return {
        supported: true,
        hardwareSupported: false,
        headsetConnected: false,
        canEnable: true, // Fallback on web/emulator
        effectName: 'Dolby Atmos',
      };
    }
  }

  public getEffectName(): string {
    return this.effectName || 'Dolby Atmos';
  }

  public async setEnabled(enabled: boolean): Promise<{ success: boolean; enabled: boolean; reason?: string }> {
    try {
      const res = await DolbyNative.setEnabled({ enabled });
      this.enabled = Boolean(res?.enabled);
      return {
        success: Boolean(res?.success),
        enabled: this.enabled,
        reason: res?.reason,
      };
    } catch {
      this.enabled = enabled;
      return { success: true, enabled };
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }
}

export const dolbyAudioService = new DolbyAudioService();
