/**
 * Sanitizes text for TTS by removing illegal SSML characters and normalizing whitespace.
 * Preserves placeholders like {name} and {0}.
 */
export function sanitizeForTTS(text: string): string {
  if (!text) return '';
  
  // Preserve placeholders by temporarily replacing them
  const placeholderMap = new Map<string, string>();
  let placeholderIndex = 0;
  
  // Match all {placeholders} and {0} style placeholders
  const placeholderRegex = /\{[^{}]*\}/g;
  const textWithPlaceholders = text.replace(placeholderRegex, (match) => {
    const placeholder = `__PLACEHOLDER_${placeholderIndex++}__`;
    placeholderMap.set(placeholder, match);
    return placeholder;
  });
  
  // Remove SSML tags and special characters
  let sanitized = textWithPlaceholders
    .replace(/<[^>]*>/g, '') // Remove HTML/SSML tags
    .replace(/[\x00-\x1F\x7F-\x9F\u200B-\u200D\u2028-\u202F\u205F\u2060\u3000\uFEFF]/g, '') // Remove control chars and non-printables
    .replace(/[\u2018\u2019]/g, "'") // Replace smart quotes with straight quotes
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-') // Replace en/em dashes with hyphens
    .replace(/[\u2026]/g, '...') // Replace ellipsis
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]+/g, ' ') // Normalize whitespace
    .trim()
    .replace(/\s+/g, ' '); // Collapse multiple spaces
  
  // Restore placeholders
  placeholderMap.forEach((value, key) => {
    sanitized = sanitized.replace(key, value);
  });
  
  return sanitized;
}
