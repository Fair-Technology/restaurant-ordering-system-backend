import { describe, it, expect } from 'vitest';
import { swaggerSpec } from '../../src/swagger/swaggerSpec';

/**
 * Tags are the frontends' cache tags (RTK Query codegen, `tag: true`): a query provides
 * its tag, a mutation invalidates it. A shared "Default" bucket made unrelated endpoints
 * invalidate each other and forced rs-superadmin to hand-patch invalidation.
 */
type Op = { operationId: string; tags?: string[] };
const operations: Array<{ key: string; op: Op }> = [];
for (const [path, byMethod] of Object.entries(swaggerSpec.paths as Record<string, Record<string, Op>>)) {
  for (const [method, op] of Object.entries(byMethod)) operations.push({ key: `${method.toUpperCase()} ${path}`, op });
}

describe('operation tags', () => {
  it('leaves no operation untagged or in the Default bucket', () => {
    const bad = operations.filter(({ op }) => !op.tags?.length || op.tags.includes('Default')).map((o) => o.key);
    expect(bad).toEqual([]);
  });

  it('puts a shop name-change decision under the tag the shops list provides', () => {
    const tagsOf = (id: string) => operations.find((o) => o.op.operationId === id)?.op.tags;
    expect(tagsOf('getShops')).toEqual(['Shops']);
    expect(tagsOf('approveShopNameChange')).toEqual(['Shops']);
    expect(tagsOf('rejectShopNameChange')).toEqual(['Shops']);
  });
});
