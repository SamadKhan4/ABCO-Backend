import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import session from "express-session";
import request from "supertest";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { createApp } from "../src/app.js";
import { SetupToken, Role, User, Employee } from "../src/models.js";
test("one-time admin setup is atomic and non-replayable", async () => {
  const dbName = `abco_test_${randomUUID().replaceAll("-", "")}`;
  process.env.SESSION_SECRET = randomBytes(32).toString("hex");
  await mongoose.connect("mongodb://127.0.0.1:27017", {
    dbName,
    serverSelectionTimeoutMS: 5000,
  });
  try {
    await Promise.all([
      SetupToken.init(),
      Role.init(),
      User.init(),
      Employee.init(),
    ]);
    const token = randomBytes(32).toString("hex");
    await SetupToken.create({
      digest: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 60000),
    });
    const agent = request.agent(
      createApp({ sessionStore: new session.MemoryStore() }),
    );
    const csrf = (await agent.get("/api/v1/auth/csrf")).body.data.token;
    const input = {
      token,
      name: "Setup Test",
      email: "setup@example.test",
      password: randomBytes(20).toString("hex"),
    };
    await agent
      .post("/api/v1/auth/setup")
      .set("x-csrf-token", csrf)
      .send({ ...input, token: "a".repeat(64) })
      .expect(403);
    assert.equal(await User.countDocuments(), 0);
    await agent
      .post("/api/v1/auth/setup")
      .set("x-csrf-token", csrf)
      .send(input)
      .expect(201);
    await agent
      .post("/api/v1/auth/setup")
      .set("x-csrf-token", csrf)
      .send(input)
      .expect(403);
    assert.equal(await User.countDocuments(), 1);
    assert.equal(await Role.countDocuments({ name: "Super Admin" }), 1);
    assert.equal(await Employee.countDocuments(), 0);
    assert.equal((await User.findOne()).employee, undefined);
    await agent
      .post("/api/v1/auth/login")
      .set("x-csrf-token", csrf)
      .send({ email: input.email, password: input.password })
      .expect(200);
    const owner = (await agent.get("/api/v1/auth/me").expect(200)).body.data;
    assert.equal(owner.isSuperAdmin, true);
    assert.deepEqual(owner.permissions, ["*"]);
    assert.equal(owner.employee, undefined);
    await agent.get("/api/v1/employees").expect(200);
  } finally {
    assert.ok(/^abco_test_[a-f0-9]{32}$/.test(mongoose.connection.name));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
