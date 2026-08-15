import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { _resetRateLimitState } from "../src/middleware/rateLimit.js";

// Explicitly opted into by the tests that actually need a database — not
// wired in as a global vitest setupFile, since that would start a
// mongodb-memory-server instance for every test file, including the
// pure-logic ones (rulesEngine, checkCatalog) that have no use for one.
let mongod;

export async function startTestDb() {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}

export async function clearTestDb() {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
  // Every test in api.test.js shares one IP (supertest has no real socket),
  // so without this, tests run later in the file would start tripping the
  // real auth/dashboard rate limits — a side effect of test structure, not
  // something the limiter itself is getting wrong.
  _resetRateLimitState();
}

export async function stopTestDb() {
  await mongoose.disconnect();
  await mongod.stop();
}
