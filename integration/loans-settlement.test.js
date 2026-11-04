import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import session from "express-session";
import request from "supertest";
import argon2 from "argon2";
import { randomBytes, randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
import { Role, User, Employee } from "../src/models.js";
import { Loan, LoanRecovery } from "../src/modules/payroll/loans.js";
import { PayrollEntry } from "../src/modules/payroll/models.js";
test("loan reservations post once, reopen safely and clear through final settlement", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-11-15T06:00:00Z"),
  });
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
    const roles = await Role.create([
      { name: "Super Admin", permissions: ["*"] },
      { name: "Reviewer", permissions: ["payroll.view", "payroll.approve"] },
      { name: "Employee", permissions: [], scope: "Own" },
    ]);
    const employee = await Employee.create({
      code: "LOAN-EMP",
      firstName: "Loan",
      lastName: "Employee",
      email: "worker@example.test",
      department: "Operations",
      designation: "Analyst",
      joiningDate: new Date("2025-01-01"),
    });
    const password = randomBytes(20).toString("hex"),
      hash = await argon2.hash(password);
    await User.create([
      {
        name: "Admin",
        email: "admin@example.test",
        role: roles[0]._id,
        passwordHash: hash,
      },
      {
        name: "Reviewer",
        email: "reviewer@example.test",
        role: roles[1]._id,
        passwordHash: hash,
      },
      {
        name: "Worker",
        email: employee.email,
        role: roles[2]._id,
        passwordHash: hash,
        employee: employee._id,
      },
    ]);
    const app = createApp({
      sessionStore: new session.MemoryStore(),
      logLevel: "error",
    });
    async function login(email) {
      const agent = request.agent(app),
        initial = (await agent.get("/api/v1/auth/csrf")).body.data.token;
      const csrf = (
        await agent
          .post("/api/v1/auth/login")
          .set("x-csrf-token", initial)
          .send({ email, password })
          .expect(200)
      ).body.data.csrfToken;
      return { agent, csrf };
    }
    const post = (actor, url, body = {}) =>
      actor.agent
        .post("/api/v1" + url)
        .set("x-csrf-token", actor.csrf)
        .send(body);
    let admin = await login("admin@example.test"),
      reviewer = await login("reviewer@example.test"),
      worker = await login("worker@example.test");
    const policy = (
      await post(admin, "/loan-policies", {
        name: "Test approved interest-free loan",
        type: "Loan",
        maximumAmount: "10000",
        maximumInstallments: 12,
        flatInterestBasisPoints: 0,
      }).expect(201)
    ).body.data;
    const loan = (
      await post(worker, "/loans", {
        policy: policy._id,
        amount: "1000",
        installments: 2,
        startMonth: "2026-11",
        reason: "Request under the configured test policy",
      }).expect(201)
    ).body.data;
    assert.equal(loan.installmentAmount, 50000);
    await post(reviewer, `/loans/${loan._id}/review`, {
      status: "Approved",
      note: "Checked against the approved policy",
    }).expect(200);
    await post(admin, `/loans/${loan._id}/disburse`, {
      paymentReference: "TEST-DISBURSE-1",
    }).expect(200);
    await post(admin, "/salary-structures", {
      employee: employee.id,
      effectiveDate: "2026-11-01",
      earnings: [{ name: "Basic", amount: "10000" }],
      deductions: [],
      employerContributions: [],
    }).expect(201);
    async function calculate(month) {
      const period = (
        await post(admin, "/payroll/periods", {
          month,
          payBasis: "Calendar days",
        }).expect(201)
      ).body.data;
      await post(admin, `/payroll/periods/${period._id}/calculate`).expect(200);
      return period;
    }
    async function release(period) {
      await post(admin, `/payroll/periods/${period._id}/submit`).expect(200);
      await post(reviewer, `/payroll/periods/${period._id}/approve`).expect(
        200,
      );
      await post(admin, `/payroll/periods/${period._id}/finalize`).expect(200);
    }
    t.mock.timers.setTime(new Date("2026-12-02T06:00:00Z").getTime());
    admin = await login("admin@example.test");
    reviewer = await login("reviewer@example.test");
    const first = await calculate("2026-11");
    let state = await Loan.findById(loan._id);
    assert.equal(state.reserved, 50000);
    assert.equal(state.repaid, 0);
    assert.equal(
      (await PayrollEntry.findOne({ period: first._id })).net,
      950000,
    );
    await post(admin, `/payroll/periods/${first._id}/reopen`, {
      reason: "Review the pending recovery reservation",
    }).expect(200);
    state = await Loan.findById(loan._id);
    assert.equal(state.reserved, 0);
    await post(admin, `/payroll/periods/${first._id}/calculate`).expect(200);
    await release(first);
    const archive = await admin.agent
      .get(`/api/v1/payroll/periods/${first._id}/payslips`)
      .buffer(true)
      .parse((res, done) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    assert.equal(archive.body.readUInt32LE(0), 0x04034b50);
    assert.equal(archive.body.subarray(-22).readUInt32LE(0), 0x06054b50);
    assert.equal(archive.body.subarray(-22).readUInt16LE(10), 1);
    assert.ok(archive.body.includes(Buffer.from("%PDF-")));
    worker = await login("worker@example.test");
    await worker.agent
      .get(`/api/v1/payroll/periods/${first._id}/payslips`)
      .expect(403);
    state = await Loan.findById(loan._id);
    assert.equal(state.reserved, 0);
    assert.equal(state.repaid, 50000);
    t.mock.timers.setTime(new Date("2027-01-02T06:00:00Z").getTime());
    admin = await login("admin@example.test");
    reviewer = await login("reviewer@example.test");
    worker = await login("worker@example.test");
    const second = await calculate("2026-12");
    await release(second);
    state = await Loan.findById(loan._id);
    assert.equal(state.status, "Closed");
    assert.equal(state.repaid, 100000);
    assert.equal(
      await LoanRecovery.countDocuments({ loan: loan._id, status: "Posted" }),
      2,
    );
    assert.equal(
      await LoanRecovery.countDocuments({ loan: loan._id, status: "Reversed" }),
      1,
    );
    const additional = (
      await post(worker, "/loans", {
        policy: policy._id,
        amount: "300",
        installments: 3,
        startMonth: "2027-01",
        reason: "A second loan under approved policy",
      }).expect(201)
    ).body.data;
    await post(reviewer, `/loans/${additional._id}/review`, {
      status: "Approved",
      note: "Approved after financial review",
    }).expect(200);
    await post(admin, `/loans/${additional._id}/disburse`, {
      paymentReference: "TEST-DISBURSE-2",
    }).expect(200);
    await admin.agent
      .patch("/api/v1/company-settings")
      .set("x-csrf-token", admin.csrf)
      .send({
        name: "ABCO Computers",
        timezone: "Asia/Kolkata",
        requireDailyReport: false,
        requireFinalSettlement: true,
        dailyReportDepartments: [],
      })
      .expect(200);
    const exit = (
      await post(worker, "/exits", {
        resignationDate: "2027-01-02",
        lastWorkingDate: "2027-01-02",
        reason: "A planned professional transition",
        separationType: "Resignation",
        handover: "Complete and document the operational handover",
      }).expect(201)
    ).body.data;
    for (const status of [
      "Under Review",
      "Approved",
      "Notice Period",
      "Clearance",
      "Settlement",
    ])
      await post(admin, `/exits/${exit._id}/transition`, {
        status,
        note: "Reviewed by the authorized HR administrator",
        handoverComplete: true,
        documentsComplete: true,
      }).expect(200);
    await post(admin, `/exits/${exit._id}/transition`, {
      status: "Completed",
      note: "Finance has not completed settlement yet",
      handoverComplete: true,
      documentsComplete: true,
      settlementReviewed: true,
    }).expect(409);
    const settlement = (
      await post(admin, "/final-settlements", {
        exit: exit._id,
        earnings: [{ name: "Approved final wages", amount: "1000" }],
        deductions: [],
        includeOutstandingLoans: true,
        includeApprovedEncashments: true,
        reason: "Configured final wage components and tracked loan clearance",
      }).expect(201)
    ).body.data;
    assert.equal(settlement.net, 70000);
    await post(admin, `/final-settlements/${settlement._id}/approve`).expect(
      403,
    );
    await post(reviewer, `/final-settlements/${settlement._id}/approve`).expect(
      200,
    );
    await post(admin, `/final-settlements/${settlement._id}/reopen`, {
      reason: "Independent review requested an updated settlement reference",
    }).expect(200);
    await post(admin, `/final-settlements/${settlement._id}/pay`, {
      paymentReference: "MUST-NOT-PAY-DRAFT",
    }).expect(409);
    await post(reviewer, `/final-settlements/${settlement._id}/approve`).expect(
      200,
    );
    await post(admin, `/final-settlements/${settlement._id}/pay`, {
      paymentReference: "TEST-SETTLEMENT-1",
    }).expect(200);
    assert.equal((await Loan.findById(additional._id)).status, "Closed");
    await post(admin, `/exits/${exit._id}/transition`, {
      status: "Completed",
      note: "Final settlement reviewed and payment recorded",
      handoverComplete: true,
      documentsComplete: true,
      settlementReviewed: true,
    }).expect(200);
    await worker.agent.get("/api/v1/auth/me").expect(401);
  } finally {
    assert.ok(/^abco_test_[a-f\d]{32}$/.test(mongoose.connection.name));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    t.mock.timers.reset();
  }
});
