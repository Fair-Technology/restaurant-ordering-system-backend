import { describe, it, expect } from 'vitest';
import { swaggerSpec } from '../../src/swagger/swaggerSpec';

// OpenAPI 3.0 ignores siblings of $ref, so { $ref, nullable: true } declares a
// non-nullable field. A nullable reference must be { nullable: true, allOf: [{ $ref }] }.
describe('swagger nullable references', () => {
  it('no object carries both $ref and nullable', () => {
    const bad: string[] = [];
    const walk = (node: any, path: string) => {
      if (!node || typeof node !== 'object') return;
      if (typeof node.$ref === 'string' && 'nullable' in node) bad.push(path);
      for (const [k, v] of Object.entries(node)) walk(v, `${path}/${k}`);
    };
    walk(swaggerSpec, '');
    expect(bad).toEqual([]);
  });

  it('Product.spiceLevel is a nullable reference', () => {
    const p = (swaggerSpec as any).components.schemas.Product.properties.spiceLevel;
    expect(p.nullable).toBe(true);
    expect(p.allOf).toEqual([{ $ref: '#/components/schemas/SpiceLevel' }]);
  });
});
