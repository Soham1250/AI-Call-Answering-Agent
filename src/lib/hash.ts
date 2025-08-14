import { createHash } from 'crypto';

/**
 * Generates a SHA-1 hash of the input string
 */
export function sha1(input: string): string {
  return createHash('sha1').update(input).digest('hex');
}

/**
 * Generates a cache key for TTS requests
 */
export function getCacheKey(text: string, locale: string): string {
  return `${locale}:${sha1(text)}`;
}
