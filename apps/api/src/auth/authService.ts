import type { Role, User } from "../users/user.js";
import { InvalidCredentialsError } from "./errors.js";
import { hashPassword, verifyPassword } from "./password.js";
import type { ActiveSession } from "./sessionRepository.js";
import { generateSessionToken, hashSessionToken } from "./sessionToken.js";
import { parseLoginInput, parseSignupInput } from "./validation.js";

export const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

// The service says what it needs from storage. The real repositories happen to
// have exactly these methods, so they can be passed in as they are, and tests
// pass in-memory fakes. (The service owns the interface; the database code
// conforms to it. Dependencies point inward.)
export type UserStore = {
  create(newUser: { email: string; passwordHash: string; role: Role }): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
};

export type SessionStore = {
  create(newSession: { tokenHash: Buffer; userId: string; expiresAt: Date }): Promise<void>;
  findActive(tokenHash: Buffer, now: Date): Promise<ActiveSession | null>;
  delete(tokenHash: Buffer): Promise<void>;
};

export type PasswordHasher = {
  hash(plain: string): Promise<string>;
  verify(plain: string, storedHash: string): Promise<boolean>;
};

// What the outside world is allowed to see about a user. Never the hash.
export type PublicUser = { id: string; email: string; role: Role };

export type AuthResult = {
  user: PublicUser;
  sessionToken: string;
  expiresAt: Date;
};

type AuthServiceDependencies = {
  users: UserStore;
  sessions: SessionStore;
  now?: () => Date;
  passwordHasher?: PasswordHasher;
};

function toPublicUser(user: User): PublicUser {
  return { id: user.id, email: user.email, role: user.role };
}

export function createAuthService({
  users,
  sessions,
  now = () => new Date(),
  passwordHasher = { hash: hashPassword, verify: verifyPassword },
}: AuthServiceDependencies) {
  // Hashing takes real time. When a login names an unknown email we still hash
  // once, against this throwaway value, so "unknown email" and "wrong password"
  // take about the same time. Created on first use, then reused.
  let dummyHash: Promise<string> | undefined;
  function getDummyHash(): Promise<string> {
    dummyHash ??= passwordHasher.hash("not-a-real-password");
    return dummyHash;
  }

  async function startSession(user: User): Promise<AuthResult> {
    const sessionToken = generateSessionToken();
    const expiresAt = new Date(now().getTime() + SESSION_LIFETIME_MS);
    await sessions.create({ tokenHash: hashSessionToken(sessionToken), userId: user.id, expiresAt });
    return { user: toPublicUser(user), sessionToken, expiresAt };
  }

  return {
    // Throws ValidationError or EmailAlreadyRegisteredError.
    async signup(input: unknown): Promise<AuthResult> {
      const { email, password, role } = parseSignupInput(input);
      const passwordHash = await passwordHasher.hash(password);
      const user = await users.create({ email, passwordHash, role });
      return startSession(user);
    },

    // Throws ValidationError or InvalidCredentialsError.
    async login(input: unknown): Promise<AuthResult> {
      const { email, password } = parseLoginInput(input);
      const user = await users.findByEmail(email);

      if (!user) {
        await passwordHasher.verify(password, await getDummyHash());
        throw new InvalidCredentialsError();
      }

      let passwordMatches: boolean;
      try {
        passwordMatches = await passwordHasher.verify(password, user.passwordHash);
      } catch (error) {
        // A stored hash that cannot be read is a bug or corrupted data, not a
        // wrong password. Record it for us, but give the client the same
        // answer as any failed login.
        console.error(
          JSON.stringify({
            msg: "stored password hash could not be verified",
            userId: user.id,
            error: String(error),
          }),
        );
        throw new InvalidCredentialsError();
      }

      if (!passwordMatches) {
        throw new InvalidCredentialsError();
      }
      return startSession(user);
    },

    // Ending a session that does not exist is not an error: logging out twice,
    // or with a stale cookie, should simply succeed.
    async logout(sessionToken: string | null): Promise<void> {
      if (sessionToken) {
        await sessions.delete(hashSessionToken(sessionToken));
      }
    },

    // The user behind a session cookie, or null if there is no valid session.
    async getSessionUser(sessionToken: string | null): Promise<PublicUser | null> {
      if (!sessionToken) {
        return null;
      }
      const session = await sessions.findActive(hashSessionToken(sessionToken), now());
      if (!session) {
        return null;
      }
      const user = await users.findById(session.userId);
      return user ? toPublicUser(user) : null;
    },
  };
}
