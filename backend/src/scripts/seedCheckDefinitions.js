import mongoose from "mongoose";
import { pathToFileURL } from "node:url";
import { CheckDefinition } from "../models/CheckDefinition.js";
import { checkCatalog } from "../data/checkCatalog.js";
import { env } from "../config/env.js";

// Upserts by checkId so re-running this after editing checkCatalog.js
// updates existing definitions rather than erroring on the unique index —
// the whole point of keeping severity/rationale/fix commands here instead
// of in the agent binary is that they can be safely re-seeded.
export async function seedCheckDefinitions(catalog = checkCatalog) {
  const results = await Promise.all(
    catalog.map((entry) =>
      CheckDefinition.findOneAndUpdate(
        { checkId: entry.checkId },
        { $set: entry },
        { upsert: true, new: true }
      )
    )
  );
  return results.length;
}

async function main() {
  await mongoose.connect(env.mongoUri);
  const count = await seedCheckDefinitions();
  console.log(`seeded ${count} check definitions into ${env.mongoUri}`);
  await mongoose.disconnect();
}

// Only run automatically when invoked directly (`npm run seed`), not when
// imported by a test. Comparing against a plain `file://${process.argv[1]}`
// string silently fails on Windows (backslashes, no triple-slash) — this
// guard evaluated false there, so `npm run seed` did nothing and reported
// success anyway. pathToFileURL() builds the URL the same way Node's own
// module loader would, on any platform.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("seed failed:", err);
    process.exit(1);
  });
}
