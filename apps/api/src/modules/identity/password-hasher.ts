import argon2 from "argon2";

/** Port so that tests and benchmarks can swap the deliberately slow production hasher. */
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
}

export const PASSWORD_HASHER = Symbol("PASSWORD_HASHER");

/** OWASP Password Storage Cheat Sheet minimum for argon2id: 19 MiB of memory, 2 passes, 1 lane. */
const ARGON2_OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

/**
 * argon2id through the maintained `argon2` binding; no custom cryptography. A stored hash that
 * argon2 cannot parse throws instead of reading as a wrong password: it means corrupted data, which
 * should surface as a logged server error rather than lock the user out silently.
 */
export const argon2Hasher: PasswordHasher = {
  hash: (password) => argon2.hash(password, ARGON2_OPTIONS),
  verify: (hash, password) => argon2.verify(hash, password),
};
