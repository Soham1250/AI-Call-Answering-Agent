import axios from 'axios';
import { env } from 'node:process';
import { sanitizeForTTS } from './ssml';
import { getCacheKey } from './hash';
import { LRUCache } from 'lru-cache';

// Cache configuration
const TTS_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const TTS_CACHE_MAX_ITEMS = 100;

// Global cache instance
const ttsCache = new LRUCache<string, Uint8Array>({
  max: TTS_CACHE_MAX_ITEMS,
  ttl: TTS_CACHE_TTL_MS,
  updateAgeOnGet: true,
});

// Log cache hits/misses
function logCacheStatus(cacheKey: string, hit: boolean) {
  if (env.NODE_ENV !== 'test') {
    console.log(`[TTS] Cache ${hit ? 'hit' : 'miss'} for key: ${cacheKey}`);
  }
}

export type Locale = 'en-IN' | 'hi-IN' | 'mr-IN';

export interface TTSEngine {
  synth(text: string, locale: Locale): Promise<Uint8Array>;
}

const VOICE_MAP: Record<Locale, string> = {
  'en-IN': 'en-IN-SwaraNeural',
  'hi-IN': 'hi-IN-SwaraNeural',
  'mr-IN': 'mr-IN-AarohiNeural',
} as const;

class HttpCoquiTTS implements TTSEngine {
  private readonly endpoint: string;

  constructor() {
    const baseUrl = env.TTS_HTTP_URL;
    if (!baseUrl) {
      throw new Error('TTS_HTTP_URL is required for HTTP Coqui TTS');
    }
    this.endpoint = `${baseUrl.replace(/\/$/, '')}/synth`;
  }

  async synth(text: string, locale: Locale): Promise<Uint8Array> {
    const sanitizedText = sanitizeForTTS(text);
    const cacheKey = getCacheKey(sanitizedText, locale);

    // Check cache first
    const cached = ttsCache.get(cacheKey);
    if (cached) {
      logCacheStatus(cacheKey, true);
      return cached;
    }

    logCacheStatus(cacheKey, false);

    try {
      const response = await axios.post(
        this.endpoint,
        { text: sanitizedText, locale },
        {
          responseType: 'arraybuffer',
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000, // 10 seconds timeout
        }
      );

      if (!(response.data instanceof ArrayBuffer)) {
        throw new Error('Invalid response format from TTS service');
      }

      const audioData = new Uint8Array(response.data);

      // Cache the result
      ttsCache.set(cacheKey, audioData);

      return audioData;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('TTS HTTP Error:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data?.toString('utf8'),
        });
      }
      throw new Error(`TTS synthesis failed: ${error}`);
    }
  }
}

class AzureTTS implements TTSEngine {
  private readonly endpoint: string;
  private readonly key: string;
  private readonly region: string;

  constructor() {
    const key = env.TTS_KEY;
    const region = env.AZURE_REGION;

    if (!key) throw new Error('TTS_KEY is required in environment variables');
    if (!region) throw new Error('AZURE_REGION is required in environment variables');

    this.key = key;
    this.region = region;
    this.endpoint = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  }

  private buildSsml(text: string, locale: Locale): string {
    const voiceName = VOICE_MAP[locale];
    return `
      <speak version="1.0" xml:lang="${locale}" xmlns="http://www.w3.org/2001/10/synthesis"
             xmlns:mstts="http://www.w3.org/2001/mstts">
        <voice name="${voiceName}">
          ${this.escapeXml(text)}
        </voice>
      </speak>
      `.trim();
  }

  private escapeXml(unsafe: string): string {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  async synth(text: string, locale: Locale): Promise<Uint8Array> {
    const ssml = this.buildSsml(text, locale);

    try {
      const response = await axios({
        method: 'post',
        url: this.endpoint,
        headers: {
          'Ocp-Apim-Subscription-Key': this.key,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'raw-16khz-16bit-mono-pcm',
          'User-Agent': 'ai-call-agent',
        },
        data: ssml,
        responseType: 'arraybuffer',
      });

      return new Uint8Array(response.data);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('Azure TTS API error:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
        });
      }
      throw new Error(`TTS synthesis failed: ${error}`);
    }
  }
}

class CoquiLocalTTS implements TTSEngine {
  async synth(_text: string, _locale: Locale): Promise<Uint8Array> {
    throw new Error('CoquiLocalTTS is not implemented yet');
  }
}

export function makeTTS(): TTSEngine {
  const provider = env.TTS_PROVIDER?.toLowerCase() || 'azure';

  switch (provider) {
    case 'azure':
      return new AzureTTS();
    case 'coqui':
      return new CoquiLocalTTS();
    case 'coqui_http':
      return new HttpCoquiTTS();
    default:
      throw new Error(`Unsupported TTS provider: ${provider}`);
  }
}

// Export the factory function as default
export default makeTTS;

// Export classes and constants for testing
export const __testing__ = {
  AzureTTS,
  CoquiLocalTTS,
  HttpCoquiTTS,
  CHUNK_SIZE_BYTES: 1024 * 10, // 10KB chunks
};
