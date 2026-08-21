import { Router } from "express";
import { User } from "../models/User.js";
import { requireUserAuth } from "../middleware/userAuth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { dashboardRateLimit } from "../middleware/rateLimit.js";

const router = Router();

const PROFILE_FIELDS = ["firstName", "lastName", "mobileNumber", "companyName", "position"];

function toProfile(user) {
  return {
    email: user.email,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    mobileNumber: user.mobileNumber ?? null,
    companyName: user.companyName ?? null,
    position: user.position ?? null,
  };
}

router.get(
  "/me",
  requireUserAuth,
  dashboardRateLimit,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.userId).lean();
    if (!user) {
      res.status(404).json({ error: "user not found" });
      return;
    }
    res.json(toProfile(user));
  })
);

// Email is deliberately not editable here — it's the sign-in identity and
// changing it would need its own uniqueness/verification handling, which
// is out of scope for a profile-details update.
router.patch(
  "/me",
  requireUserAuth,
  dashboardRateLimit,
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const updates = {};
    for (const field of PROFILE_FIELDS) {
      if (!(field in body)) continue;
      const value = body[field];
      if (value !== null && typeof value !== "string") {
        res.status(400).json({ error: `${field} must be a string or null` });
        return;
      }
      updates[field] = typeof value === "string" ? value.trim() : "";
    }

    const user = await User.findByIdAndUpdate(req.userId, { $set: updates }, { new: true }).lean();
    if (!user) {
      res.status(404).json({ error: "user not found" });
      return;
    }
    res.json(toProfile(user));
  })
);

export default router;
