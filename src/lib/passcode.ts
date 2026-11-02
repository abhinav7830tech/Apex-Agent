import { randomInt, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Generates a cryptographically secure, random 6-digit numeric meeting passcode.
 * E.g. "482915"
 */
export function generatePasscode(): string {
  return randomInt(100000, 1000000).toString();
}

/**
 * Hashes a plaintext passcode with a random 16-byte salt using scrypt.
 * Returns `${saltHex}:${hashHex}`. Never store plaintext passcodes in the database.
 */
export function hashPasscode(passcode: string): string {
  const normalized = passcode.trim();
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(normalized, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

/**
 * Constant-time verification of a passcode against the stored salted hash.
 */
export function verifyPasscode(passcode: string, storedHash: string | null | undefined): boolean {
  if (!storedHash || typeof storedHash !== "string" || !storedHash.includes(":")) {
    return false;
  }

  const [salt, expectedHash] = storedHash.split(":");
  if (!salt || !expectedHash) return false;

  try {
    const normalized = passcode.trim();
    const computedHash = scryptSync(normalized, salt, 32).toString("hex");
    const expectedBuf = Buffer.from(expectedHash, "hex");
    const computedBuf = Buffer.from(computedHash, "hex");

    if (expectedBuf.length !== computedBuf.length) {
      return false;
    }

    return timingSafeEqual(computedBuf, expectedBuf);
  } catch {
    return false;
  }
}
