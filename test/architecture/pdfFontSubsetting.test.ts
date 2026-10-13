import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('invoice PDF fonts', () => {
  // pdf-lib's own `subset: true` makes PDFs that macOS Preview and iOS Mail draw with missing letters,
  // while text extraction still passes. Found 2026-10-13.
  it("invoice fonts are cut down with HarfBuzz, never with pdf-lib's own subsetting", () => {
    const src = fs.readFileSync(path.join(__dirname, '../../src/infrastructure/pdf/invoicePdf.ts'), 'utf8');
    expect(src).not.toMatch(/subset:\s*true/);
    expect(src).toMatch(/subset:\s*false/);
    expect(src).toMatch(/subsetFont\(/);
  });
});
