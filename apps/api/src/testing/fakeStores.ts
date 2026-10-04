import type { PasswordHasher, SessionStore, UserStore } from "../auth/authService.js";
import { EmailAlreadyRegisteredError } from "../users/errors.js";
import type { User } from "../users/user.js";

// In-memory stand-ins for the database, for tests that check rules and HTTP
// behaviour rather than SQL. They honour the same contract as the real
// repositories (for example, a duplicate email throws the same typed error).

export function createFakeUserStore(): UserStore {
  const users = new Map<string, User>();
  return {
    async create(newUser) {
      if ([...users.values()].some((existing) => existing.email === newUser.email)) {
        throw new EmailAlreadyRegisteredError();
      }
      const user: User = { id: `user-${users.size + 1}`, ...newUser, createdAt: new Date(0) };
      users.set(user.id, user);
      return user;
    },
    async findByEmail(email) {
      return [...users.values()].find((user) => user.email === email) ?? null;
    },
    async findById(id) {
      return users.get(id) ?? null;
    },
  };
}

export function createFakeSessionStore(): SessionStore {
  const sessions = new Map<string, { userId: string; expiresAt: Date }>();
  const key = (tokenHash: Buffer) => tokenHash.toString("hex");
  return {
    async create({ tokenHash, userId, expiresAt }) {
      sessions.set(key(tokenHash), { userId, expiresAt });
    },
    async findActive(tokenHash, now) {
      const session = sessions.get(key(tokenHash));
      return session && session.expiresAt > now ? session : null;
    },
    async delete(tokenHash) {
      sessions.delete(key(tokenHash));
    },
  };
}

// Instant, and recognisable in assertions. The real argon2 hasher is covered by
// its own tests.
export const fakeHasher: PasswordHasher = {
  hash: async (plain) => `fake-hash:${plain}`,
  verify: async (plain, storedHash) => storedHash === `fake-hash:${plain}`,
};
