// Mock classes for TTS testing
export class MockAzureTTS {
    async synth(text: string, locale: string): Promise<Uint8Array> {
        return new Uint8Array([1, 2, 3]);
    }
}
