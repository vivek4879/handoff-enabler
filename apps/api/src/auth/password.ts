import { hash, verify } from "@node-rs/argon2";

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain);
}

export async function verifyPassword(plain: string, storedHash: string): Promise<boolean> {
  return verify(storedHash, plain);
}
