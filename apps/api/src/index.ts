import { createServer } from "node:http";
import { pool } from "./db.js";

const port = Number(process.env.PORT ?? 4000);

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    try {
      await pool.query("SELECT 1");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", db: "connected" }));
    } catch (error) {
      console.error(JSON.stringify({ msg: "health check db query failed", error: String(error) }));
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "error", db: "unreachable" }));
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(port, () => {
  console.log(JSON.stringify({ msg: "api listening", port }));
});
