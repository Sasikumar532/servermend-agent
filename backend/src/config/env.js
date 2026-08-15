import "dotenv/config";

export const env = {
  port: Number(process.env.PORT ?? 4000),
  mongoUri: process.env.MONGO_URI ?? "mongodb://127.0.0.1:27017/servermend",
  // Required at real startup (see index.js) but deliberately not thrown
  // here — tests set this themselves before importing the app, and a
  // module-level throw would make the config module unimportable in that
  // context.
  jwtSecret: process.env.JWT_SECRET ?? "",
};
