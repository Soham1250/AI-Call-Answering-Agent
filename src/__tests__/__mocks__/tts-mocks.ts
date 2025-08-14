// Mock classes for TTS testing
export class MockAzureTTS {
    async synth(text: string, locale: string): Promise<Uint8Array> {
        return new Uint8Array([1, 2, 3]);
    }
}

export class MockCoquiLocalTTS {
    async synth(text: string, locale: string): Promise<Uint8Array> {
        return new Uint8Array([4, 5, 6]);
    }
}

export class MockHttpCoquiTTS {
    async synth(text: string, locale: string): Promise<Uint8Array> {
        return new Uint8Array([7, 8, 9]);
    }
}
