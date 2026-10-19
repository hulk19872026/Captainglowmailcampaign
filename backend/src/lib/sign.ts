import crypto from 'crypto';
import { sessionSecret } from './env';

/** Short signature so tracked links can't be abused as an open redirect. */
export function signLink(...parts: string[]): string {
  return crypto.createHmac('sha256', sessionSecret()).update(parts.join('|')).digest('hex').slice(0, 20);
}

export function verifyLink(sig: string, ...parts: string[]): boolean {
  const expected = signLink(...parts);
  if (!sig || sig.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}
