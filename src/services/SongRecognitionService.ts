// ═══════════════════════════════════════════
//  SongRecognitionService
//  Coordinates microphone recording, audio sampling, and Shazam recognition
// ═══════════════════════════════════════════

import type { RecognitionResult } from '../data/models';
import { recognizeAudioSnippet } from '../data/api/shazamApi';

export type RecognitionState = 'idle' | 'listening' | 'identifying' | 'success' | 'error';

export interface RecognitionEvent {
  state: RecognitionState;
  result?: RecognitionResult | null;
  error?: string | null;
}

type Listener = (event: RecognitionEvent) => void;

class SongRecognitionService {
  private listeners = new Set<Listener>();
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private recordingTimeout: any = null;
  public currentState: RecognitionState = 'idle';

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: RecognitionEvent) {
    this.currentState = event.state;
    this.listeners.forEach((l) => l(event));
  }

  /**
   * Starts ambient listening for 4.5 seconds to recognize playing music.
   */
  async startListening(): Promise<RecognitionResult | null> {
    if (this.currentState === 'listening' || this.currentState === 'identifying') {
      return null;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.emit({ state: 'error', error: 'Microphone access is not supported on this device.' });
      return null;
    }

    try {
      this.audioChunks = [];
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 44100,
          echoCancellation: false,
          noiseSuppression: false,
        },
      });

      this.emit({ state: 'listening' });

      return new Promise<RecognitionResult | null>((resolve) => {
        const mimeType = MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : 'audio/wav';

        this.mediaRecorder = new MediaRecorder(stream, { mimeType });

        this.mediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            this.audioChunks.push(e.data);
          }
        };

        this.mediaRecorder.onstop = async () => {
          // Stop mic tracks
          stream.getTracks().forEach((track) => track.stop());

          this.emit({ state: 'identifying' });

          try {
            const audioBlob = new Blob(this.audioChunks, { type: mimeType });
            const reader = new FileReader();

            reader.onloadend = async () => {
              const base64Data = (reader.result as string)?.split(',')[1] || '';
              if (!base64Data) {
                this.emit({ state: 'error', error: 'Could not process audio sample.' });
                resolve(null);
                return;
              }

              const result = await recognizeAudioSnippet(base64Data, 44100);
              if (result && result.title) {
                this.emit({ state: 'success', result });
                resolve(result);
              } else {
                this.emit({ state: 'error', error: 'No song match found. Please try again closer to the speaker.' });
                resolve(null);
              }
            };

            reader.readAsDataURL(audioBlob);
          } catch (e: any) {
            this.emit({ state: 'error', error: e?.message || 'Identification failed.' });
            resolve(null);
          }
        };

        this.mediaRecorder.start();

        // Record for 4.5 seconds
        this.recordingTimeout = setTimeout(() => {
          if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.stop();
          }
        }, 4500);
      });
    } catch (err: any) {
      const msg = err?.name === 'NotAllowedError'
        ? 'Microphone permission denied. Please enable mic access in app settings.'
        : 'Microphone is currently unavailable.';
      this.emit({ state: 'error', error: msg });
      return null;
    }
  }

  /**
   * Cancels active recording/identifying.
   */
  cancel() {
    if (this.recordingTimeout) clearTimeout(this.recordingTimeout);
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      try { this.mediaRecorder.stop(); } catch {}
    }
    this.emit({ state: 'idle' });
  }
}

export const songRecognitionService = new SongRecognitionService();
