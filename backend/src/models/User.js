import { Schema, model } from "mongoose";

const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    mobileNumber: { type: String, trim: true },
    companyName: { type: String, trim: true },
    position: { type: String, trim: true },
  },
  { timestamps: true }
);

export const User = model("User", UserSchema);
