import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import session from "express-session";
import request from "supertest";
import argon2 from "argon2";
import * as OTPAuth from "otpauth";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { createApp } from "../src/app.js";
import { Role, User } from "../src/models.js";
test("authenticator MFA, one-use recovery codes and password reset revoke access correctly", async () => {
  process.env.DOCUMENT_KEY = randomBytes(32).toString("hex");
  process.env.NODE_ENV = "test";
  process.env.SESSION_SECRET = randomBytes(32).toString("hex");
  const dbName = `abco_test_${randomUUID().replaceAll("-", "")}`;
  await mongoose.connect("mongodb://127.0.0.1:27017", {
    dbName,
    serverSelectionTimeoutMS: 5000,
  });
  try {
    await Promise.all(
      Object.values(mongoose.models).map((model) => model.init()),
    );
    const role = await Role.create({ name: "Super Admin", permissions: ["*"] }),
      password = randomBytes(20).toString("hex");
    const user = await User.create({
      name: "Security Test",
      email: "security@example.test",
      role: role._id,
      passwordHash: await argon2.hash(password),
    });
    const app = createApp({ sessionStore: new session.MemoryStore() });
    async function browser() {
      const agent = request.agent(app);
      const csrf = (await agent.get("/api/v1/auth/csrf")).body.data.token;
      return { agent, csrf };
    }
    const primary = await browser();
    const login = await primary.agent
      .post("/api/v1/auth/login")
      .set("x-csrf-token", primary.csrf)
      .send({ email: user.email, password })
      .expect(200);
    primary.csrf = login.body.data.csrfToken;
    const setup = (
      await primary.agent
        .post("/api/v1/auth/mfa/setup")
        .set("x-csrf-token", primary.csrf)
        .send({})
        .expect(200)
    ).body.data;
    assert.match(setup.qr, /^data:image\/png;base64,/);
    const totp = new OTPAuth.TOTP({
      issuer: "ABCO HRMS",
      label: user.email,
      secret: setup.secret,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
    });
    const enabled = (
      await primary.agent
        .post("/api/v1/auth/mfa/enable")
        .set("x-csrf-token", primary.csrf)
        .send({ code: totp.generate() })
        .expect(200)
    ).body.data;
    assert.equal(enabled.recoveryCodes.length, 8);
    const stored = await User.findById(user.id).select(
      "+mfaSecret +recoveryCodes",
    );
    assert.notEqual(stored.mfaSecret, setup.secret);
    assert.ok(
      stored.recoveryCodes.every(
        (code) => !enabled.recoveryCodes.includes(code),
      ),
    );
    const second = await browser();
    await second.agent
      .post("/api/v1/auth/login")
      .set("x-csrf-token", second.csrf)
      .send({ email: user.email, password })
      .expect(401);
    const secondLogin = await second.agent
      .post("/api/v1/auth/login")
      .set("x-csrf-token", second.csrf)
      .send({ email: user.email, password, totp: enabled.recoveryCodes[0] })
      .expect(200);
    second.csrf = secondLogin.body.data.csrfToken;
    const replay = await browser();
    await replay.agent
      .post("/api/v1/auth/login")
      .set("x-csrf-token", replay.csrf)
      .send({ email: user.email, password, totp: enabled.recoveryCodes[0] })
      .expect(401);
    await primary.agent
      .post("/api/v1/auth/mfa/disable")
      .set("x-csrf-token", primary.csrf)
      .send({ code: enabled.recoveryCodes[1] })
      .expect(200);
    await second.agent.get("/api/v1/auth/me").expect(401);
    const token = randomBytes(32).toString("hex"),
      nextPassword = randomBytes(20).toString("hex");
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          resetHash: createHash("sha256").update(token).digest("hex"),
          resetExpires: new Date(Date.now() + 60000),
        },
      },
    );
    const recovery = await browser();
    await recovery.agent
      .post("/api/v1/auth/reset-password")
      .set("x-csrf-token", recovery.csrf)
      .send({ token, password: nextPassword })
      .expect(200);
    await primary.agent.get("/api/v1/auth/me").expect(401);
    const retry = await browser();
    await retry.agent
      .post("/api/v1/auth/reset-password")
      .set("x-csrf-token", retry.csrf)
      .send({ token, password: nextPassword })
      .expect(400);
    await retry.agent
      .post("/api/v1/auth/login")
      .set("x-csrf-token", retry.csrf)
      .send({ email: user.email, password: nextPassword })
      .expect(200);
  } finally {
    assert.ok(/^abco_test_[a-f\d]{32}$/.test(mongoose.connection.name));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
