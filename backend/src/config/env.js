import "dotenv/config";

export const env = {
  port: Number(process.env.PORT ?? 4000),
  mongoUri: process.env.MONGO_URI ?? "mongodb://127.0.0.1:27017/servermend",
  // Required at real startup (see index.js) but deliberately not thrown
  // here — tests set this themselves before importing the app, and a
  // module-level throw would make the config module unimportable in that
  // context.
  jwtSecret: process.env.JWT_SECRET ?? "",
  // Optional. When unset, remediationClient.js falls back to a
  // deterministic template built from checkCatalog data instead of
  // calling out to the LLM — the remediation endpoint always returns
  // something useful, live key or not.
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
};
