import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { AUDIT_ACTION_AREAS, AUDIT_AREAS, actionsForArea, auditAreaForAction } from '../../src/domain/audit/auditAreas';

const SRC = path.resolve(__dirname, '../../src/application');

function tsFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return tsFiles(p);
    return p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : [];
  });
}

const STR = `(?:'([^'\\n]+)'|"([^"\\n]+)")`;
// `action: 'a'` or `action: cond ? 'a' : 'b'` (both branches captured). `auditAction:` is the same thing
// passed to the shared category-order core by its dish/combo wrappers.
const ACTION_RE = new RegExp(`\\b(?:auditA|a)ction:\\s*(?:[^,'"\\n}?]+\\?\\s*${STR}\\s*:\\s*${STR}|${STR})`, 'g');

function usedActions(): Set<string> {
  const used = new Set<string>();
  for (const file of tsFiles(SRC)) {
    for (const m of fs.readFileSync(file, 'utf8').matchAll(ACTION_RE)) {
      for (const v of m.slice(1)) if (v) used.add(v);
    }
  }
  return used;
}

describe('audit areas', () => {
  const used = usedActions();

  it('finds the actions in use (guards the scanner itself)', () => {
    expect(used.size).toBeGreaterThan(40);
    expect(used.has('optionGroup.option.enable')).toBe(true);
    expect(used.has('optionGroup.option.disable')).toBe(true);
  });

  it('maps every action the backend writes to an area', () => {
    const missing = [...used].filter((a) => !(a in AUDIT_ACTION_AREAS));
    expect(missing, `Unmapped audit action(s): ${missing.join(', ')} - add to src/domain/audit/auditAreas.ts`).toEqual([]);
  });

  it('maps every key to exactly one known area', () => {
    for (const [action, area] of Object.entries(AUDIT_ACTION_AREAS)) {
      expect(AUDIT_AREAS.includes(area), action).toBe(true);
      expect(auditAreaForAction(action)).toBe(area);
    }
  });

  it('has no stale keys', () => {
    const stale = Object.keys(AUDIT_ACTION_AREAS).filter((a) => !used.has(a));
    expect(stale, `Stale audit action(s) in the map: ${stale.join(', ')}`).toEqual([]);
  });

  it('actionsForArea partitions the map', () => {
    const all = AUDIT_AREAS.flatMap((a) => actionsForArea(a));
    expect(all.sort()).toEqual(Object.keys(AUDIT_ACTION_AREAS).sort());
    expect(actionsForArea('discounts')).toEqual(['promotion.code_create', 'promotion.code_update', 'promotion.loyalty_update']);
  });
});
