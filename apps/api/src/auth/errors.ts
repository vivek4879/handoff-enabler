// Input the caller got wrong (missing field, bad format). The route turns this
// into a 400 and shows the per-field messages next to the form fields.
export class ValidationError extends Error {
  constructor(readonly fields: Record<string, string>) {
    super("invalid input");
    this.name = "ValidationError";
  }
}

// Login failed. The same error, with the same message, covers "no such user"
// and "wrong password" so a client cannot tell which emails are registered.
export class InvalidCredentialsError extends Error {
  constructor() {
    super("invalid email or password");
    this.name = "InvalidCredentialsError";
  }
}
