import { randomInt, randomUUID } from 'node:crypto';
import type { Account } from './catalog.ts';
import { InputError } from './request.ts';

type SignupDetails = Pick<Account, 'name' | 'email' | 'password'>;

export const verificationMinutes = 10;
const lifetimeMs = verificationMinutes * 60_000;
const maxAttempts = 5;

type PendingSignup = {
  details: SignupDetails;
  code: string;
  expiresAt: number;
  attempts: number;
};

export function createSignupStore() {
  const pending = new Map<string, PendingSignup>();

  function find(token: string) {
    const signup = pending.get(token);
    if (signup && signup.expiresAt <= Date.now()) {
      pending.delete(token);
      return undefined;
    }
    return signup;
  }

  return {
    start(details: SignupDetails, previousToken: string) {
      const now = Date.now();
      pending.delete(previousToken);
      for (const [token, signup] of pending) {
        if (signup.expiresAt <= now) pending.delete(token);
      }
      const token = randomUUID();
      pending.set(token, { details, code: String(randomInt(100_000, 1_000_000)), expiresAt: now + lifetimeMs, attempts: 0 });
      return token;
    },
    find,
    consume(token: string, code: string) {
      const signup = find(token);
      if (!signup) throw new InputError(400, 'Your verification has expired. Start a new sign-up to get a code.');
      if (signup.code !== code.trim()) {
        signup.attempts++;
        if (signup.attempts >= maxAttempts) {
          pending.delete(token);
          throw new InputError(400, 'Too many incorrect codes. Start a new sign-up to get a code.');
        }
        throw new InputError(400, 'That code did not match. Check the practice inbox and try again.');
      }
      pending.delete(token);
      return signup.details;
    },
  };
}
