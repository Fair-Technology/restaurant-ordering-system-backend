import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/infrastructure/auth/passwordHashing';

describe('passwordHashing', () => {
  it('hash format', async () => {
    const hash = await hashPassword('correct horse');
    expect(hash.startsWith('scrypt$16384$8$1$')).toBe(true);
    expect(hash.split('$')).toHaveLength(6);
  });

  it('verifies the right password', async () => {
    const hash = await hashPassword('correct horse');
    expect(await verifyPassword('correct horse', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correct horse');
    expect(await verifyPassword('wrong horse', hash)).toBe(false);
  });

  it('rejects empty and malformed stored hashes', async () => {
    expect(await verifyPassword('x', '')).toBe(false);
    expect(await verifyPassword('x', 'scrypt$1$2')).toBe(false);
  });

  it('salts differ', async () => {
    const a = await hashPassword('correct horse');
    const b = await hashPassword('correct horse');
    expect(a).not.toBe(b);
  });
});
