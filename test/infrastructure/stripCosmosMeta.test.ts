import { describe, it, expect } from 'vitest';
import { stripCosmosMeta, stripCosmosMetaAll } from '../../src/infrastructure/cosmos/stripCosmosMeta';

const META = { _rid: 'r', _self: 's', _etag: 'e', _attachments: 'a/', _ts: 1700000000 };

describe('stripCosmosMeta', () => {
  it('removes all five Cosmos keys', () => {
    const out = stripCosmosMeta({ id: '1', ...META });
    for (const k of Object.keys(META)) expect(out).not.toHaveProperty(k);
  });

  it('leaves other keys (including nested and underscore-prefixed custom ones) untouched', () => {
    const out = stripCosmosMeta({ id: '1', name: 'x', nested: { _ts: 5 }, _custom: true, ...META });
    expect(out).toEqual({ id: '1', name: 'x', nested: { _ts: 5 }, _custom: true });
  });

  it('does not mutate the input', () => {
    const input = { id: '1', ...META };
    const out = stripCosmosMeta(input);
    expect(out).not.toBe(input);
    expect(input).toEqual({ id: '1', ...META });
  });
});

describe('stripCosmosMetaAll', () => {
  it('strips every element of an array', () => {
    const out = stripCosmosMetaAll([{ id: '1', ...META }, { id: '2', ...META }]);
    expect(out).toEqual([{ id: '1' }, { id: '2' }]);
  });

  it('accepts an empty array', () => {
    expect(stripCosmosMetaAll([])).toEqual([]);
  });
});
