import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Database tests share one test database and empty it between tests, so
    // test files must not run at the same time.
    fileParallelism: false,
  },
});
