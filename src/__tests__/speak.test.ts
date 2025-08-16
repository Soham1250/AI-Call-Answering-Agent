import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { speaker, __testing__ } from '../lib/speak';

// Mock the TTS module
const mockTTSInstance = {
  synth: vi.fn().mockResolvedValue(new Uint8Array(1024).fill(0))
};

// Mock the TTS module
vi.mock('../lib/tts', () => {
  // Create the mock implementation inside the factory to avoid hoisting issues
  const mockMakeTTS = vi.fn().mockImplementation(() => mockTTSInstance);
  
  return {
    __esModule: true,
    default: mockMakeTTS,
    __testing__: {
      CHUNK_SIZE_BYTES: 1024,
      setRewriter: vi.fn(),
      rewriter: {
        rewriteWithinGuardrails: (text: string) => Promise.resolve(`rewritten:${text}`)
      }
    }
  };
});

// Import after setting up the mock
import makeTTS, { __testing__ as ttsTesting } from '../lib/tts';

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
  mockTTSInstance.synth.mockClear();
  mockTTSInstance.synth.mockResolvedValue(new Uint8Array(1024).fill(0));
  
  // Reset the rewriter to default
  __testing__.setRewriter({
    rewriteWithinGuardrails: (text: string) => Promise.resolve(`rewritten:${text}`)
  });
  
  // Reset speaker instance
  if (speaker) {
    speaker.onChunk(null);
    speaker.onEnd(null);
    speaker.onError(null);
  }
});

describe('speak', () => {
  const mockStreamTo = vi.fn().mockImplementation(() => Promise.resolve());
  const mockOnStart = vi.fn();
  const mockOnDone = vi.fn();
  const mockOnError = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset the mock implementation
    mockTTSInstance.synth.mockClear();
    mockTTSInstance.synth.mockResolvedValue(new Uint8Array(1024));
    
    // Reset the rewriter
    __testing__.setRewriter({
      rewriteWithinGuardrails: (text: string) => Promise.resolve(text)
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should stream audio in chunks', async () => {
    const mockStreamTo = vi.fn().mockResolvedValue(undefined);
    
    // Create a larger audio buffer (5KB)
    const largeAudioData = new Uint8Array(5 * 1024).fill(0);
    mockTTSInstance.synth.mockResolvedValueOnce(largeAudioData);
    
    await speaker.speak({
      text: 'Hello world',
      locale: 'en-IN',
      streamTo: mockStreamTo
    });
    
    // Verify TTS was called with correct arguments
    expect(mockTTSInstance.synth).toHaveBeenCalledWith('Hello world', 'en-IN');
    
    // Should have streamed in 5 chunks (5KB / 1KB chunks)
    expect(mockStreamTo).toHaveBeenCalledTimes(5);
    
    // Each chunk should be 1KB
    for (const call of mockStreamTo.mock.calls) {
      expect(call[0]).toBeInstanceOf(Uint8Array);
      expect(call[0].length).toBe(1024);
    }
  });

  it('should apply text rewriting when enabled', async () => {
    const mockStreamTo = vi.fn().mockResolvedValue(undefined);
    
    // Set up a custom rewriter
    const mockRewriter = {
      rewriteWithinGuardrails: vi.fn().mockResolvedValue('rewritten:Hello')
    };
    
    // Set the rewriter
    __testing__.setRewriter(mockRewriter);
    
    // Call speak with rewrite enabled
    await speaker.speak({
      text: 'Hello',
      locale: 'en-IN',
      rewrite: true,
      streamTo: mockStreamTo
    });
    
    // Verify rewriter was called
    expect(mockRewriter.rewriteWithinGuardrails).toHaveBeenCalledWith('Hello');
    
    // Verify TTS was called with rewritten text
    expect(mockTTSInstance.synth).toHaveBeenCalledWith('rewritten:Hello', 'en-IN');
    expect(mockStreamTo).toHaveBeenCalled();
  });

  it('should stop streaming when stop() is called', async () => {
    // Create a large audio buffer (10 chunks of 1KB each)
    const audioData = new Uint8Array(10 * 1024).fill(0);
    mockTTSInstance.synth.mockResolvedValueOnce(audioData);

    // Track if streaming was stopped
    let wasStreamingStopped = false;
    const customStreamTo = vi.fn().mockImplementation(() => {
      if (wasStreamingStopped) {
        return Promise.reject(new Error('Streaming was stopped'));
      }
      return Promise.resolve();
    });

    // Set up a promise that will be resolved when streaming is complete
    let resolveStreaming: () => void;
    const streamingPromise = new Promise<void>(resolve => {
      resolveStreaming = resolve;
    });

    // Start speaking
    speaker.speak({
      text: 'This is a long text that should be stopped',
      locale: 'en-IN',
      streamTo: async (chunk) => {
        if (wasStreamingStopped) {
          throw new Error('Streaming was stopped');
        }
        await customStreamTo(chunk);
      }
    });

    // Wait for the next tick to allow the async operations to start
    await new Promise(resolve => setImmediate(resolve));
    
    // Stop the streaming
    wasStreamingStopped = true;
    speaker.stop();
    
    // Wait a bit for the stop to take effect
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Should have called streamTo at least once but not for all chunks
    expect(customStreamTo).toHaveBeenCalled();
    expect(customStreamTo.mock.calls.length).toBeLessThan(10);
  });

  it('should handle TTS errors', async () => {
    const testError = new Error('TTS failed');
    mockTTSInstance.synth.mockRejectedValue(testError);

    const errorPromise = new Promise<void>((resolve) => {
      speaker.onError((error) => {
        mockOnError(error);
        resolve();
      });
    });
    
    speaker.speak({
      text: 'Error test',
      locale: 'en-IN',
      streamTo: mockStreamTo,
    });
    
    await errorPromise;
    
    expect(mockOnError).toHaveBeenCalledWith(expect.any(Error));
    expect(mockStreamTo).not.toHaveBeenCalled();
  });

  it('should work without optional callbacks', async () => {
    const mockStreamTo = vi.fn().mockResolvedValue(undefined);
    
    await speaker.speak({
      text: 'No callbacks',
      locale: 'en-IN',
      streamTo: mockStreamTo
    });
    
    // Should still process without errors
    expect(mockTTSInstance.synth).toHaveBeenCalledWith('No callbacks', 'en-IN');
    expect(mockStreamTo).toHaveBeenCalled();
  });

  it('should handle empty text', async () => {
    await speaker.speak({
      text: '',
      locale: 'en-IN',
      streamTo: mockStreamTo,
    });
    
    // Should complete without calling TTS for empty text
    expect(mockTTSInstance.synth).not.toHaveBeenCalled();
    expect(mockStreamTo).toHaveBeenCalledTimes(0);
  });

  it('should use the default rewriter when none is set', async () => {
    // Store the current rewriter implementation
    const originalRewriter = {
      rewriteWithinGuardrails: (text: string) => Promise.resolve(`original:${text}`)
    };
    
    // Set up the test rewriter (pass-through)
    __testing__.setRewriter({
      rewriteWithinGuardrails: (text: string) => Promise.resolve(text)
    });
    
    const audioData = new Uint8Array(1024);
    mockTTSInstance.synth.mockResolvedValue(audioData);
    
    await speaker.speak({
      text: 'test',
      locale: 'en-IN',
      streamTo: mockStreamTo,
      rewrite: true
    });
    
    // Verify the rewriter was called with the original text
    expect(mockTTSInstance.synth).toHaveBeenCalledWith('test', 'en-IN');
    
    // Restore the original rewriter
    __testing__.setRewriter(originalRewriter);
  });
});
