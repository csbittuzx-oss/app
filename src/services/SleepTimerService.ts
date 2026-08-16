import { audioPlayer } from '../domain/player/AudioPlayer';
import { showToast } from '../core/utils/toast';

export type SleepTimerMode = 'off' | 'duration' | 'end_of_track';

export interface SleepTimerState {
  isActive: boolean;
  mode: SleepTimerMode;
  remainingSeconds: number;
  totalSeconds: number;
  label: string;
}

type SleepTimerListener = (state: SleepTimerState) => void;

class SleepTimerService {
  private mode: SleepTimerMode = 'off';
  private timerId: any = null;
  private endsAt: number | null = null;
  private totalSeconds: number = 0;
  private label: string = '';
  private listeners: Set<SleepTimerListener> = new Set();

  constructor() {
    // Listen to audio player events for End of Track mode
    audioPlayer.subscribe((event) => {
      if (this.mode === 'end_of_track' && event.type === 'ended') {
        this.triggerSleep();
      }
    });
  }

  getState(): SleepTimerState {
    const remainingSeconds = this.endsAt ? Math.max(0, Math.ceil((this.endsAt - Date.now()) / 1000)) : 0;
    return {
      isActive: this.mode !== 'off',
      mode: this.mode,
      remainingSeconds,
      totalSeconds: this.totalSeconds,
      label: this.label,
    };
  }

  subscribe(listener: SleepTimerListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const state = this.getState();
    this.listeners.forEach((l) => l(state));
  }

  /** Starts a duration-based countdown timer (in minutes) */
  setTimer(minutes: number, customLabel?: string) {
    this.clear();
    const seconds = minutes * 60;
    this.mode = 'duration';
    this.totalSeconds = seconds;
    this.endsAt = Date.now() + seconds * 1000;
    this.label = customLabel || (minutes >= 60 ? `${minutes / 60} hour` : `${minutes} min`);

    this.timerId = setInterval(() => {
      if (!this.endsAt) return;
      const left = Math.ceil((this.endsAt - Date.now()) / 1000);
      if (left <= 0) {
        this.triggerSleep();
      } else {
        this.notify();
      }
    }, 1000);

    this.notify();
    showToast(`Sleep timer set for ${this.label}`, 'success');
  }

  /** Stops playback when the current track finishes playing */
  setEndOfTrack() {
    this.clear();
    this.mode = 'end_of_track';
    this.totalSeconds = 0;
    this.endsAt = null;
    this.label = 'End of Track';

    this.notify();
    showToast('Sleep timer set to End of Track', 'success');
  }

  /** Clears and cancels the active sleep timer */
  cancel() {
    if (this.mode === 'off') return;
    this.clear();
    this.notify();
    showToast('Sleep timer turned off', 'info');
  }

  private clear() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.mode = 'off';
    this.endsAt = null;
    this.totalSeconds = 0;
    this.label = '';
  }

  private triggerSleep() {
    this.clear();
    this.notify();
    audioPlayer.pause();
    showToast('Sleep timer finished. Music paused.', 'info');
  }
}

export const sleepTimerService = new SleepTimerService();
