// TODO(design): verify exact hex against artifact tokens.json — https://claude.ai/artifact/Jr1sCk1QACz6JjQ9AfQhpo (not reachable headlessly); these are best-effort from the written spec.
export const INVOICE_TOKENS_V2 = {
  ink: '#1a1a1a', // primary text
  muted: '#6b6b6b', // secondary text, modifiers, seller address line
  hairline: '#e3ddd4', // dividers
  brand: '#c1693c', // terracotta — wordmark square ONLY
  brandSoft: '#f6ede3', // title bar + table header background ONLY
  positive: '#2f7d4f', // green — "Bezahlt" badge ONLY
  darkBar: '#2a2420', // Gesamtbetrag bar background
  onDarkBar: '#ffffff', // text on the dark bar
} as const;

/** '#rrggbb' -> [r, g, b] as 0-1 floats. */
export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
