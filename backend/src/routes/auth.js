import { Router } from "express";
import bcrypt from "bcryptjs";
import { User } from "../models/User.js";
import { signUserToken } from "../middleware/userAuth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

const router = Router();
const BCRYPT_ROUNDS = 12;

router.post("/auth/signup", asyncHandler(async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== "string" || typeof password !== "string" || password.length < 8) {
    res.status(400).json({ error: "email and a password of at least 8 characters are required" });
    return;
  }

  const existing = await User.findOne({ email: email.toLowerCase() }).lean();
  if (existing) {
    res.status(409).json({ error: "email already registered" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = await User.create({ email, passwordHash });
  res.status(201).json({ token: signUserToken(user._id.toString()) });
}));

router.post("/auth/login", asyncHandler(async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "email and password are required" });
    return;
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  const valid = user && (await bcrypt.compare(password, user.passwordHash));
  if (!valid) {
    // Deliberately identical message for "no such user" and "wrong
    // password" — distinguishing them lets an attacker enumerate emails.
    res.status(401).json({ error: "invalid email or password" });
    return;
  }

  res.json({ token: signUserToken(user._id.toString()) });
}));

export default router;
