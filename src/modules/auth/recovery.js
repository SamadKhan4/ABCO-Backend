import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import mongoose from "mongoose";
import nodemailer from "nodemailer";
import argon2 from "argon2";
import {
  randomBytes,
  createHash,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { z } from "zod";
import { User, Audit } from "../../models.js";
import { fail } from "../../shared/workflow.js";

export const EmailJob = mongoose.model(
  "EmailJob",
  new mongoose.Schema(
    {
      payload: { type: String, select: false },
      status: {
        type: String,
        enum: ["Pending", "Processing", "Sent", "Failed"],
        default: "Pending",
      },
      attempts: { type: Number, default: 0 },
      nextAttempt: { type: Date, default: Date.now },
      lockedAt: Date,
      lastError: String,
    },
    { timestamps: true, strict: "throw" },
  ),
);
function encryptionKey() {
  return createHash("sha256").update(process.env.SESSION_SECRET).digest();
}
function encrypt(payload) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const data = Buffer.concat([
    cipher.update(JSON.stringify(payload)),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
}
function decrypt(payload) {
  const data = Buffer.from(payload, "base64"),
    cipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      data.subarray(0, 12),
    );
  cipher.setAuthTag(data.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([
      cipher.update(data.subarray(28)),
      cipher.final(),
    ]).toString(),
  );
}
export async function enqueueEmail(payload, session) {
  return EmailJob.create([{ payload: encrypt(payload) }], {
    session,
    ordered: true,
  });
}
export function recoveryRoutes() {
  const router = Router();
  router.post(
    "/auth/forgot-password",
    rateLimit({ windowMs: 15 * 60000, limit: 5 }),
    async (req, res) => {
      const email = z
        .email()
        .transform((v) => v.toLowerCase())
        .parse(req.body.email);
      if (!process.env.SMTP_HOST || !process.env.SMTP_FROM)
        fail(
          503,
          "Password recovery email is not configured. Contact your administrator.",
        );
      const user = await User.findOne({ email, active: true });
      if (user) {
        const token = randomBytes(32).toString("hex");
        await User.updateOne(
          { _id: user._id },
          {
            $set: {
              resetHash: createHash("sha256").update(token).digest("hex"),
              resetExpires: new Date(Date.now() + 30 * 60000),
            },
          },
        );
        await EmailJob.create({
          payload: encrypt({
            to: user.email,
            subject: "Reset your ABCO HRMS password",
            text: `Use this link within 30 minutes to set a new password:\n${process.env.FRONTEND_ORIGIN}/reset-password#${token}\nIf you did not request this, ignore this email.`,
          }),
        });
        await Audit.create({
          actor: user._id,
          action: "auth.reset.requested",
          requestId: req.id,
        });
      }
      res.json({
        data: {
          message:
            "If an eligible account exists, a reset email has been queued.",
        },
      });
    },
  );
  router.post(
    "/auth/reset-password",
    rateLimit({ windowMs: 15 * 60000, limit: 10 }),
    async (req, res) => {
      const input = z
        .object({
          token: z.string().regex(/^[a-f\d]{64}$/),
          password: z.string().min(12).max(128),
        })
        .parse(req.body);
      const digest = createHash("sha256").update(input.token).digest("hex");
      const candidate = await User.findOne({
        resetHash: digest,
        resetExpires: { $gt: new Date() },
        active: true,
      });
      if (!candidate) fail(400, "Reset link is invalid or expired");
      const passwordHash = await argon2.hash(input.password, {
        type: argon2.argon2id,
      });
      const user = await User.findOneAndUpdate(
        {
          _id: candidate._id,
          resetHash: digest,
          resetExpires: { $gt: new Date() },
          active: true,
        },
        {
          $set: { passwordHash, failedLogins: 0 },
          $inc: { authVersion: 1 },
          $unset: { resetHash: 1, resetExpires: 1, lockedUntil: 1 },
        },
        { new: true },
      );
      if (!user) fail(409, "Reset link has already been used");
      await Audit.create({
        actor: user._id,
        action: "auth.password.reset",
        requestId: req.id,
      });
      await new Promise((resolve, reject) =>
        req.session.destroy((error) => (error ? reject(error) : resolve())),
      );
      res.json({ data: true });
    },
  );
  return router;
}
export function startEmailWorker() {
  if (!process.env.SMTP_HOST) return () => {};
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
    connectionTimeout: 10000,
    socketTimeout: 15000,
  });
  let busy = false;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      await EmailJob.updateMany(
        {
          status: "Processing",
          lockedAt: { $lt: new Date(Date.now() - 5 * 60000) },
        },
        { $set: { status: "Pending" } },
      );
      const job = await EmailJob.findOneAndUpdate(
        { status: "Pending", nextAttempt: { $lte: new Date() } },
        {
          $set: { status: "Processing", lockedAt: new Date() },
          $inc: { attempts: 1 },
        },
        { new: true },
      ).select("+payload");
      if (!job) return;
      try {
        await transporter.sendMail({
          from: process.env.SMTP_FROM,
          ...decrypt(job.payload),
        });
        await EmailJob.updateOne(
          { _id: job._id },
          { $set: { status: "Sent" }, $unset: { payload: 1, lastError: 1 } },
        );
      } catch {
        await EmailJob.updateOne(
          { _id: job._id },
          {
            $set: {
              status: job.attempts >= 5 ? "Failed" : "Pending",
              lastError: "Email delivery failed",
              nextAttempt: new Date(
                Date.now() + Math.min(60 * 60000, 2 ** job.attempts * 30000),
              ),
            },
          },
        );
      }
    } catch {
      console.error("Email worker could not process queue");
    } finally {
      busy = false;
    }
  }, 5000);
  timer.unref();
  return () => {
    clearInterval(timer);
    transporter.close();
  };
}
