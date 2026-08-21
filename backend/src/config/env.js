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
  // Optional. When smtp.host is unset, emailTransport.js records every
  // alert as "skipped_no_smtp" instead of sending — the Alert row (and
  // therefore GET /servers/:id/alerts) is always real either way; only
  // email delivery is affected.
  smtp: {
    host: process.env.SMTP_HOST ?? "",
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true", // true for port 465, false for 587/STARTTLS
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
    from: process.env.SMTP_FROM ?? "alerts@servermend.local",
  },
};
