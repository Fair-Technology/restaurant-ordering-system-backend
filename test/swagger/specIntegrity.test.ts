import { describe, it, expect } from 'vitest';
import { swaggerSpec } from '../../src/swagger/swaggerSpec';

/**
 * Guards on the generated spec itself. Every check here corresponds to a defect that
 * actually shipped once:
 *   - a name processed twice was published as `OrderDto_2` with no `OrderDto` at all,
 *     which broke every consumer of that type;
 *   - an earlier revision emitted $refs pointing at schemas it never wrote;
 *   - path templates without a matching parameter declaration.
 */
const schemas = swaggerSpec.components.schemas as Record<string, unknown>;
const names = Object.keys(schemas);

describe('generated spec integrity', () => {
  it('publishes no duplicate-suffixed schema whose base name is missing', () => {
    const orphans = names.filter((n) => /_\d+$/.test(n) && !names.includes(n.replace(/_\d+$/, '')));
    expect(orphans).toEqual([]);
  });

  it('has no dangling $refs', () => {
    const refs = new Set<string>();
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (!node || typeof node !== 'object') return;
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (k === '$ref' && typeof v === 'string') refs.add(v);
        else walk(v);
      }
    };
    walk(swaggerSpec);

    const missing = [...refs].filter((ref) => {
      const m = ref.match(/^#\/components\/(schemas|responses|securitySchemes)\/(.+)$/);
      if (!m) return true; // a ref outside the components we know about
      const bucket = (swaggerSpec.components as Record<string, Record<string, unknown>>)[m[1]] ?? {};
      return !bucket[m[2]];
    });
    expect(missing).toEqual([]);
  });

  it('declares every path parameter its templates use', () => {
    const missing: string[] = [];
    for (const [path, ops] of Object.entries(swaggerSpec.paths as Record<string, Record<string, any>>)) {
      const needed = [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
      for (const [method, op] of Object.entries(ops)) {
        const declared = new Set(
          ((op.parameters ?? []) as Array<{ in: string; name: string }>)
            .filter((p) => p.in === 'path')
            .map((p) => p.name),
        );
        for (const param of needed) {
          if (!declared.has(param)) missing.push(`${method.toUpperCase()} ${path} -> ${param}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('excludes the two routes that only serve the spec itself', () => {
    expect(swaggerSpec.paths['/swagger']).toBeUndefined();
    expect(swaggerSpec.paths['/swagger.json']).toBeUndefined();
  });

  it('emits no OpenAPI 3.0 illegal null forms', () => {
    const offenders: string[] = [];
    const walk = (node: unknown, trail: string): void => {
      if (Array.isArray(node)) {
        node.forEach((n, i) => walk(n, `${trail}[${i}]`));
        return;
      }
      if (!node || typeof node !== 'object') return;
      const obj = node as Record<string, unknown>;
      if (obj.type === 'null') offenders.push(`${trail}: type null`);
      if (Array.isArray(obj.type) && obj.type.includes('null')) offenders.push(`${trail}: null in a type union`);
      if (Array.isArray(obj.enum) && obj.enum.includes(null)) offenders.push(`${trail}: null in an enum`);
      for (const [k, v] of Object.entries(obj)) walk(v, `${trail}/${k}`);
    };
    walk(swaggerSpec, '');
    expect(offenders).toEqual([]);
  });
});
