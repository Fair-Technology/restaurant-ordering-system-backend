export interface Coverage {
  covers(codePoint: number): boolean;
}

export interface TextRun<F extends Coverage> {
  face: F;
  text: string;
}

export const MISSING_GLYPH = '?';

/** NFC; every whitespace except U+00A0 becomes ' '; control characters become '?'. Idempotent. */
export function cleanText(text: string): string {
  let out = '';
  for (const ch of text.normalize('NFC')) {
    const cp = ch.codePointAt(0) as number;
    if (/\s/.test(ch) && cp !== 0xa0) out += ' ';
    else if (cp < 0x20 || (cp >= 0x7f && cp <= 0x9f)) out += MISSING_GLYPH;
    else out += ch;
  }
  return out;
}

/** Each character goes to the first face in `chain` that has it; none has it -> '?' in the first face. */
export function splitIntoRuns<F extends Coverage>(text: string, chain: readonly F[]): TextRun<F>[] {
  const runs: TextRun<F>[] = [];
  for (const ch of cleanText(text)) {
    const cp = ch.codePointAt(0) as number;
    const face = chain.find((f) => f.covers(cp));
    const target = face ?? chain[0];
    const out = face ? ch : MISSING_GLYPH;
    const last = runs[runs.length - 1];
    if (last && last.face === target) last.text += out;
    else runs.push({ face: target, text: out });
  }
  return runs;
}

/** Greedy word wrap on ' '; a word wider than maxWidth is broken between code points. */
export function wrapText(text: string, maxWidth: number, widthOf: (s: string) => number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(' ')) {
    const candidate = current === '' ? word : `${current} ${word}`;
    if (widthOf(candidate) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current !== '') {
      lines.push(current);
      current = '';
    }
    if (widthOf(word) <= maxWidth) {
      current = word;
      continue;
    }
    for (const ch of word) {
      if (current !== '' && widthOf(current + ch) > maxWidth) {
        lines.push(current);
        current = ch;
      } else current += ch;
    }
  }
  lines.push(current);
  return lines;
}
