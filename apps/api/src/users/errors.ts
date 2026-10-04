export class EmailAlreadyRegisteredError extends Error {
  constructor() {
    super("email already registered");
    this.name = "EmailAlreadyRegisteredError";
  }
}
