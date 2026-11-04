import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import session from "express-session";
import request from "supertest";
import argon2 from "argon2";
import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import { rm } from "node:fs/promises";
import { createApp } from "../src/app.js";
import {
  Role,
  User,
  Employee,
  LeavePolicy,
  LeaveBalance,
  Attendance,
} from "../src/models.js";
import { PayrollEntry } from "../src/modules/payroll/models.js";
import { BankAccount, PayrollArchive } from "../src/modules/payroll/finance.js";
import { Notification } from "../src/modules/operations/models.js";
import { Document } from "../src/modules/documents/routes.js";
import { Job, Candidate } from "../src/modules/hr/models.js";
import { workDate } from "../src/security.js";
test("advanced leave, financial snapshots, documents, imports and reminders", async (t) => {
  process.env.NODE_ENV = "test";
  process.env.SESSION_SECRET = randomBytes(32).toString("hex");
  process.env.DOCUMENT_KEY = randomBytes(32).toString("hex");
  const dbName = `abco_test_${randomUUID().replaceAll("-", "")}`,
    storage = path.resolve("storage", dbName);
  process.env.DOCUMENT_STORAGE_PATH = storage;
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
      { name: "Employee", permissions: [], scope: "Own" },
      {
        name: "Reviewer",
        permissions: [
          "payroll.view",
          "payroll.approve",
          "performance.approve",
          "expenses.approve",
          "expenses.pay",
        ],
      },
    ]);
    const employees = await Employee.create([
      {
        code: "WORKER",
        firstName: "Worker",
        lastName: "One",
        email: "worker@example.test",
        department: "Engineering",
        designation: "Developer",
        joiningDate: new Date("2025-01-01"),
      },
      {
        code: "PEER",
        firstName: "Peer",
        lastName: "Reviewer",
        email: "peer@example.test",
        department: "Engineering",
        designation: "Engineer",
        joiningDate: new Date("2025-01-01"),
      },
    ]);
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
        name: "Worker",
        email: employees[0].email,
        role: roles[1]._id,
        passwordHash: hash,
        employee: employees[0]._id,
      },
      {
        name: "Peer",
        email: employees[1].email,
        role: roles[1]._id,
        passwordHash: hash,
        employee: employees[1]._id,
      },
      {
        name: "Reviewer",
        email: "reviewer@example.test",
        role: roles[2]._id,
        passwordHash: hash,
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
    const admin = await login("admin@example.test"),
      worker = await login("worker@example.test"),
      peer = await login("peer@example.test"),
      reviewer = await login("reviewer@example.test");
    const post = (actor, url, body = {}) =>
        actor.agent
          .post("/api/v1" + url)
          .set("x-csrf-token", actor.csrf)
          .send(body),
      today = workDate();
    await t.test(
      "CSV import validates first and rolls back duplicates without partial employees",
      async () => {
        const header =
            "firstName,lastName,email,department,designation,joiningDate\n",
          csv =
            header +
            "Imported,Colleague,imported@example.test,Operations,Analyst,2026-01-01\n";
        const preview = await admin.agent
          .post("/api/v1/employees/import?preview=true")
          .set("x-csrf-token", admin.csrf)
          .attach("file", Buffer.from(csv), "employees.csv")
          .expect(200);
        assert.equal(preview.body.data.rows, 1);
        assert.equal(
          await Employee.countDocuments({ email: "imported@example.test" }),
          0,
        );
        await admin.agent
          .post("/api/v1/employees/import")
          .set("x-csrf-token", admin.csrf)
          .attach("file", Buffer.from(csv), "employees.csv")
          .expect(201);
        const duplicate =
          header +
          "Never,Created,new@example.test,Operations,Analyst,2026-01-01\nImported,Colleague,imported@example.test,Operations,Analyst,2026-01-01\n";
        await admin.agent
          .post("/api/v1/employees/import")
          .set("x-csrf-token", admin.csrf)
          .attach("file", Buffer.from(duplicate), "employees.csv")
          .expect(422);
        assert.equal(
          await Employee.countDocuments({ email: "new@example.test" }),
          0,
        );
        await worker.agent
          .post("/api/v1/employees/import")
          .set("x-csrf-token", worker.csrf)
          .attach("file", Buffer.from(csv), "employees.csv")
          .expect(403);
      },
    );
    await t.test(
      "half-day leave reserves half a day and permits the other half attendance",
      async () => {
        const policy = (
          await post(admin, "/leave-policies", {
            name: "Half-day policy",
            annualDays: 12,
            excludeWeekends: false,
            halfDayAllowed: true,
            encashmentAllowed: true,
          }).expect(201)
        ).body.data;
        const leave = (
          await post(worker, "/leaves", {
            type: policy.name,
            startDate: today,
            endDate: today,
            halfDay: true,
            halfDayPeriod: "Morning",
            reason: "A scheduled personal appointment",
          }).expect(201)
        ).body.data;
        assert.equal(leave.days, 0.5);
        await post(admin, `/leaves/${leave._id}/approve`).expect(200);
        const balance = await LeaveBalance.findOne({
          employee: employees[0]._id,
          policy: policy._id,
        });
        assert.equal(balance.used, 0.5);
        const attendance = (
          await post(worker, "/attendance/punch-in").expect(200)
        ).body.data;
        assert.equal(attendance.leaveFraction, 0.5);
        assert.ok(attendance.punchIn);
        await post(worker, "/attendance/punch-out").expect(200);
        const change = (
          await post(admin, "/leave-adjustments", {
            employee: employees[0].id,
            policy: policy._id,
            year: Number(today.slice(0, 4)),
            days: 1,
            reason: "Approved opening balance correction",
          }).expect(201)
        ).body.data;
        assert.equal(change.status, "Posted");
        const cash = (
          await post(worker, "/leave-encashments", {
            policy: policy._id,
            year: Number(today.slice(0, 4)),
            days: 1,
            reason: "Request approved policy encashment",
          }).expect(201)
        ).body.data;
        await post(admin, `/leave-encashments/${cash._id}/review`, {
          status: "Approved",
          amount: "500",
          reason: "Approved against the configured company policy",
        }).expect(200);
        await post(admin, `/leave-encashments/${cash._id}/pay`, {
          paymentReference: "TEST-CASH-001",
        }).expect(200);
      },
    );
    await t.test(
      "bank values stay encrypted and payroll reopening preserves calculation history",
      async () => {
        await worker.agent
          .put("/api/v1/employees/me/bank-details")
          .set("x-csrf-token", worker.csrf)
          .send({
            holder: "Worker One",
            bankName: "Test Bank",
            accountNumber: "0123456789",
            routingCode: "TEST0001234",
          })
          .expect(200);
        const bank = (
          await worker.agent.get("/api/v1/employees/me/bank-details")
        ).body.data;
        assert.equal(bank.encrypted, undefined);
        assert.ok(bank.maskedAccount.endsWith("6789"));
        const raw = await BankAccount.findOne({
          employee: employees[0]._id,
        }).select("+encrypted");
        assert.ok(!raw.encrypted.includes("0123456789"));
        const now = new Date(),
          month = new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
          )
            .toISOString()
            .slice(0, 7);
        await post(admin, "/salary-structures", {
          employee: employees[0].id,
          effectiveDate: month + "-01",
          earnings: [{ name: "Basic", amount: "10000" }],
          deductions: [],
          employerContributions: [],
        }).expect(201);
        const adjustment = (
          await post(admin, "/payroll-adjustments", {
            employee: employees[0].id,
            month,
            category: "Bonus",
            name: "Approved bonus",
            type: "Earning",
            amount: "1000",
            reason: "Approved one-off compensation adjustment",
          }).expect(201)
        ).body.data;
        await post(admin, `/payroll-adjustments/${adjustment._id}/review`, {
          status: "Approved",
        }).expect(403);
        await post(reviewer, `/payroll-adjustments/${adjustment._id}/review`, {
          status: "Approved",
        }).expect(200);
        const period = (
          await post(admin, "/payroll/periods", {
            month,
            payBasis: "Calendar days",
          }).expect(201)
        ).body.data;
        await post(admin, `/payroll/periods/${period._id}/calculate`).expect(
          200,
        );
        assert.equal(
          (await PayrollEntry.findOne({ period: period._id })).net,
          1100000,
        );
        await post(admin, `/payroll/periods/${period._id}/reopen`, {
          reason: "Recheck the calculation inputs",
        }).expect(200);
        assert.equal(
          await PayrollArchive.countDocuments({ period: period._id }),
          1,
        );
        assert.equal(
          await PayrollEntry.countDocuments({ period: period._id }),
          0,
        );
        await post(admin, `/payroll/periods/${period._id}/calculate`).expect(
          200,
        );
        const entry = await PayrollEntry.findOne({ period: period._id });
        assert.equal(entry.version, 2);
        assert.equal(entry.net, 1100000);
        await post(admin, `/payroll/periods/${period._id}/submit`).expect(200);
        await post(reviewer, `/payroll/periods/${period._id}/approve`).expect(
          200,
        );
        await post(admin, `/payroll/periods/${period._id}/finalize`).expect(
          200,
        );
        await post(admin, `/payroll/periods/${period._id}/reopen`, {
          reason: "Released payroll is immutable",
        }).expect(409);
        const statement = await admin.agent
          .get(`/api/v1/payroll/periods/${period._id}/bank-statement`)
          .expect(200);
        assert.match(statement.text, /0123456789/);
        await worker.agent
          .get(`/api/v1/payroll/periods/${period._id}/bank-statement`)
          .expect(403);
      },
    );
    await t.test(
      "templates, private task attachments and resumes generate authorized files",
      async () => {
        const template = (
          await post(admin, "/document-templates", {
            name: "Approved offer wording",
            kind: "Offer",
            body: "Dear {{employeeName}},\nYour designation is {{designation}} at {{companyName}}.\nDate: {{date}}",
          }).expect(201)
        ).body.data;
        await post(admin, "/generated-letters", {
          template: template._id,
          employee: employees[0].id,
        }).expect(201);
        const letter = (await admin.agent.get("/api/v1/generated-letters")).body
          .data[0];
        assert.equal(letter.category, "Offer Letter");
        const link = (await post(worker, `/documents/${letter._id}/access`))
          .body.data.url;
        await worker.agent.get(link).expect(200);
        const task = (
          await post(admin, "/tasks", {
            title: "Private attached task",
            description: "Task with an employee-owned attachment",
            employee: employees[0].id,
            startDate: today,
            dueDate: today,
          }).expect(201)
        ).body.data;
        const pdf = Buffer.from(
          "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF",
        );
        await worker.agent
          .post(`/api/v1/tasks/${task._id}/attachments`)
          .set("x-csrf-token", worker.csrf)
          .field("name", "Work evidence")
          .attach("file", pdf, "work.pdf")
          .expect(201);
        const files = (
          await worker.agent.get(`/api/v1/tasks/${task._id}/attachments`)
        ).body.data;
        assert.equal(files.length, 1);
        await peer.agent
          .get(`/api/v1/tasks/${task._id}/attachments`)
          .expect(404);
        const job = await Job.create({
            title: "Engineer",
            department: "Engineering",
            status: "Open",
          }),
          candidate = await Candidate.create({
            name: "Candidate One",
            email: "candidate@example.test",
            job: job._id,
            status: "Selected",
          });
        await admin.agent
          .post(`/api/v1/recruitment/candidates/${candidate.id}/resume`)
          .set("x-csrf-token", admin.csrf)
          .attach("file", pdf, "resume.pdf")
          .expect(201);
        const resume = (
          await post(
            admin,
            `/recruitment/candidates/${candidate.id}/resume/access`,
          ).expect(200)
        ).body.data.url;
        await admin.agent.get(resume).expect(200);
        await post(
          worker,
          `/recruitment/candidates/${candidate.id}/resume/access`,
        ).expect(403);
      },
    );
    await t.test(
      "finance can read a submitted receipt but cannot access unrelated private documents",
      async () => {
        const pdf = Buffer.from("%PDF-1.4\n%%EOF");
        const receipt = (
          await worker.agent
            .post("/api/v1/documents")
            .set("x-csrf-token", worker.csrf)
            .field("name", "Business receipt")
            .field("category", "Other Records")
            .attach("file", pdf, "receipt.pdf")
            .expect(201)
        ).body.data;
        await post(reviewer, `/documents/${receipt._id}/access`).expect(403);
        const policy = (
          await post(admin, "/expense-policies", {
            name: "Receipt-required category",
            maximumAmount: "1000",
            receiptRequired: true,
            effectiveFrom: today,
          }).expect(201)
        ).body.data;
        await post(worker, "/expenses", {
          policy: policy._id,
          title: "Missing receipt",
          date: today,
          amount: "100",
          description: "Policy requires an uploaded receipt",
        }).expect(422);
        const claim = (
          await post(worker, "/expenses", {
            policy: policy._id,
            title: "Supported claim",
            date: today,
            amount: "100",
            description: "Claim backed by a private receipt",
            receipt: receipt._id,
          }).expect(201)
        ).body.data;
        await post(reviewer, `/documents/${receipt._id}/access`).expect(403);
        await post(worker, `/expenses/${claim._id}/submit`).expect(200);
        await post(reviewer, `/documents/${receipt._id}/access`).expect(200);
      },
    );
    await t.test(
      "calendar data is scoped and exports are valid Excel and PDF files",
      async () => {
        const calendar = (
          await worker.agent
            .get(`/api/v1/calendar?month=${today.slice(0, 7)}&kind=Attendance`)
            .expect(200)
        ).body.data;
        assert.equal(calendar.kind, "Attendance");
        assert.ok(calendar.events.some((event) => event.date === today));
        const binary = (res, callback) => {
          const parts = [];
          res.on("data", (part) => parts.push(part));
          res.on("end", () => callback(null, Buffer.concat(parts)));
        };
        const excel = await admin.agent
          .get("/api/v1/reports/employees?format=xlsx")
          .buffer(true)
          .parse(binary)
          .expect(200);
        assert.equal(excel.body.subarray(0, 2).toString(), "PK");
        const pdf = await admin.agent
          .get("/api/v1/reports/employees?format=pdf")
          .buffer(true)
          .parse(binary)
          .expect(200);
        assert.equal(pdf.body.subarray(0, 5).toString(), "%PDF-");
      },
    );
    await t.test(
      "configured reminders are deduplicated and preferences are enforced",
      async () => {
        await admin.agent
          .patch("/api/v1/company-settings")
          .set("x-csrf-token", admin.csrf)
          .send({
            name: "ABCO Computers",
            timezone: "Asia/Kolkata",
            requireDailyReport: false,
            remindersEnabled: true,
            reminderLeadDays: 3,
            dailyReportDepartments: [],
          })
          .expect(200);
        await post(admin, "/reminders/run").expect(200);
        const count = await Notification.countDocuments();
        await post(admin, "/reminders/run").expect(200);
        assert.equal(await Notification.countDocuments(), count);
        await worker.agent
          .patch("/api/v1/notification-preferences")
          .set("x-csrf-token", worker.csrf)
          .send({ inApp: false, email: false })
          .expect(200);
        assert.equal(
          (await worker.agent.get("/api/v1/notification-preferences")).body.data
            .inApp,
          false,
        );
      },
    );
  } finally {
    assert.ok(/^abco_test_[a-f\d]{32}$/.test(mongoose.connection.name));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    assert.equal(path.dirname(storage), path.resolve("storage"));
    await rm(storage, { recursive: true, force: true });
  }
});
