import * as argon2 from 'argon2';
import { AppError } from '../http/errors';

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

const ARGON_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
  hashLength: 32,
} as const;

export const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,p=1,t=3$dv1LBeAbow4yX6aoLhBOaw$9j4Yb23+2zGvqJ9YLqde0elFNKvZx86VetsddTbec5Q';

export type BreachChecker = (password: string) => Promise<boolean>;

let breachChecker: BreachChecker | undefined;

export function setPasswordBreachChecker(checker: BreachChecker | undefined): void {
  breachChecker = checker;
}

export function assertPasswordPolicy(password: string): void {
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new AppError(
      'VALIDATION_ERROR',
      `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
      { field: 'password' },
    );
  }

  if (password.length > PASSWORD_MAX_LENGTH) {
    throw new AppError(
      'VALIDATION_ERROR',
      `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`,
      { field: 'password' },
    );
  }

  if (!password.trim() || /\s{3,}|[\u0000-\u001f\u007f]/.test(password)) {
    throw new AppError('VALIDATION_ERROR', 'Password contains unsupported characters.', {
      field: 'password',
    });
  }
}

export async function assertPasswordAllowed(password: string): Promise<void> {
  assertPasswordPolicy(password);

  if (breachChecker && (await breachChecker(password))) {
    throw new AppError('VALIDATION_ERROR', 'Choose a password that has not appeared in a breach.', {
      field: 'password',
    });
  }
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON_OPTIONS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export async function verifyDummyPassword(password: string): Promise<void> {
  await verifyPassword(DUMMY_PASSWORD_HASH, password);
}

export function passwordNeedsRehash(hash: string): boolean {
  try {
    return argon2.needsRehash(hash, {
      memoryCost: ARGON_OPTIONS.memoryCost,
      timeCost: ARGON_OPTIONS.timeCost,
      parallelism: ARGON_OPTIONS.parallelism,
    });
  } catch {
    return true;
  }
}
