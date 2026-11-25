import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const srcDir = __dirname;
const functionsDir = path.join(srcDir, 'functions');

function findFunctionIndexes(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...findFunctionIndexes(full));
    } else if (entry.name === 'index.ts') {
      found.push(full);
    }
  }
  return found;
}

describe('src/index.ts function registration', () => {
  it('imports every src/functions/**/index.ts', () => {
    const indexSource = fs.readFileSync(path.join(srcDir, 'index.ts'), 'utf8');
    const imported = new Set(
      [...indexSource.matchAll(/^\s*import\s+['"]([^'"]+)['"];?/gm)].map((m) => m[1]),
    );

    const missing = findFunctionIndexes(functionsDir)
      .map((file) => './' + path.relative(srcDir, file).split(path.sep).join('/').replace(/\.ts$/, ''))
      .filter((rel) => !imported.has(rel))
      .sort();

    expect(
      missing,
      `Function(s) not registered in src/index.ts — add:\n${missing.map((m) => `import '${m}';`).join('\n')}`,
    ).toEqual([]);
  });
});
