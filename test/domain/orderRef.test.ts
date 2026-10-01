import { describe, it, expect } from 'vitest';
import { generateOrderRef } from '../../src/domain/order/orderRef';

describe('generateOrderRef', () => {
  it('uses the injected random index', () => {
    expect(generateOrderRef(() => 0)).toBe('AAA-AAA');
  });

  it('matches the expected shape by default', () => {
    expect(generateOrderRef()).toMatch(/^[A-NP-Z1-9]{3}-[A-NP-Z1-9]{3}$/);
  });
});
