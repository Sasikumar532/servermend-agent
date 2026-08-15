import mongoose from "mongoose";
import { createApp } from "./app.js";
import { env } from "./config/env.js";

async function main() {
  if (!env.jwtSecret) {
    throw new Error("JWT_SECRET must be set — refusing to start with dashboard auth unusable");
  }

  await mongoose.connect(env.mongoUri);
  console.log(`connected to MongoDB at ${env.mongoUri}`);

  const app = createApp();
  app.listen(env.port, () => {
    console.log(`servermend-backend listening on :${env.port}`);
  });
}

main().catch((err) => {
  console.error("fatal startup error:", err);
  process.exit(1);
});
