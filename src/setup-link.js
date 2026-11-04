import "dotenv/config";
import mongoose from "mongoose";
import { randomBytes, createHash } from "node:crypto";
import { Role, SetupToken } from "./models.js";
await mongoose.connect(process.env.MONGODB_URI);
try {
  if (await Role.exists({ name: "Super Admin" }))
    throw new Error(
      "Setup is already complete. No additional setup token can be created.",
    );
  const token = randomBytes(32).toString("hex");
  await SetupToken.findOneAndUpdate(
    { _id: "initial-admin" },
    {
      $set: {
        digest: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        used: false,
      },
    },
    { upsert: true },
  );
  console.log(
    `One-time local setup link (expires in 30 minutes):\n${process.env.FRONTEND_ORIGIN || "http://127.0.0.1:5173"}/setup#${token}`,
  );
} finally {
  await mongoose.disconnect();
}
