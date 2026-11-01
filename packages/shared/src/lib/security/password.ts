import bcrypt from "bcryptjs";

const ROUNDS = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Used to keep login timing constant when the account does not exist.
export const DUMMY_HASH = "$2b$12$C6UzMDM.H6dfI/f/IKcEeO5w5Bf2n1n0y7xX1Qv3pYdGkqZ3hFQ1a";
