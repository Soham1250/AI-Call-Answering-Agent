import { makeTTS } from './tts';
import type { Locale } from './tts';

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

export interface SpeakResult {
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

export function speak(options: SpeakOptions): SpeakResult {
  const startTime = performance.now();
  let ttsStartTime = 0;
  let isStopped = false;
  let resolveStopped: () => void;
  const stopPromise = new Promise<void>((resolve) => {
    resolveStopped = resolve;
  });

  const stop = () => {
    if (isStopped) return;
    isStopped = true;
    resolveStopped();
  };

  const processText = async (): Promise<void> => {
    try {
      let finalText = options.text;
      
      // Apply text rewriting if enabled and rewriter is available
      if (options.rewrite && rewriter) {
        finalText = await rewriter.rewriteWithinGuardrails(finalText);
      }

      // Get TTS instance
      const tts = makeTTS();
      
      // Start TTS synthesis
      ttsStartTime = performance.now();
      const audioData = await tts.synth(finalText, options.locale);
      const ttsEndTime = performance.now();
      
      // Stream audio in chunks
      const streamStartTime = performance.now();
      await streamAudio(audioData, options.streamTo, stopPromise);
      const streamEndTime = performance.now();
      
      if (!isStopped) {
        const endTime = performance.now();
        options.onDone?.({
          ttsMs: ttsEndTime - ttsStartTime,
          streamMs: streamEndTime - streamStartTime,
          totalMs: endTime - startTime
        });
      }
    } catch (error) {
      if (!isStopped) {
        options.onError?.(error instanceof Error ? error : new Error(String(error)));
      }
    } finally {
      stop();
    }
  };

  // Start processing
  options.onStart?.();
  const promise = processText();

  return {
    stop,
    promise
  };
}

async function streamAudio(
  audioData: Uint8Array,
  onChunk: (chunk: Uint8Array) => Promise<void>,
  stopPromise: Promise<void>
): Promise<void> {
  // Create a promise that resolves when the stream should stop
  const stopRace = new Promise<boolean>((resolve) => {
    stopPromise.then(() => resolve(true));
  });

  let position = 0;
  const totalLength = audioData.length;

  while (position < totalLength) {
    const chunkEnd = Math.min(position + CHUNK_SIZE_BYTES, totalLength);
    const chunk = audioData.slice(position, chunkEnd);
    
    // Check if we should stop
    const shouldStop = await Promise.race([
      stopRace,
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 10))
    ]);
    
    if (shouldStop) {
      break;
    }
    
    await onChunk(chunk);
    position = chunkEnd;
  }
}

// For testing
export const __testing__ = {
  CHUNK_SIZE_BYTES,
  setRewriter
};
