import argon2 from "argon2";

/** Port so that tests and benchmarks can swap the deliberately slow production hasher. */
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
}

export const PASSWORD_HASHER = Symbol("PASSWORD_HASHER");

/**
 * argon2id with the OWASP Password Storage Cheat Sheet minimum (m = 19 MiB, t = 2, p = 1), via the
 * maintained `argon2` binding. No custom cryptography.
 */
export const argon2Hasher: PasswordHasher = {
  hash: (password) =>
    argon2.hash(password, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 }),
  verify: async (hash, password) => {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  },
};
