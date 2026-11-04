import "dotenv/config";
import mongoose from "mongoose";
import { z } from "zod";
import { createInitialAdmin } from "./setup.js";
const input = z
  .object({
    name: z.string().trim().min(1),
    email: z.email().transform((v) => v.toLowerCase()),
    password: z.string().min(12).max(128),
  })
  .parse({
    name: process.env.ADMIN_NAME,
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  });
await mongoose.connect(process.env.MONGODB_URI);
try {
  await createInitialAdmin(input);
  console.log(
    "Initial administrator created. Remove bootstrap credentials from the environment.",
  );
} finally {
  await mongoose.disconnect();
}
