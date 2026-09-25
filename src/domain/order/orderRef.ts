import { randomInt } from 'crypto';

export function generateOrderRef(randomIndex: (max: number) => number = (max) => randomInt(max)): string {
  const chars = 'ABCDEFGHIJKLMNPQRSTUVWXYZ123456789';
  let s = '';
  for (let i = 0; i < 6; i++) {
    s += chars[randomIndex(chars.length)];
  }
  return `${s.slice(0, 3)}-${s.slice(3)}`;
}
