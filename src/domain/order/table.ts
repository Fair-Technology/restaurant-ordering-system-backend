export const TABLE_LABEL_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} -]{0,9}$/u;

/** The tidied table number, or null when it is not 1–10 letters, digits, spaces or dashes starting with a letter or digit. */
export function normaliseTableLabel(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  return TABLE_LABEL_PATTERN.test(t) ? t : null;
}
