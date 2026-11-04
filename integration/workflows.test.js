import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import session from "express-session";
import argon2 from "argon2";
import request from "supertest";
import { randomUUID, randomBytes } from "node:crypto";
import { createApp } from "../src/app.js";
import {
  Role,
  User,
  Employee,
  Attendance,
  LeavePolicy,
  LeaveBalance,
  LeaveLedger,
  Leave,
} from "../src/models.js";

test("real MongoDB: authentication, CSRF, employee permissions and attendance", async (t) => {
  const dbName = `abco_test_${randomUUID().replaceAll("-", "")}`;
  const future = new Date();
  future.setUTCDate(future.getUTCDate() + 7);
  const leaveDate = future.toISOString().slice(0, 10);
  process.env.SESSION_SECRET = randomBytes(32).toString("hex");
  await mongoose.connect("mongodb://127.0.0.1:27017", {
    dbName,
    serverSelectionTimeoutMS: 5000,
  });
  try {
    await Promise.all([
      Role.init(),
      User.init(),
      Employee.init(),
      Attendance.init(),
      LeavePolicy.init(),
      LeaveBalance.init(),
      LeaveLedger.init(),
      Leave.init(),
    ]);
    await LeavePolicy.create({
      name: "Sick Leave",
      annualDays: 12,
      excludeWeekends: false,
    });
    const adminRole = await Role.create({
      name: "Super Admin",
      permissions: ["*"],
    });
    const employeeRole = await Role.create({
      name: "Employee",
      permissions: [],
    });
    const password = randomBytes(20).toString("hex");
    const passwordHash = await argon2.hash(password);
    const employee = await Employee.create({
      code: "TEST-1",
      email: "employee@example.test",
      firstName: "Test",
      lastName: "Employee",
      department: "Engineering",
      designation: "Developer",
      joiningDate: new Date(),
    });
    await User.create([
      {
        email: "admin@example.test",
        name: "Test Admin",
        passwordHash,
        role: adminRole._id,
      },
      {
        email: "employee@example.test",
        name: "Test Employee",
        passwordHash,
        role: employeeRole._id,
        employee: employee._id,
      },
    ]);
    const app = createApp({ sessionStore: new session.MemoryStore() });
    const admin = request.agent(app),
      staff = request.agent(app);
    await t.test("unauthenticated access is denied", async () => {
      await request(app).get("/api/v1/employees").expect(401);
    });
    let adminToken, staffToken;
    await t.test("login requires CSRF and rotates the session", async () => {
      await admin
        .post("/api/v1/auth/login")
        .send({ email: "admin@example.test", password })
        .expect(403);
      const initial = (await admin.get("/api/v1/auth/csrf")).body.data.token;
      const login = await admin
        .post("/api/v1/auth/login")
        .set("x-csrf-token", initial)
        .send({ email: "admin@example.test", password })
        .expect(200);
      adminToken = login.body.data.csrfToken;
      assert.notEqual(adminToken, initial);
      const csrf = (await staff.get("/api/v1/auth/csrf")).body.data.token;
      staffToken = (
        await staff
          .post("/api/v1/auth/login")
          .set("x-csrf-token", csrf)
          .send({ email: "employee@example.test", password })
          .expect(200)
      ).body.data.csrfToken;
    });
    await t.test(
      "employee cannot enumerate or create employee records",
      async () => {
        await staff.get("/api/v1/employees").expect(403);
        await staff
          .post("/api/v1/employees")
          .set("x-csrf-token", staffToken)
          .send({})
          .expect(403);
        const me = await staff.get("/api/v1/employees/me").expect(200);
        assert.equal(me.body.data._id, employee.id);
      },
    );
    let created;
    await t.test(
      "admin creates, validates, searches and edits persistent employees",
      async () => {
        const input = {
          firstName: "New",
          lastName: "Joiner",
          email: "new@example.test",
          department: "Operations",
          designation: "Analyst",
          joiningDate: "2026-11-02",
        };
        await admin
          .post("/api/v1/employees")
          .set("x-csrf-token", adminToken)
          .send({ ...input, email: "invalid" })
          .expect(422);
        created = (
          await admin
            .post("/api/v1/employees")
            .set("x-csrf-token", adminToken)
            .send(input)
            .expect(201)
        ).body.data;
        await admin
          .post("/api/v1/employees")
          .set("x-csrf-token", adminToken)
          .send(input)
          .expect(409);
        assert.equal(
          (await admin.get("/api/v1/employees?search=New").expect(200)).body
            .meta.total,
          1,
        );
        await admin
          .patch(`/api/v1/employees/${created._id}`)
          .set("x-csrf-token", adminToken)
          .send({ designation: "Senior analyst" })
          .expect(200);
        assert.equal(
          (await Employee.findById(created._id)).designation,
          "Senior analyst",
        );
      },
    );
    await t.test(
      "punch retries retain one record and employee identity is session-derived",
      async () => {
        const first = (
          await staff
            .post("/api/v1/attendance/punch-in")
            .set("x-csrf-token", staffToken)
            .send({ employee: created._id })
            .expect(200)
        ).body.data;
        const second = (
          await staff
            .post("/api/v1/attendance/punch-in")
            .set("x-csrf-token", staffToken)
            .send({})
            .expect(200)
        ).body.data;
        assert.equal(first._id, second._id);
        assert.equal(first.employee, employee.id);
        assert.equal(await Attendance.countDocuments(), 1);
        const out = (
          await staff
            .post("/api/v1/attendance/punch-out")
            .set("x-csrf-token", staffToken)
            .send({})
            .expect(200)
        ).body.data;
        assert.ok(out.punchOut);
        assert.ok(out.workingMinutes >= 0);
        const retry = (
          await staff
            .post("/api/v1/attendance/punch-out")
            .set("x-csrf-token", staffToken)
            .send({})
            .expect(200)
        ).body.data;
        assert.equal(out.punchOut, retry.punchOut);
      },
    );
    await t.test(
      "leave submission rejects reversed intervals and binds owner",
      async () => {
        await staff
          .post("/api/v1/leaves")
          .set("x-csrf-token", staffToken)
          .send({
            type: "Sick Leave",
            startDate: leaveDate,
            endDate: "2026-11-02",
            reason: "Medical appointment",
          })
          .expect(422);
        const leave = (
          await staff
            .post("/api/v1/leaves")
            .set("x-csrf-token", staffToken)
            .send({
              type: "Sick Leave",
              startDate: leaveDate,
              endDate: leaveDate,
              reason: "Medical appointment",
              employee: created._id,
            })
            .expect(201)
        ).body.data;
        assert.equal(leave.employee, employee.id);
        assert.equal(leave.status, "Pending");
        await staff
          .post("/api/v1/leaves")
          .set("x-csrf-token", staffToken)
          .send({
            type: "Sick Leave",
            startDate: leaveDate,
            endDate: leaveDate,
            reason: "Duplicate medical request",
          })
          .expect(409);
        await staff
          .post(`/api/v1/leaves/${leave._id}/approve`)
          .set("x-csrf-token", staffToken)
          .send({})
          .expect(403);
        await admin
          .post(`/api/v1/leaves/${leave._id}/approve`)
          .set("x-csrf-token", adminToken)
          .send({})
          .expect(200);
        await admin
          .post(`/api/v1/leaves/${leave._id}/approve`)
          .set("x-csrf-token", adminToken)
          .send({})
          .expect(200);
        const balance = await LeaveBalance.findOne({ employee: employee._id });
        assert.equal(balance.used, 1);
        assert.equal(balance.reserved, 0);
        assert.equal(
          await LeaveLedger.countDocuments({
            request: leave._id,
            action: "Approve",
          }),
          1,
        );
        assert.equal(
          (
            await Attendance.findOne({
              employee: employee._id,
              date: leaveDate,
            })
          ).status,
          "On Leave",
        );
      },
    );
    await t.test(
      "one-time employee activation enables login and cannot escalate privileges",
      async () => {
        await staff
          .post(`/api/v1/employees/${created._id}/invite`)
          .set("x-csrf-token", staffToken)
          .send({})
          .expect(403);
        const invitation = await admin
          .post(`/api/v1/employees/${created._id}/invite`)
          .set("x-csrf-token", adminToken)
          .send({ role: adminRole.id })
          .expect(201);
        const token = new URL(
          invitation.body.data.activationPath,
          "http://localhost",
        ).searchParams.get("token");
        const newcomer = request.agent(app),
          csrf = (await newcomer.get("/api/v1/auth/csrf")).body.data.token;
        await newcomer
          .post("/api/v1/auth/activate")
          .set("x-csrf-token", csrf)
          .send({ token, password })
          .expect(200);
        await newcomer
          .post("/api/v1/auth/activate")
          .set("x-csrf-token", csrf)
          .send({ token, password })
          .expect(400);
        await newcomer
          .post("/api/v1/auth/login")
          .set("x-csrf-token", csrf)
          .send({ email: created.email, password })
          .expect(200);
        const me = (await newcomer.get("/api/v1/auth/me").expect(200)).body
          .data;
        assert.equal(me.role, "Employee");
        assert.deepEqual(me.permissions, []);
        await newcomer.get("/api/v1/employees").expect(403);
      },
    );
    await t.test(
      "organization records validate, persist and deactivate without deletion",
      async () => {
        await staff.get("/api/v1/organization/departments").expect(403);
        const record = (
          await admin
            .post("/api/v1/organization/departments")
            .set("x-csrf-token", adminToken)
            .send({ name: "Engineering", code: "eng" })
            .expect(201)
        ).body.data;
        assert.equal(record.code, "ENG");
        await admin
          .post("/api/v1/organization/departments")
          .set("x-csrf-token", adminToken)
          .send({ name: "Other", code: "eng" })
          .expect(409);
        await admin
          .post("/api/v1/organization/branches")
          .set("x-csrf-token", adminToken)
          .send({ name: "Office", code: "OFF", timezone: "Invalid/Zone" })
          .expect(422);
        await admin
          .post("/api/v1/organization/shifts")
          .set("x-csrf-token", adminToken)
          .send({ name: "Day shift", code: "DAY" })
          .expect(422);
        await admin
          .post(`/api/v1/organization/departments/${record._id}/deactivate`)
          .set("x-csrf-token", adminToken)
          .send({})
          .expect(200);
        const list = (await admin.get("/api/v1/organization/departments")).body
          .data;
        assert.equal(list.length, 1);
        assert.equal(list[0].active, false);
      },
    );
    await t.test(
      "archival disables an existing authenticated account",
      async () => {
        await admin
          .post(`/api/v1/employees/${employee.id}/archive`)
          .set("x-csrf-token", adminToken)
          .send({})
          .expect(200);
        await staff.get("/api/v1/auth/me").expect(401);
      },
    );
    await t.test("logout destroys server session", async () => {
      await admin
        .post("/api/v1/auth/logout")
        .set("x-csrf-token", adminToken)
        .send({})
        .expect(200);
      await admin.get("/api/v1/auth/me").expect(401);
    });
  } finally {
    // Only the explicitly generated test database is eligible for cleanup.
    assert.ok(/^abco_test_[a-f0-9]{32}$/.test(mongoose.connection.name));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
