import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

function tsFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? tsFiles(full) : e.name.endsWith('.ts') ? [full] : [];
  });
}

const functionsDir = path.join(__dirname, '../../src/functions');
const applicationDir = path.join(__dirname, '../../src/application');
const rel = (f: string) => path.relative(functionsDir, f).split(path.sep).join('/');
const read = (f: string) => fs.readFileSync(f, 'utf8');

// internalServerError.ts is the shared helper every handler's catch returns through; it logs before its 500.
const KNOWN_500_FILES = [
  '_shared/internalServerError.ts',
  '_shared/mapResultToHttp.ts',
  'order/stripeConnectWebhook/index.ts',
  'order/stripeWebhook/index.ts',
];

describe('silent-failure sweep stays complete', () => {
  it('only the known files under src/functions contain a literal status: 500', () => {
    const files = tsFiles(functionsDir)
      .filter((f) => read(f).includes('status: 500'))
      .map(rel)
      .sort();
    expect(files).toEqual(KNOWN_500_FILES);
  });

  it('every remaining literal status: 500 is preceded within 6 lines by a console.error(', () => {
    const offenders: string[] = [];
    for (const name of KNOWN_500_FILES) {
      const lines = read(path.join(functionsDir, name)).split('\n');
      lines.forEach((line, i) => {
        if (!line.includes('status: 500')) return;
        const window = lines.slice(Math.max(0, i - 6), i);
        if (!window.some((l) => l.includes('console.error('))) offenders.push(`${name}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('every handler that reads await request.json() has a catch block', () => {
    const offenders = tsFiles(functionsDir)
      .filter((f) => {
        const src = read(f);
        return src.includes('await request.json()') && !/\bcatch\b/.test(src);
      })
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("every application file returning code: 'INTERNAL_ERROR' also logs", () => {
    const offenders = tsFiles(applicationDir)
      .filter((f) => {
        const src = read(f);
        return src.includes("code: 'INTERNAL_ERROR'") && !src.includes('logServiceFailure(') && !src.includes('console.error(');
      })
      .map((f) => path.relative(applicationDir, f).split(path.sep).join('/'));
    expect(offenders).toEqual([]);
  });
});
