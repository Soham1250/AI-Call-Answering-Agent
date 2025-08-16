/**
 * Creates a WAV file buffer with the specified duration of silence
 * @param durationMs Duration of silence in milliseconds (default: 250ms)
 * @returns Uint8Array containing WAV file data
 */
export function createSilenceWav(durationMs = 250): Uint8Array {
  // WAV header constants for 16kHz, 16-bit mono PCM
  const sampleRate = 16000;
  const bitsPerSample = 16;
  const numChannels = 1; // mono
  
  // Calculate audio data size
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = Math.floor((durationMs / 1000) * byteRate);
  const fileSize = 36 + dataSize;

  // Create buffer for WAV file (44 bytes header + data)
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  
  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, fileSize - 8, true);
  writeString(view, 8, 'WAVE');
  
  // fmt subchunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true);  // AudioFormat (1 = PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  
  // data subchunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  
  // The rest of the buffer is already initialized to 0 (silence)
  return new Uint8Array(buffer);
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
