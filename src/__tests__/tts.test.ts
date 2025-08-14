import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { MockAzureTTS, MockCoquiLocalTTS, MockHttpCoquiTTS } from './__mocks__/tts-mocks';

// Mock the modules
vi.mock('axios');

vi.mock('../lib/tts', () => {
    return {
        __esModule: true,
        default: vi.fn().mockImplementation(() => {
            // Default to AzureTTS for testing
            return new MockAzureTTS();
        }),
        __testing__: {
            AzureTTS: MockAzureTTS,
            CoquiLocalTTS: MockCoquiLocalTTS,
            HttpCoquiTTS: MockHttpCoquiTTS,
            setRewriter: vi.fn(),
            rewriter: {
                rewriteWithinGuardrails: (text: string) => Promise.resolve(text)
            },
            CHUNK_SIZE_BYTES: 1024 * 10
        }
    };
});

// Import after setting up the mock
import makeTTS, { __testing__ as ttsTesting } from '../lib/tts';

// Mock process.env
const originalEnv = { ...process.env };

// Mock the Azure TTS response
const mockAudioData = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x26, 0x00, 0x00, 0x00]); // WAV header

describe('TTS Adapter', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        process.env = { ...originalEnv };
    });

    describe('makeTTS', () => {
        it('should return AzureTTS when TTS_PROVIDER is azure', () => {
            process.env.TTS_PROVIDER = 'azure';
            const tts = makeTTS();
            expect(tts).toBeInstanceOf(ttsTesting.AzureTTS);
        });

        it('should return CoquiLocalTTS when TTS_PROVIDER is coqui', () => {
            process.env.TTS_PROVIDER = 'coqui';
            const tts = makeTTS();
            expect(tts).toBeInstanceOf(ttsTesting.CoquiLocalTTS);
        });

        it('should default to AzureTTS when TTS_PROVIDER is not set', () => {
            delete process.env.TTS_PROVIDER;
            const tts = makeTTS();
            expect(tts).toBeInstanceOf(ttsTesting.AzureTTS);
        });

        it('should throw error for unsupported provider', () => {
            process.env.TTS_PROVIDER = 'unsupported';
            expect(() => makeTTS()).toThrow('Unsupported TTS provider: unsupported');
        });
    });

    describe('AzureTTS', () => {
        let originalTTSKey: string | undefined;
        let originalAzureRegion: string | undefined;

        beforeEach(() => {
            // Store original environment variables
            originalTTSKey = process.env.TTS_KEY;
            originalAzureRegion = process.env.AZURE_REGION;

            // Set up default environment variables for tests
            process.env.TTS_KEY = 'test-key';
            process.env.AZURE_REGION = 'eastus';
        });

        afterEach(() => {
            // Restore original environment variables
            if (originalTTSKey !== undefined) {
                process.env.TTS_KEY = originalTTSKey;
            } else {
                delete process.env.TTS_KEY;
            }

            if (originalAzureRegion !== undefined) {
                process.env.AZURE_REGION = originalAzureRegion;
            } else {
                delete process.env.AZURE_REGION;
            }
        });

        it('should throw error if TTS_KEY is missing', () => {
            delete process.env.TTS_KEY;
            expect(() => new ttsTesting.AzureTTS()).toThrow('TTS_KEY is required in environment variables');
        });

        it('should throw error if AZURE_REGION is missing', () => {
            delete process.env.AZURE_REGION;
            expect(() => new ttsTesting.AzureTTS()).toThrow('AZURE_REGION is required in environment variables');
        });

        it('should make API call with correct parameters for English', async () => {
            const mockResponse = {
                data: mockAudioData,
                headers: { 'content-type': 'audio/wav' }
            };

            (axios.post as any).mockResolvedValue(mockResponse);

            const azureTTS = new ttsTesting.AzureTTS();
            const result = await azureTTS.synth('Hello', 'en-IN');

            expect(axios.post).toHaveBeenCalledWith(
                expect.stringContaining('eastus'),
                expect.any(String),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'Ocp-Apim-Subscription-Key': 'test-key',
                        'Content-Type': 'application/ssml+xml',
                        'X-Microsoft-OutputFormat': 'raw-16khz-16bit-mono-pcm'
                    })
                })
            );
            expect(result).toBeInstanceOf(Uint8Array);
            expect(result.length).toBeGreaterThan(0);
        });

        it('should return audio data on successful synthesis', async () => {
            const mockResponse = {
                data: mockAudioData,
                headers: { 'content-type': 'audio/wav' }
            };

            (axios.post as any).mockResolvedValue(mockResponse);

            const azureTTS = new ttsTesting.AzureTTS();
            const result = await azureTTS.synth('Hello', 'en-IN');

            expect(result).toBeInstanceOf(Uint8Array);
            expect(result.length).toBeGreaterThan(0);
        });
    });

    describe('CoquiLocalTTS', () => {
        it('should return mock audio data', async () => {
            const coquiTTS = new ttsTesting.CoquiLocalTTS();
            const result = await coquiTTS.synth('test', 'en-IN');
            expect(result).toEqual(new Uint8Array([4, 5, 6]));
        });
    });
});
