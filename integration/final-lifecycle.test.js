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
  Organization,
  Attendance,
  LeaveBalance,
} from "../src/models.js";
import { ShiftAssignment } from "../src/modules/attendance/models.js";
import {
  ShiftOverride,
  resolveShift,
} from "../src/modules/attendance/swaps.js";
import { AssetMaintenance } from "../src/modules/hr/assets.js";
import { Asset } from "../src/modules/hr/models.js";
import {
  ApprovalWorkflow,
  ApprovalCase,
} from "../src/modules/approvals/index.js";
import {
  CompanySettings,
  Notification,
} from "../src/modules/operations/models.js";
import { runReminders } from "../src/modules/operations/reminders.js";

test("final workflows preserve schedules, maintenance history, peer privacy and leave balances", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-11-02T03:00:00Z"),
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
    const [adminRole, employeeRole, reviewerRole] = await Role.create([
      { name: "Super Admin", permissions: ["*"] },
      { name: "Employee", permissions: [], scope: "Own" },
      {
        name: "Independent reviewer",
        permissions: ["performance.approve", "payroll.approve"],
      },
    ]);
    const employees = await Employee.create(
      ["Alice", "Bob", "Carol"].map((firstName, i) => ({
        code: `FINAL-${i}`,
        firstName,
        lastName: "Tester",
        email: `worker${i}@example.test`,
        department: "Operations",
        designation: "Analyst",
        branch: "Head office",
        joiningDate: new Date("2025-01-01"),
      })),
    );
    const password = randomBytes(20).toString("hex"),
      passwordHash = await argon2.hash(password);
    await User.create([
      {
        name: "Admin",
        email: "admin@example.test",
        role: adminRole._id,
        passwordHash,
      },
      {
        name: "Reviewer",
        email: "reviewer@example.test",
        role: reviewerRole._id,
        passwordHash,
      },
      ...employees.map((e) => ({
        name: e.firstName,
        email: e.email,
        role: employeeRole._id,
        employee: e._id,
        passwordHash,
      })),
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
      reviewer = await login("reviewer@example.test"),
      alice = await login(employees[0].email),
      bob = await login(employees[1].email),
      carol = await login(employees[2].email);
    const post = (actor, url, body = {}) =>
      actor.agent
        .post("/api/v1" + url)
        .set("x-csrf-token", actor.csrf)
        .send(body);
    await admin.agent
      .patch("/api/v1/company-settings")
      .set("x-csrf-token", admin.csrf)
      .send({
        name: "ABCO Computers",
        timezone: "Asia/Kolkata",
        requireDailyReport: false,
        allowShiftSwaps: true,
        dailyReportDepartments: [],
      })
      .expect(200);
    await t.test(
      "shift swaps require colleague consent and do not rewrite assigned shifts",
      async () => {
        const shifts = await Organization.create([
          {
            kind: "shifts",
            code: "MORNING",
            name: "Morning",
            startTime: "09:00",
            endTime: "17:00",
          },
          {
            kind: "shifts",
            code: "AFTERNOON",
            name: "Afternoon",
            startTime: "13:00",
            endTime: "21:00",
          },
        ]);
        await ShiftAssignment.create(
          employees.slice(0, 2).map((e, i) => ({
            employee: e._id,
            shift: shifts[i]._id,
            effectiveFrom: "2026-11-01",
            timezone: "Asia/Kolkata",
            startTime: i ? "13:00" : "09:00",
            endTime: i ? "21:00" : "17:00",
            graceMinutes: 10,
            fullDayMinutes: 480,
            halfDayMinutes: 240,
            weeklyOffDays: [0],
          })),
        );
        const swap = (
          await post(alice, "/shift-swaps", {
            otherEmployee: employees[1].id,
            date: "2026-11-03",
            reason: "Exchange the two planned workday schedules",
          }).expect(201)
        ).body.data;
        await post(admin, `/shift-swaps/${swap._id}/review`, {
          approve: true,
          reason: "Independent review of the request",
        }).expect(409);
        await post(carol, `/shift-swaps/${swap._id}/respond`, {
          accept: true,
          reason: "Trying another employee request",
        }).expect(403);
        await post(bob, `/shift-swaps/${swap._id}/respond`, {
          accept: true,
          reason: "I consent to exchange this workday",
        }).expect(200);
        await post(admin, `/shift-swaps/${swap._id}/review`, {
          approve: true,
          reason: "Approved with colleague consent",
        }).expect(200);
        assert.equal(
          (await resolveShift(employees[0], new Date("2026-11-03T09:00:00Z")))
            .assignment.startTime,
          "13:00",
        );
        const calendar = await alice.agent
          .get("/api/v1/calendar?month=2026-11&kind=Shifts")
          .expect(200);
        assert.ok(
          calendar.body.data.events.some(
            (e) => e.date === "2026-11-03" && e.title.includes("13:00"),
          ),
        );
        await post(admin, `/shift-swaps/${swap._id}/reverse`, {
          reason: "Both colleagues requested the original schedule",
        }).expect(200);
        assert.equal(
          await ShiftOverride.countDocuments({ swap: swap._id, active: true }),
          0,
        );
        assert.equal(await ShiftOverride.countDocuments({ swap: swap._id }), 2);
        assert.equal(
          (await resolveShift(employees[0], new Date("2026-11-03T09:00:00Z")))
            .assignment.startTime,
          "09:00",
        );
      },
    );
    await t.test(
      "concurrent maintenance creates one open repair and retains completed records",
      async () => {
        const asset = await Asset.create({
          name: "Test laptop",
          category: "Laptop",
          serial: "FINAL-ASSET",
          condition: "Good",
        });
        const payload = {
          asset: asset.id,
          description: "Inspect the charging port and power adapter",
          startDate: "2026-11-02",
        };
        const results = await Promise.all([
          post(admin, "/asset-maintenance", payload),
          post(admin, "/asset-maintenance", payload),
        ]);
        assert.equal(results.filter((r) => r.status === 201).length, 1);
        assert.ok(results.some((r) => r.status === 409));
        const record = await AssetMaintenance.findOne({
          asset: asset._id,
          status: "Open",
        });
        assert.ok(record);
        await post(admin, `/asset-maintenance/${record.id}/complete`, {
          endDate: "2026-11-01",
          resolution: "Earlier date must not be accepted",
          condition: "Good",
        }).expect(422);
        await post(admin, `/asset-maintenance/${record.id}/complete`, {
          endDate: "2026-11-03",
          resolution: "Replaced and verified the charging adapter",
          condition: "Good",
        }).expect(200);
        assert.equal((await Asset.findById(asset.id)).status, "Available");
        assert.equal(
          (await AssetMaintenance.findById(record.id)).status,
          "Completed",
        );
        await post(alice, "/asset-maintenance", payload).expect(403);
      },
    );
    await t.test(
      "peer feedback, improvement plans and recommendations enforce actor boundaries",
      async () => {
        const review = (
          await post(admin, "/performance", {
            employee: employees[0].id,
            title: "Quarterly performance review",
            startDate: "2026-10-01",
            endDate: "2026-12-31",
            goals: [
              { title: "Deliver agreed project milestones", weight: 100 },
            ],
          }).expect(201)
        ).body.data;
        const feedback = (
          await post(admin, "/peer-feedback", {
            review: review._id,
            reviewer: employees[1].id,
          }).expect(201)
        ).body.data;
        assert.equal(
          (await carol.agent.get("/api/v1/peer-feedback").expect(200)).body.data
            .length,
          0,
        );
        await post(carol, `/peer-feedback/${feedback._id}/respond`, {
          rating: 4,
          feedback: "Unauthorized feedback must not be accepted",
        }).expect(404);
        await post(bob, `/peer-feedback/${feedback._id}/respond`, {
          rating: 4,
          feedback: "Collaborated well on the shared deliverables",
        }).expect(200);
        await post(bob, `/peer-feedback/${feedback._id}/respond`, {
          rating: 5,
          feedback: "Repeated submission must not replace the record",
        }).expect(409);
        const plan = (
          await post(admin, "/improvement-plans", {
            employee: employees[0].id,
            title: "Delivery improvement plan",
            reason: "Agree measurable milestones and support",
            goals:
              "Deliver weekly reviewed work with clear acceptance criteria",
            startDate: "2026-11-02",
            endDate: "2026-12-02",
          }).expect(201)
        ).body.data;
        await post(alice, `/improvement-plans/${plan._id}/check-in`, {
          notes: "Completed the first agreed milestone",
          progress: 25,
        }).expect(200);
        await post(carol, `/improvement-plans/${plan._id}/check-in`, {
          notes: "Attempting an unrelated employee plan",
          progress: 90,
        }).expect(404);
        await post(admin, `/improvement-plans/${plan._id}/close`, {
          status: "Completed",
          note: "All agreed goals have been independently reviewed",
        }).expect(200);
        await post(alice, `/improvement-plans/${plan._id}/check-in`, {
          notes: "Closed plans preserve their completed history",
          progress: 100,
        }).expect(409);
        const recommendation = (
          await post(admin, "/appraisal-recommendations", {
            employee: employees[0].id,
            kind: "Increment",
            incrementBasisPoints: 500,
            reason: "Propose an increment for independent finance review",
          }).expect(201)
        ).body.data;
        await post(
          admin,
          `/appraisal-recommendations/${recommendation._id}/review`,
          {
            status: "Approved",
            note: "The creator cannot approve the recommendation",
          },
        ).expect(403);
        await post(
          reviewer,
          `/appraisal-recommendations/${recommendation._id}/review`,
          {
            status: "Approved",
            note: "Approved recommendation; salary requires a separate revision",
          },
        ).expect(200);
      },
    );
    await t.test(
      "approved leave cancellation returns used days and closes cancelled approval cases",
      async () => {
        const policy = (
          await post(admin, "/leave-policies", {
            name: "Configured annual leave",
            annualDays: 12,
            excludeWeekends: false,
            weekendDays: [0],
            paid: true,
          }).expect(201)
        ).body.data;
        const leave = (
          await post(alice, "/leaves", {
            type: policy.name,
            startDate: "2026-11-10",
            endDate: "2026-11-10",
            reason: "A planned personal commitment on this date",
          }).expect(201)
        ).body.data;
        await post(admin, `/leaves/${leave._id}/approve`).expect(200);
        await post(alice, `/leaves/${leave._id}/request-cancellation`, {
          reason: "My personal plans changed and leave is no longer needed",
        }).expect(200);
        await post(alice, `/leaves/${leave._id}/review-cancellation`, {
          approve: true,
          reason: "Self approval is forbidden",
        }).expect(403);
        await post(admin, `/leaves/${leave._id}/review-cancellation`, {
          approve: true,
          reason: "Cancellation reviewed; restore the available balance",
        }).expect(200);
        assert.equal(
          (
            await LeaveBalance.findOne({
              employee: employees[0]._id,
              policy: policy._id,
            })
          ).used,
          0,
        );
        assert.equal(
          (
            await Attendance.findOne({
              employee: employees[0]._id,
              date: "2026-11-10",
            })
          ).status,
          "Cancelled Leave",
        );
        await post(admin, `/leaves/${leave._id}/review-cancellation`, {
          approve: true,
          reason: "Duplicate approval must not restore twice",
        }).expect(409);
        await ApprovalWorkflow.create({
          name: "Leave review",
          module: "Leave",
          steps: [{ type: "Role", role: adminRole._id, escalationHours: 24 }],
        });
        const pending = (
          await post(alice, "/leaves", {
            type: policy.name,
            startDate: "2026-11-11",
            endDate: "2026-11-11",
            reason: "A second planned commitment for this date",
          }).expect(201)
        ).body.data;
        await post(alice, `/leaves/${pending._id}/cancel`).expect(200);
        assert.equal(
          (await ApprovalCase.findOne({ resource: pending._id })).status,
          "Cancelled",
        );
      },
    );
    await t.test(
      "organization, work reports, communication and exit details persist with authorized actions",
      async () => {
        const department = (
          await post(admin, "/organization/departments", {
            name: "Operations",
            code: "OPERATIONS",
            head: employees[0].id,
          }).expect(201)
        ).body.data;
        const child = (
          await post(admin, "/organization/departments", {
            name: "Delivery",
            code: "DELIVERY",
            parent: department._id,
          }).expect(201)
        ).body.data;
        await admin.agent
          .patch(`/api/v1/organization/departments/${department._id}`)
          .set("x-csrf-token", admin.csrf)
          .send({ parent: child._id })
          .expect(422);
        assert.equal(
          (
            await admin.agent
              .get(
                `/api/v1/organization/departments/${department._id}/employees`,
              )
              .expect(200)
          ).body.data.length,
          3,
        );
        await post(admin, "/organization/designations", {
          name: "Senior Analyst",
          code: "SR-ANALYST",
          level: 3,
        }).expect(201);
        await post(admin, "/organization/branches", {
          name: "Head office",
          code: "HQ",
          address: "Configured office address",
          timezone: "Asia/Kolkata",
        }).expect(201);
        const settings = {
          name: "ABCO Computers",
          timezone: "Asia/Kolkata",
          requireDailyReport: false,
          dailyReportDepartments: [],
          financialYearStartMonth: 4,
          remindersEnabled: true,
          reminderLeadDays: 7,
        };
        await admin.agent
          .patch("/api/v1/company-settings")
          .set("x-csrf-token", admin.csrf)
          .send(settings)
          .expect(200);
        const png = Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jKxkAAAAASUVORK5CYII=",
          "base64",
        );
        await admin.agent
          .post("/api/v1/company-logo")
          .set("x-csrf-token", admin.csrf)
          .attach("file", png, "logo.png")
          .expect(200);
        const brand = (
          await alice.agent.get("/api/v1/company-brand").expect(200)
        ).body.data;
        assert.equal(brand.financialYearStartMonth, 4);
        assert.ok(brand.logo.startsWith("data:image/png;base64,"));
        await alice.agent
          .post("/api/v1/company-logo")
          .set("x-csrf-token", alice.csrf)
          .attach("file", png, "logo.png")
          .expect(403);
        const task = (
          await post(admin, "/tasks", {
            title: "Final task lifecycle",
            description: "Complete the task and preserve its archive history",
            employee: employees[0].id,
            priority: "Normal",
            startDate: "2026-11-02",
            dueDate: "2026-11-03",
            estimatedMinutes: 60,
          }).expect(201)
        ).body.data;
        await post(admin, `/tasks/${task._id}/archive`).expect(409);
        await post(alice, `/tasks/${task._id}/status`, {
          status: "In Progress",
        }).expect(200);
        await post(alice, `/tasks/${task._id}/status`, {
          status: "Completed",
          actualMinutes: 60,
        }).expect(200);
        const archived = (
          await post(admin, `/tasks/${task._id}/archive`).expect(200)
        ).body.data;
        assert.equal(archived.history.length, 4);
        await post(alice, `/tasks/${task._id}/comments`, {
          body: "Archived comments are read only",
        }).expect(409);
        const report = (
          await post(alice, "/daily-reports", {
            date: "2026-11-02",
            title: "Reviewed work report",
            description: "Explain the completed work with enough context",
            minutes: 60,
            workStatus: "Completed",
          }).expect(201)
        ).body.data;
        await post(alice, `/daily-reports/${report._id}/submit`).expect(200);
        await post(admin, `/daily-reports/${report._id}/review`, {
          status: "Rejected",
          comment:
            "Please include the acceptance criteria and delivery evidence",
        }).expect(200);
        await alice.agent
          .patch(`/api/v1/daily-reports/${report._id}`)
          .set("x-csrf-token", alice.csrf)
          .send({
            date: "2026-11-02",
            title: "Revised report",
            description: "Added the acceptance criteria and delivery evidence",
            minutes: 60,
            workStatus: "Completed",
          })
          .expect(200);
        await post(alice, `/daily-reports/${report._id}/submit`).expect(200);
        const approved = (
          await post(admin, `/daily-reports/${report._id}/review`, {
            status: "Approved",
            comment: "Work and delivery evidence reviewed successfully",
          }).expect(200)
        ).body.data;
        assert.equal(approved.reviewHistory.length, 2);
        const announcement = (
          await post(admin, "/announcements", {
            title: "Final test announcement",
            body: "A company message retained after archival",
            department: "",
            branch: "",
            important: false,
            publishAt: "2026-11-01T00:00:00Z",
            expiresAt: null,
          }).expect(201)
        ).body.data;
        await post(admin, `/announcements/${announcement._id}/archive`).expect(
          200,
        );
        assert.equal(
          (await alice.agent.get("/api/v1/announcements").expect(200)).body.data
            .length,
          0,
        );
        const holiday = (
          await post(admin, "/holidays", {
            name: "Configured test holiday",
            date: "2026-11-05",
            branch: "",
            optional: false,
          }).expect(201)
        ).body.data;
        await runReminders();
        assert.equal(
          await Notification.countDocuments({ title: "Upcoming holiday" }),
          3,
        );
        await runReminders();
        assert.equal(
          await Notification.countDocuments({ title: "Upcoming holiday" }),
          3,
        );
        await post(admin, `/holidays/${holiday._id}/deactivate`).expect(200);
        assert.equal(
          (
            await alice.agent
              .get("/api/v1/calendar?month=2026-11&kind=Holidays")
              .expect(200)
          ).body.data.events.length,
          0,
        );
        const ticket = (
          await post(alice, "/helpdesk", {
            subject: "An unresolved HR question",
            description: "Please review this outstanding question for me",
            category: "HR Policy",
            priority: "Normal",
          }).expect(201)
        ).body.data;
        const escalated = (
          await post(alice, `/helpdesk/${ticket._id}/escalate`, {
            reason: "This issue is blocking my planned employee workflow",
          }).expect(200)
        ).body.data;
        assert.equal(escalated.priority, "Urgent");
        assert.equal(escalated.escalations.length, 1);
        const exit = (
          await post(alice, "/exits", {
            resignationDate: "2026-11-02",
            lastWorkingDate: "2026-12-02",
            reason: "A planned professional transition for the employee",
            separationType: "Resignation",
            handover:
              "Document and transfer the outstanding project responsibilities",
          }).expect(201)
        ).body.data;
        const interviewed = (
          await post(admin, `/exits/${exit._id}/interview`, {
            summary: "Discussed the transition and employee experience",
            improvements:
              "Documented suggestions for better operational support",
            wouldRehire: true,
          }).expect(200)
        ).body.data;
        assert.equal(interviewed.interview.wouldRehire, true);
        assert.equal(
          (await admin.agent.get("/api/v1/reports/attrition").expect(200)).body
            .data.length,
          0,
        );
        assert.equal(
          (await CompanySettings.findById("company")).financialYearStartMonth,
          4,
        );
      },
    );
  } finally {
    assert.ok(/^abco_test_[a-f\d]{32}$/.test(mongoose.connection.name));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    t.mock.timers.reset();
  }
});
