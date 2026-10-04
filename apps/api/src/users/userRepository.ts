import { DatabaseError, type Pool } from "pg";
import { EmailAlreadyRegisteredError } from "./errors.js";
import type { Role, User } from "./user.js";

type Database = Pick<Pool, "query">;

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  role: Role;
  created_at: Date;
};

type NewUser = {
  email: string;
  passwordHash: string;
  role: Role;
};

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    createdAt: row.created_at,
  };
}

function isEmailTaken(error: unknown): boolean {
  return (
    error instanceof DatabaseError &&
    error.code === "23505" &&
    error.constraint === "users_email_key"
  );
}

export function createUserRepository(db: Database) {
  return {
    async create(newUser: NewUser): Promise<User> {
      try {
        const result = await db.query<UserRow>(
          `INSERT INTO users (email, password_hash, role)
           VALUES ($1, $2, $3)
           RETURNING id, email, password_hash, role, created_at`,
          [newUser.email, newUser.passwordHash, newUser.role],
        );
        return toUser(result.rows[0]);
      } catch (error) {
        if (isEmailTaken(error)) {
          throw new EmailAlreadyRegisteredError();
        }
        throw error;
      }
    },

    async findByEmail(email: string): Promise<User | null> {
      const result = await db.query<UserRow>(
        `SELECT id, email, password_hash, role, created_at
         FROM users
         WHERE email = $1`,
        [email],
      );
      const row = result.rows[0];
      return row ? toUser(row) : null;
    },
  };
}
