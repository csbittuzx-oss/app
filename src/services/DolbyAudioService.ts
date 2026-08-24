// ═══════════════════════════════════════════════════════════════
//  DolbyAudioService — Hardware Native Dolby Atmos / Audio Engine
//  Detects device hardware support and controls system audio DSP
// ═══════════════════════════════════════════════════════════════

import { registerPlugin } from '@capacitor/core';

interface DolbyPlugin {
  isSupported(): Promise<{ supported: boolean; effectName?: string }>;
  setEnabled(options: { enabled: boolean }): Promise<{ success: boolean; enabled: boolean }>;
  isEnabled(): Promise<{ enabled: boolean }>;
}

const DolbyNative = registerPlugin<DolbyPlugin>('DolbyAudio');

class DolbyAudioService {
  private supported: boolean | null = null;
  private effectName = '';
  private enabled = false;

  public async checkSupport(): Promise<boolean> {
    if (this.supported !== null) return this.supported;

    try {
      const res = await DolbyNative.isSupported();
      this.supported = Boolean(res?.supported);
      this.effectName = res?.effectName || '';
      return this.supported;
    } catch {
      this.supported = false;
      return false;
    }
  }

  public isDolbySupportedSync(): boolean {
    return this.supported === true;
  }

  public getEffectName(): string {
    return this.effectName || 'Dolby Atmos';
  }

  public async setEnabled(enabled: boolean): Promise<boolean> {
    this.enabled = enabled;
    try {
      const res = await DolbyNative.setEnabled({ enabled });
      return Boolean(res?.enabled);
    } catch {
      return false;
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }
}

export const dolbyAudioService = new DolbyAudioService();
