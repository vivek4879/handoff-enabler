import { createApp } from "./app.js";
import { pool } from "./db.js";

const port = Number(process.env.PORT ?? 4000);

const app = createApp({ db: pool });

app.listen(port, () => {
  console.log(JSON.stringify({ msg: "api listening", port }));
});
