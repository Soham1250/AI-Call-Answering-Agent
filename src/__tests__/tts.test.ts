import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import makeTTS, { __testing__ } from '../lib/tts';

// Mock axios (default function)
vi.mock('axios', () => {
  return {
    __esModule: true,
    default: vi.fn(),
  };
});
const mockAxios = axios as unknown as any;

describe('TTS Adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set up environment variables
    process.env.TTS_KEY = 'test-key';
    process.env.AZURE_REGION = 'eastus';
  });

  describe('makeTTS', () => {
    it('should return AzureTTS when TTS_PROVIDER is azure', () => {
      process.env.TTS_PROVIDER = 'azure';
      const tts = makeTTS();
      expect(tts).toBeDefined();
      expect(tts.synth).toBeInstanceOf(Function);
    });

    it('should default to AzureTTS when TTS_PROVIDER is not set', () => {
      delete process.env.TTS_PROVIDER;
      const tts = makeTTS();
      expect(tts).toBeDefined();
      expect(tts.synth).toBeInstanceOf(Function);
    });
  });

  describe('AzureTTS', () => {
    let azureTTS: any;

    beforeEach(() => {
      azureTTS = new __testing__.AzureTTS();
      (mockAxios as any).mockResolvedValue({ data: new ArrayBuffer(3) });
    });

    it('should throw error if TTS_KEY is missing', () => {
      const originalKey = process.env.TTS_KEY;
      delete process.env.TTS_KEY;
      expect(() => new __testing__.AzureTTS()).toThrow('TTS_KEY is required in environment variables');
      process.env.TTS_KEY = originalKey;
    });

    it('should throw error if AZURE_REGION is missing', () => {
      const originalRegion = process.env.AZURE_REGION;
      delete process.env.AZURE_REGION;
      expect(() => new __testing__.AzureTTS()).toThrow('AZURE_REGION is required in environment variables');
      process.env.AZURE_REGION = originalRegion;
    });

    it('should make API call with correct parameters', async () => {
      await azureTTS.synth('Hello', 'en-IN');

      expect(mockAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('eastus'),
          headers: expect.objectContaining({
            'Ocp-Apim-Subscription-Key': 'test-key',
            'Content-Type': 'application/ssml+xml',
            'X-Microsoft-OutputFormat': 'raw-16khz-16bit-mono-pcm'
          }),
          method: 'post',
          responseType: 'arraybuffer',
        })
      );
    });
  });

  // Only AzureTTS is supported now
});
