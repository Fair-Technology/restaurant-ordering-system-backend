export const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
export const MIN_ACCENT_CONTRAST_ON_WHITE = 3;

function lin(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function lum(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

export function contrastRatio(hexA: string, hexB: string): number {
  const x = lum(hexA);
  const y = lum(hexB);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export function validateAccentColor(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !HEX_COLOR_PATTERN.test(value)) {
    return 'branding.accentColor must be a hex colour like "#C2410C"';
  }
  const ratio = contrastRatio(value, '#FFFFFF');
  return ratio < MIN_ACCENT_CONTRAST_ON_WHITE
    ? `branding.accentColor is too light to read on white (contrast ${ratio.toFixed(2)}:1, needs at least 3:1)`
    : null;
}
