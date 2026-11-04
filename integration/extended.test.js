import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import session from "express-session";
import request from "supertest";
import argon2 from "argon2";
import { randomBytes, randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
import {
  Role,
  User,
  Employee,
  LeavePolicy,
  LeaveBalance,
  LeaveLedger,
} from "../src/models.js";
import { ApprovalCase } from "../src/modules/approvals/index.js";
import { workDate } from "../src/security.js";
test("projects, learning, reimbursement, engagement and multi-level approvals", async (t) => {
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
      {
        name: "Manager",
        permissions: ["leave.approve", "employee.read"],
        scope: "Direct reports",
      },
      { name: "Employee", permissions: [], scope: "Own" },
    ]);
    const employees = await Employee.create([
      {
        code: "MGR",
        firstName: "Manager",
        lastName: "One",
        email: "manager@example.test",
        department: "Engineering",
        designation: "Manager",
        joiningDate: new Date("2025-01-01"),
      },
      {
        code: "EMP",
        firstName: "Employee",
        lastName: "One",
        email: "employee@example.test",
        department: "Engineering",
        designation: "Developer",
        joiningDate: new Date("2025-01-01"),
      },
      {
        code: "OTHER",
        firstName: "Other",
        lastName: "Person",
        email: "other@example.test",
        department: "Operations",
        designation: "Analyst",
        joiningDate: new Date("2025-01-01"),
      },
    ]);
    employees[1].manager = employees[0]._id;
    await employees[1].save();
    const password = randomBytes(20).toString("hex"),
      passwordHash = await argon2.hash(password);
    await User.create([
      {
        name: "Admin",
        email: "admin@example.test",
        passwordHash,
        role: roles[0]._id,
      },
      {
        name: "Manager",
        email: employees[0].email,
        passwordHash,
        role: roles[1]._id,
        employee: employees[0]._id,
      },
      {
        name: "Employee",
        email: employees[1].email,
        passwordHash,
        role: roles[2]._id,
        employee: employees[1]._id,
      },
      {
        name: "Other",
        email: employees[2].email,
        passwordHash,
        role: roles[2]._id,
        employee: employees[2]._id,
      },
    ]);
    const app = createApp({ sessionStore: new session.MemoryStore() });
    async function login(email) {
      const agent = request.agent(app);
      const initial = (await agent.get("/api/v1/auth/csrf")).body.data.token;
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
      manager = await login("manager@example.test"),
      employee = await login("employee@example.test"),
      other = await login("other@example.test");
    const post = (actor, url, body = {}) =>
        actor.agent
          .post("/api/v1" + url)
          .set("x-csrf-token", actor.csrf)
          .send(body),
      today = workDate();
    await t.test(
      "multi-level leave approval reserves once and posts only at the final step",
      async () => {
        await post(admin, "/approval-workflows", {
          name: "Manager then HR",
          module: "Leave",
          steps: [
            { type: "Reporting Manager", escalationHours: 24 },
            { type: "Role", role: roles[0].id, escalationHours: 48 },
          ],
        }).expect(201);
        await LeavePolicy.create({
          name: "Configured leave",
          annualDays: 20,
          excludeWeekends: false,
        });
        const future = new Date();
        future.setUTCDate(future.getUTCDate() + 2);
        const day = future.toISOString().slice(0, 10);
        const leave = (
          await post(employee, "/leaves", {
            type: "Configured leave",
            startDate: day,
            endDate: day,
            reason: "Planned personal appointment",
          }).expect(201)
        ).body.data;
        await post(admin, `/leaves/${leave._id}/approve`).expect(403);
        const first = (
          await post(manager, `/leaves/${leave._id}/approve`).expect(200)
        ).body.data;
        assert.equal(first.status, "Pending");
        assert.equal(
          await LeaveLedger.countDocuments({
            request: leave._id,
            action: "Approve",
          }),
          0,
        );
        await post(manager, `/leaves/${leave._id}/approve`).expect(200);
        const final = (
          await post(admin, `/leaves/${leave._id}/approve`).expect(200)
        ).body.data;
        assert.equal(final.status, "Approved");
        const balance = await LeaveBalance.findOne({
          employee: employees[1]._id,
        });
        assert.equal(balance.used, 1);
        assert.equal(balance.reserved, 0);
        const approval = await ApprovalCase.findOne({ resource: leave._id });
        assert.equal(approval.history.length, 2);
        assert.equal(approval.status, "Approved");
      },
    );
    await t.test(
      "projects restrict participants and timesheets enforce daily limits and independent review",
      async () => {
        const project = (
          await post(admin, "/projects", {
            name: "Delivery project",
            code: "DEL",
            description: "Build a connected operations platform",
            department: "Engineering",
            employees: [employees[1].id],
            startDate: today,
            endDate: today,
          }).expect(201)
        ).body.data;
        await post(admin, `/projects/${project._id}/status`, {
          status: "Active",
        }).expect(200);
        assert.equal(
          (await other.agent.get("/api/v1/projects")).body.data.length,
          0,
        );
        await post(other, "/timesheets", {
          project: project._id,
          date: today,
          minutes: 60,
          billable: true,
          description: "Not assigned to this project",
        }).expect(422);
        const entry = (
          await post(employee, "/timesheets", {
            project: project._id,
            date: today,
            minutes: 120,
            billable: true,
            description: "Delivered the reporting feature",
          }).expect(201)
        ).body.data;
        await post(employee, "/timesheets", {
          project: project._id,
          date: today,
          minutes: 1400,
          billable: false,
          description: "Exceeds daily working time",
        }).expect(422);
        await post(employee, `/timesheets/${entry._id}/submit`).expect(200);
        await post(admin, `/timesheets/${entry._id}/review`, {
          status: "Approved",
          note: "Reviewed and accepted",
        }).expect(200);
        const overview = (
          await admin.agent
            .get(`/api/v1/projects/${project._id}/overview`)
            .expect(200)
        ).body.data;
        assert.equal(overview.billableMinutes, 120);
      },
    );
    await t.test(
      "training enrollment records attendance, progress, assessment and skill gaps",
      async () => {
        const training = (
          await post(admin, "/training", {
            title: "Secure development",
            course: "Application security",
            description: "Practice secure engineering workflows",
            skills: ["API security"],
            trainer: "Internal trainer",
            startDate: today,
            endDate: today,
          }).expect(201)
        ).body.data;
        await post(admin, `/training/${training._id}/status`, {
          status: "Active",
        }).expect(200);
        const enrollment = (
          await post(admin, `/training/${training._id}/assign`, {
            employee: employees[1].id,
          }).expect(201)
        ).body.data;
        await post(
          employee,
          `/training-enrollments/${enrollment._id}/attendance`,
        ).expect(200);
        await post(other, `/training-enrollments/${enrollment._id}/progress`, {
          progress: 50,
        }).expect(404);
        await post(
          employee,
          `/training-enrollments/${enrollment._id}/progress`,
          { progress: 80, feedback: "Useful practical exercises" },
        ).expect(200);
        await post(admin, `/training-enrollments/${enrollment._id}/complete`, {
          assessmentScore: 90,
        }).expect(200);
        const skill = (
          await post(admin, "/skills", {
            employee: employees[1].id,
            name: "API security",
            level: 3,
            targetLevel: 4,
          }).expect(201)
        ).body.data;
        assert.equal(skill.targetLevel - skill.level, 1);
      },
    );
    await t.test(
      "explicit reimbursement policy and travel settlement connect without fake payments",
      async () => {
        const policy = (
          await post(admin, "/expense-policies", {
            name: "Approved business travel",
            maximumAmount: "5000",
            receiptRequired: false,
            effectiveFrom: today,
          }).expect(201)
        ).body.data;
        const trip = (
          await post(employee, "/travel", {
            destination: "Client office",
            purpose: "Approved customer workshop",
            startDate: today,
            endDate: today,
            itinerary: "Visit the customer office for the workshop",
            advanceRequested: "1000",
          }).expect(201)
        ).body.data;
        await post(admin, `/travel/${trip._id}/review`, {
          status: "Approved",
          note: "Business trip approved",
        }).expect(200);
        await post(admin, `/travel/${trip._id}/advance`, {
          amount: "500",
          paymentReference: "ADV-TEST-001",
        }).expect(200);
        await post(employee, `/travel/${trip._id}/start`).expect(200);
        await post(employee, "/expenses", {
          policy: policy._id,
          title: "Over limit claim",
          date: today,
          amount: "6000",
          description: "Reject an amount above the configured limit",
        }).expect(422);
        const expense = (
          await post(employee, "/expenses", {
            policy: policy._id,
            title: "Travel costs",
            date: today,
            amount: "800",
            description: "Approved ground transport costs",
            travel: trip._id,
          }).expect(201)
        ).body.data;
        await post(employee, `/expenses/${expense._id}/submit`).expect(200);
        await post(employee, `/expenses/${expense._id}/pay`, {
          paymentReference: "NO",
        }).expect(403);
        await post(admin, `/expenses/${expense._id}/review`, {
          status: "Approved",
          note: "Receipts and policy checked",
        }).expect(200);
        await post(admin, `/expenses/${expense._id}/pay`, {
          paymentReference: "REIMB-TEST-001",
        }).expect(200);
        await post(employee, `/travel/${trip._id}/submit-settlement`).expect(
          200,
        );
        const settled = (
          await post(admin, `/travel/${trip._id}/settle`, {
            paymentReference: "SETTLEMENT-TEST-001",
          }).expect(200)
        ).body.data;
        assert.equal(settled.status, "Settled");
        assert.equal(settled.actualExpenses, 80000);
        assert.equal(settled.balance, 30000);
      },
    );
    await t.test(
      "survey responses are one per employee and anonymous result payloads omit identity",
      async () => {
        const survey = (
          await post(admin, "/surveys", {
            title: "Workplace feedback",
            description: "Share your perspective on our workplace",
            department: "Engineering",
            anonymous: true,
            opensAt: new Date(Date.now() - 10000).toISOString(),
            closesAt: new Date(Date.now() + 3600000).toISOString(),
            questions: [
              { title: "How satisfied are you?", type: "Rating" },
              { title: "What could improve?", type: "Text" },
            ],
          }).expect(201)
        ).body.data;
        await post(admin, `/surveys/${survey._id}/status`, {
          status: "Published",
        }).expect(200);
        const answers = [
          { question: 0, rating: 4 },
          { question: 1, text: "More peer learning opportunities" },
        ];
        await post(other, `/surveys/${survey._id}/respond`, { answers }).expect(
          404,
        );
        await post(employee, `/surveys/${survey._id}/respond`, {
          answers,
        }).expect(201);
        await post(employee, `/surveys/${survey._id}/respond`, {
          answers,
        }).expect(409);
        const results = (
          await admin.agent
            .get(`/api/v1/surveys/${survey._id}/results`)
            .expect(200)
        ).body.data;
        assert.equal(results.count, 1);
        assert.equal(results.responses[0].employee, undefined);
        assert.equal(results.ratings[0].average, 4);
        const recognition = (
          await post(admin, "/recognitions", {
            employee: employees[1].id,
            title: "Great collaboration",
            message: "Thank you for supporting the whole team",
            reward: "Team recognition",
          }).expect(201)
        ).body.data;
        assert.equal(recognition.title, "Great collaboration");
        const idea = (
          await post(employee, "/suggestions", {
            title: "Peer learning sessions",
            category: "Learning",
            body: "Start a weekly session for knowledge sharing",
          }).expect(201)
        ).body.data;
        await post(admin, `/suggestions/${idea._id}/review`, {
          status: "Accepted",
          note: "We will plan the first session",
        }).expect(200);
      },
    );
  } finally {
    assert.ok(/^abco_test_[a-f\d]{32}$/.test(mongoose.connection.name));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
