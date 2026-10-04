import { createApp } from "./app.js";
import { createAuthService } from "./auth/authService.js";
import { createSessionRepository } from "./auth/sessionRepository.js";
import { pool } from "./db.js";
import { createUserRepository } from "./users/userRepository.js";

// The composition root: the one place that reads the environment and builds the
// real objects, then hands them to the parts that need them.
const port = Number(process.env.PORT ?? 4000);
const secureCookies = process.env.NODE_ENV === "production";

const auth = createAuthService({
  users: createUserRepository(pool),
  sessions: createSessionRepository(pool),
});

const app = createApp({ db: pool, auth, secureCookies });

app.listen(port, () => {
  console.log(JSON.stringify({ msg: "api listening", port, secureCookies }));
});
