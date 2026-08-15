import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { MongoMemoryServer } from "mongodb-memory-server";

const execFileAsync = promisify(execFile);
const BACKEND_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url))); // test/ -> backend/

// Regression test for a real bug: the script's direct-execution guard
// (`import.meta.url === file://${process.argv[1]}`) silently evaluated
// false on Windows — backslash paths don't produce a valid file:// URL by
// naive string concatenation — so `npm run seed` did nothing and reported
// exit code 0 anyway. Calling seedCheckDefinitions() directly, the way the
// other tests do, never exercised this guard at all. Only actually
// spawning the script as a real subprocess (what a user running `npm run
// seed` does) catches this class of bug.
describe("seedCheckDefinitions.js as a CLI script", () => {
  let mongod;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
  }, 30000);

  afterAll(async () => {
    await mongod.stop();
  });

  it("actually runs and reports success when invoked directly", async () => {
    const { stdout } = await execFileAsync(
      process.execPath,
      ["src/scripts/seedCheckDefinitions.js"],
      {
        cwd: BACKEND_ROOT,
        env: { ...process.env, MONGO_URI: mongod.getUri() },
      }
    );
    expect(stdout).toContain("seeded 60 check definitions");
  }, 30000);
});
