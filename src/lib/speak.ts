import { makeTTS, type Locale } from './tts';

// 16kHz, 16-bit mono = 320ms chunks
const CHUNK_SIZE_MS = 320;
const BYTES_PER_MS = 32; // 16kHz * 16-bit / 8 bits = 32 bytes/ms
const CHUNK_SIZE_BYTES = CHUNK_SIZE_MS * BYTES_PER_MS;

interface SpeakOptions {
  text: string;
  locale: Locale;
  rewrite?: boolean;
  streamTo: (chunk: Uint8Array) => Promise<void>;
  onStart?: () => void;
  onDone?: (metrics: { ttsMs: number; streamMs: number; totalMs: number }) => void;
  onError?: (error: Error) => void;
}

interface SpeakResult {
  audioData: Uint8Array;
  durationMs: number;
  text: string;
  locale: string;
  stop: () => void;
  promise: Promise<void>;
}

// Default rewriter that passes through text as-is
const defaultRewriter = {
  rewriteWithinGuardrails: (text: string) => Promise.resolve(text)
};

let rewriter = defaultRewriter;

export function setRewriter(newRewriter: { rewriteWithinGuardrails: (text: string) => Promise<string> }): void {
  rewriter = newRewriter || defaultRewriter;
}

/**
 * Speaker class that handles text-to-speech synthesis with chunked streaming
 */
export class Speaker {
  private tts = makeTTS();
  private audioQueue: Uint8Array[] = [];
  private isSpeaking = false;
  private stopRequested = false;
  private onChunkCallback: ((chunk: Uint8Array) => void) | null = null;
  private onEndCallback: (() => void) | null = null;
  private onErrorCallback: ((error: Error) => void) | null = null;

  private cleanup(): void {
    this.isSpeaking = false;
    this.stopRequested = false;
  }

  stop(): void {
    if (this.isSpeaking) {
      this.stopRequested = true;
      this.audioQueue = [];
      this.cleanup();
    }
  }

  /**
   * Converts text to speech and streams it in chunks
   * @param options The options for speaking
   */
  async speak(options: SpeakOptions): Promise<SpeakResult> {
    if (this.isSpeaking) {
      this.stop();
      // Small delay to allow the stop to take effect
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.isSpeaking = true;
    this.stopRequested = false;
    this.audioQueue = [];

    const startTime = performance.now();
    let ttsStartTime = 0;
    let isStopped = false;
    let resolveStopped: () => void;

    const stopPromise = new Promise<void>((resolve) => {
      resolveStopped = resolve;
    });

    try {
      let finalText = options.text;
      
      // Apply text rewriting if enabled and rewriter is available
      if (options.rewrite && rewriter) {
        finalText = await rewriter.rewriteWithinGuardrails(finalText);
      }

      // Get audio data from TTS service
      const audioData = await this.tts.synth(finalText, options.locale);
      
      if (this.stopRequested) {
        return {
          audioData: new Uint8Array(0),
          durationMs: 0,
          text: options.text,
          locale: options.locale,
          stop: () => {},
          promise: Promise.resolve()
        };
      }

      // Process audio data in chunks
      let position = 0;
      const totalLength = audioData.length;
      const startTime = performance.now();

      while (position < totalLength && !this.stopRequested) {
        const chunkEnd = Math.min(position + CHUNK_SIZE_BYTES, totalLength);
        const chunk = audioData.slice(position, chunkEnd);
        
        this.audioQueue.push(chunk);
        
        try {
          // Stream the chunk
          await options.streamTo(chunk);
          
          // Notify listeners of new chunk
          if (this.onChunkCallback) {
            this.onChunkCallback(chunk);
          }
          
          position = chunkEnd;
        } catch (error) {
          console.error('Error streaming audio chunk:', error);
          if (this.onErrorCallback) {
            this.onErrorCallback(error instanceof Error ? error : new Error(String(error)));
          }
          break;
        }
      }
      
      this.cleanup();
      
      const result = {
        audioData,
        durationMs: Math.round(performance.now() - startTime),
        text: options.text,
        locale: options.locale,
        stop: () => this.stop(),
        promise: Promise.resolve()
      };
      
      return result;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error : new Error(String(error));
      console.error('Error in TTS synthesis:', errorMessage);
      
      if (this.onErrorCallback) {
        this.onErrorCallback(errorMessage);
      }
      
      this.cleanup();
      throw errorMessage;
    }
  }

  // Event listeners
  onChunk(callback: ((chunk: Uint8Array) => void) | null): void {
    this.onChunkCallback = callback;
  }

  onEnd(callback: (() => void) | null): void {
    this.onEndCallback = callback;
  }

  onError(callback: ((error: Error) => void) | null): void {
    this.onErrorCallback = callback;
  }

  isSpeakingNow(): boolean {
    return this.isSpeaking;
  }
}

// Singleton instance
export const speaker = new Speaker();

// For testing
export const __testing__ = {
  CHUNK_SIZE_BYTES,
  setRewriter
};
