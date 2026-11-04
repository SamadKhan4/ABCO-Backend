import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import {
  createHash,
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { User } from "../../models.js";
import { recentAuthentication } from "../admin/routes.js";
import { fail, audit } from "../../shared/workflow.js";
function key() {
  if (!/^[a-f\d]{64}$/i.test(process.env.DOCUMENT_KEY || ""))
    fail(503, "Configure the private encryption key before enabling MFA");
  return createHash("sha256")
    .update("abco-mfa-encryption:")
    .update(process.env.DOCUMENT_KEY)
    .digest();
}
function encrypt(secret) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  return (
    "v2:" +
    Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64")
  );
}
function decrypt(secret) {
  const version2 = secret.startsWith("v2:");
  const data = Buffer.from(version2 ? secret.slice(3) : secret, "base64");
  function decode(encryptionKey) {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey,
      data.subarray(0, 12),
    );
    decipher.setAuthTag(data.subarray(12, 28));
    return Buffer.concat([
      decipher.update(data.subarray(28)),
      decipher.final(),
    ]).toString("utf8");
  }
  if (version2) return decode(key());
  try {
    return decode(
      createHash("sha256")
        .update("abco-mfa-encryption:")
        .update(process.env.SESSION_SECRET)
        .digest(),
    );
  } catch {
    return decode(key());
  }
}
const digest = (code) =>
  createHash("sha256")
    .update(code.replaceAll("-", "").trim().toUpperCase())
    .digest("hex");
const totp = (secret, email) =>
  new OTPAuth.TOTP({
    issuer: "ABCO HRMS",
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret,
  });
export async function verifySecondFactor(userId, code) {
  const user = await User.findById(userId).select("+mfaSecret +recoveryCodes");
  if (!user?.mfaEnabled) return true;
  if (!code) return false;
  if (/^\d{6}$/.test(code)) {
    const token = totp(decrypt(user.mfaSecret), user.email),
      delta = token.validate({ token: code, window: 1 });
    if (delta === null) return false;
    const counter = token.counter() + delta;
    return Boolean(
      await User.findOneAndUpdate(
        { _id: user._id, mfaCounter: { $lt: counter } },
        {
          $set: {
            mfaCounter: counter,
            ...(!user.mfaSecret.startsWith("v2:")
              ? { mfaSecret: encrypt(decrypt(user.mfaSecret)) }
              : {}),
          },
        },
      ),
    );
  }
  const hash = digest(code);
  return Boolean(
    await User.findOneAndUpdate(
      { _id: user._id, recoveryCodes: hash },
      { $pull: { recoveryCodes: hash } },
    ),
  );
}
export function mfaRoutes() {
  const router = Router();
  router.use("/auth/mfa", rateLimit({ windowMs: 15 * 60000, limit: 20 }));
  router.get("/auth/mfa", async (req, res) => {
    const user = await User.findById(req.user.id).select("+recoveryCodes");
    res.json({
      data: {
        enabled: user.mfaEnabled,
        recoveryCodesRemaining: user.recoveryCodes.length,
      },
    });
  });
  router.post("/auth/mfa/setup", async (req, res) => {
    recentAuthentication(req);
    if (req.user.mfaEnabled) fail(409, "MFA is already enabled");
    const secret = new OTPAuth.Secret({ size: 20 }),
      token = totp(secret, req.user.email);
    await User.updateOne(
      { _id: req.user._id },
      {
        $set: {
          mfaPending: encrypt(secret.base32),
          mfaPendingExpires: new Date(Date.now() + 10 * 60000),
        },
      },
    );
    res.json({
      data: {
        secret: secret.base32,
        qr: await QRCode.toDataURL(token.toString(), { width: 240, margin: 2 }),
        expiresInMinutes: 10,
      },
    });
  });
  router.post("/auth/mfa/enable", async (req, res) => {
    recentAuthentication(req);
    const code = z
        .string()
        .regex(/^\d{6}$/)
        .parse(req.body.code),
      user = await User.findById(req.user.id).select("+mfaPending");
    if (
      user.mfaEnabled ||
      !user.mfaPending ||
      user.mfaPendingExpires < new Date()
    )
      fail(409, "Start a fresh MFA setup");
    const token = totp(decrypt(user.mfaPending), user.email),
      delta = token.validate({ token: code, window: 1 });
    if (delta === null) fail(422, "Authenticator code is incorrect");
    const recoveryCodes = Array.from({ length: 8 }, () =>
      randomBytes(12).toString("hex").toUpperCase().match(/.{4}/g).join("-"),
    );
    const updated = await User.findOneAndUpdate(
      { _id: user._id, mfaEnabled: false, mfaPending: user.mfaPending },
      {
        $set: {
          mfaEnabled: true,
          mfaSecret: user.mfaPending,
          mfaCounter: token.counter() + delta,
          recoveryCodes: recoveryCodes.map(digest),
        },
        $inc: { authVersion: 1 },
        $unset: { mfaPending: 1, mfaPendingExpires: 1 },
      },
      { new: true },
    );
    if (!updated) fail(409, "MFA setup changed. Refresh and try again.");
    req.session.authVersion = updated.authVersion;
    await audit(req, "auth.mfa.enabled", updated.id);
    res.json({ data: { recoveryCodes } });
  });
  router.post("/auth/mfa/disable", async (req, res) => {
    recentAuthentication(req);
    const code = z.string().min(6).max(64).parse(req.body.code);
    if (!req.user.mfaEnabled) fail(409, "MFA is not enabled");
    if (!(await verifySecondFactor(req.user.id, code)))
      fail(422, "Use a fresh authenticator code or an unused recovery code");
    const updated = await User.findByIdAndUpdate(
      req.user.id,
      {
        $set: { mfaEnabled: false, recoveryCodes: [], mfaCounter: -1 },
        $inc: { authVersion: 1 },
        $unset: { mfaSecret: 1, mfaPending: 1, mfaPendingExpires: 1 },
      },
      { new: true },
    );
    req.session.authVersion = updated.authVersion;
    await audit(req, "auth.mfa.disabled", updated.id);
    res.json({ data: true });
  });
  return router;
}
