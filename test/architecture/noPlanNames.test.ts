import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

function tsFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? tsFiles(full) : e.name.endsWith('.ts') ? [full] : [];
  });
}

describe('plans are data', () => {
  it("src never decides anything by a plan's name", () => {
    const banned = /findPlanByInternalKey|internalKey\s*[!=]==\s*['"](?!string['"])|===\s*['"](free|pro|max|basic)['"]/;
    const offenders = tsFiles(path.join(__dirname, '../../src')).filter((f) => banned.test(fs.readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
