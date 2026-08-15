import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 30000, // mongodb-memory-server's first download/boot can be slow
    hookTimeout: 30000,
    // Set at config-load time, before any test file's static imports run —
    // src/config/env.js reads process.env.JWT_SECRET at module-load time,
    // so setting this in a beforeAll() would be too late (ESM hoists
    // imports ahead of any top-level code in the importing file).
    env: {
      JWT_SECRET: "test-secret-do-not-use-in-production",
    },
  },
});
