export type Role = "client" | "creator";

export type User = {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
  createdAt: Date;
};
