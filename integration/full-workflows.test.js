import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import session from "express-session";
import request from "supertest";
import argon2 from "argon2";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { createApp } from "../src/app.js";
import { Role, User, Employee, Attendance } from "../src/models.js";
import { Asset, AssetAssignment } from "../src/modules/hr/models.js";
import { PayrollEntry } from "../src/modules/payroll/models.js";

test("connected operations, payroll and private document workflows", async (t) => {
  const dbName = `abco_test_${randomUUID().replaceAll("-", "")}`;
  const storageRoot = path.resolve("storage", dbName);
  process.env.SESSION_SECRET = randomBytes(32).toString("hex");
  process.env.DOCUMENT_KEY = randomBytes(32).toString("hex");
  process.env.DOCUMENT_STORAGE_PATH = storageRoot;
  await mongoose.connect("mongodb://127.0.0.1:27017", {
    dbName,
    serverSelectionTimeoutMS: 5000,
  });
  try {
    await Promise.all(
      Object.values(mongoose.models).map((model) => model.init()),
    );
    const adminRole = await Role.create({
      name: "Super Admin",
      permissions: ["*"],
    });
    const staffRole = await Role.create({ name: "Employee", permissions: [] });
    const approvalRole = await Role.create({
      name: "Payroll Approver",
      permissions: ["payroll.view", "payroll.approve"],
    });
    const password = randomBytes(20).toString("hex"),
      passwordHash = await argon2.hash(password);
    const employees = await Employee.create([
      {
        code: "TEST-A",
        firstName: "Asha",
        lastName: "Worker",
        email: "worker@example.test",
        department: "Engineering",
        designation: "Developer",
        joiningDate: new Date("2025-01-01"),
      },
      {
        code: "TEST-B",
        firstName: "Other",
        lastName: "Worker",
        email: "other@example.test",
        department: "Operations",
        designation: "Analyst",
        joiningDate: new Date("2025-01-01"),
      },
    ]);
    await User.create([
      {
        email: "admin@example.test",
        name: "Admin",
        passwordHash,
        role: adminRole._id,
      },
      {
        email: "approver@example.test",
        name: "Approver",
        passwordHash,
        role: approvalRole._id,
      },
      {
        email: "worker@example.test",
        name: "Asha Worker",
        passwordHash,
        role: staffRole._id,
        employee: employees[0]._id,
      },
      {
        email: "other@example.test",
        name: "Other Worker",
        passwordHash,
        role: staffRole._id,
        employee: employees[1]._id,
      },
    ]);
    const app = createApp({ sessionStore: new session.MemoryStore() });
    async function login(email) {
      const agent = request.agent(app);
      const token = (await agent.get("/api/v1/auth/csrf")).body.data.token;
      const csrf = (
        await agent
          .post("/api/v1/auth/login")
          .set("x-csrf-token", token)
          .send({ email, password })
          .expect(200)
      ).body.data.csrfToken;
      return { agent, csrf };
    }
    const admin = await login("admin@example.test"),
      staff = await login("worker@example.test"),
      other = await login("other@example.test"),
      approver = await login("approver@example.test");
    const post = (actor, url, body = {}) =>
      actor.agent
        .post("/api/v1" + url)
        .set("x-csrf-token", actor.csrf)
        .send(body);
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    let task, report, asset, candidate, onboarding, period;
    await t.test(
      "department scope isolates directory, dashboard, assignments and salaries",
      async () => {
        const role = await Role.create({
          name: "Department Manager",
          scope: "Department",
          permissions: [
            "employee.read",
            "attendance.read",
            "tasks.manage",
            "leave.read",
            "leave.approve",
          ],
        });
        const person = await Employee.create({
          code: "TEST-MANAGER",
          firstName: "Department",
          lastName: "Manager",
          email: "manager@example.test",
          department: "Engineering",
          designation: "Manager",
          joiningDate: new Date("2025-01-01"),
        });
        await User.create({
          name: "Department Manager",
          email: person.email,
          passwordHash,
          role: role._id,
          employee: person._id,
        });
        const manager = await login(person.email);
        const directory = (
          await manager.agent.get("/api/v1/employees").expect(200)
        ).body.data;
        assert.ok(directory.length === 2);
        assert.ok(
          directory.every((record) => record.department === "Engineering"),
        );
        const dashboard = (
          await manager.agent.get("/api/v1/dashboard").expect(200)
        ).body.data;
        assert.equal(dashboard.total, 2);
        assert.equal(dashboard.departments.length, 1);
        await post(manager, "/tasks", {
          title: "Out of scope task",
          description: "Cannot assign outside the department",
          employee: employees[1].id,
          priority: "Normal",
          startDate: today,
          dueDate: today,
        }).expect(422);
        await manager.agent.get("/api/v1/salary-structures").expect(403);
        await manager.agent.get("/api/v1/documents").expect(200);
        await manager.agent.get("/api/v1/users").expect(403);
      },
    );
    await t.test(
      "assigned work is private and enforces transitions",
      async () => {
        task = (
          await post(admin, "/tasks", {
            title: "Prepare project report",
            description: "Prepare the monthly delivery report",
            employee: employees[0].id,
            priority: "High",
            startDate: today,
            dueDate: today,
          }).expect(201)
        ).body.data;
        await post(staff, "/tasks", {}).expect(403);
        assert.equal(
          (await other.agent.get("/api/v1/tasks")).body.data.length,
          0,
        );
        await post(other, `/tasks/${task._id}/status`, {
          status: "In Progress",
        }).expect(403);
        await post(staff, `/tasks/${task._id}/status`, {
          status: "Completed",
        }).expect(409);
        await post(staff, `/tasks/${task._id}/status`, {
          status: "In Progress",
        }).expect(200);
        await post(staff, `/tasks/${task._id}/comments`, {
          body: "Work is underway",
        }).expect(201);
        await post(staff, `/tasks/${task._id}/status`, {
          status: "Completed",
          actualMinutes: 60,
        }).expect(200);
      },
    );
    await t.test(
      "daily-report policy gates punch-out and preserves submitted reports",
      async () => {
        await admin.agent
          .patch("/api/v1/company-settings")
          .set("x-csrf-token", admin.csrf)
          .send({
            name: "ABCO Computers",
            timezone: "Asia/Kolkata",
            requireDailyReport: true,
            dailyReportDepartments: [],
          })
          .expect(200);
        await post(staff, "/attendance/punch-in").expect(200);
        await post(staff, "/attendance/break-start").expect(200);
        await post(staff, "/attendance/punch-out").expect(409);
        await post(staff, "/attendance/break-end").expect(200);
        await post(staff, "/attendance/punch-out").expect(409);
        report = (
          await post(staff, "/daily-reports", {
            date: today,
            title: "Monthly delivery report",
            description: "Completed the monthly delivery report",
            task: task._id,
            minutes: 60,
          }).expect(201)
        ).body.data;
        await post(other, `/daily-reports/${report._id}/submit`).expect(404);
        await post(staff, `/daily-reports/${report._id}/submit`).expect(200);
        await staff.agent
          .patch(`/api/v1/daily-reports/${report._id}`)
          .set("x-csrf-token", staff.csrf)
          .send({})
          .expect(409);
        await post(staff, "/attendance/punch-out").expect(200);
        await post(admin, `/daily-reports/${report._id}/review`, {
          comment: "Thank you for the thorough report",
        }).expect(200);
      },
    );
    await t.test(
      "tickets, announcement acknowledgement and notifications persist",
      async () => {
        const ticket = (
          await post(staff, "/helpdesk", {
            subject: "Need policy clarification",
            description: "Please clarify the expense policy",
            category: "HR Policy",
            priority: "Normal",
          }).expect(201)
        ).body.data;
        await post(other, `/helpdesk/${ticket._id}/reply`, {
          body: "Not my ticket",
        }).expect(404);
        await post(admin, `/helpdesk/${ticket._id}/status`, {
          status: "In Progress",
        }).expect(200);
        await post(admin, `/helpdesk/${ticket._id}/reply`, {
          body: "We are reviewing the policy",
        }).expect(200);
        const announcement = (
          await post(admin, "/announcements", {
            title: "Team meeting",
            body: "Please join the company meeting",
            department: "Engineering",
            publishAt: new Date(Date.now() - 1000).toISOString(),
            expiresAt: null,
          }).expect(201)
        ).body.data;
        assert.equal(
          (await other.agent.get("/api/v1/announcements")).body.data.length,
          0,
        );
        await post(
          other,
          `/announcements/${announcement._id}/acknowledge`,
        ).expect(403);
        await post(
          staff,
          `/announcements/${announcement._id}/acknowledge`,
        ).expect(200);
        const notifications = (await staff.agent.get("/api/v1/notifications"))
          .body;
        assert.ok(notifications.unread >= 2);
        await post(staff, "/notifications/read-all").expect(200);
        assert.equal(
          (await staff.agent.get("/api/v1/notifications")).body.unread,
          0,
        );
      },
    );
    await t.test(
      "asset allocation is atomic under concurrent attempts",
      async () => {
        asset = (
          await post(admin, "/assets", {
            name: "Development laptop",
            category: "Laptop",
            serial: "TEST-SERIAL-1",
            purchaseDate: today,
            warrantyExpiry: "2030-12-31",
            condition: "New",
          }).expect(201)
        ).body.data;
        const results = await Promise.all([
          post(admin, `/assets/${asset._id}/allocate`, {
            employee: employees[0].id,
          }),
          post(admin, `/assets/${asset._id}/allocate`, {
            employee: employees[1].id,
          }),
        ]);
        assert.deepEqual(
          results.map((result) => result.status).sort(),
          [200, 409],
        );
        assert.equal(
          await AssetAssignment.countDocuments({
            asset: asset._id,
            active: true,
          }),
          1,
        );
        await post(admin, `/assets/${asset._id}/status`, {
          status: "Retired",
        }).expect(409);
        await post(admin, `/assets/${asset._id}/return`, {
          condition: "Good",
        }).expect(200);
        assert.equal(
          await AssetAssignment.countDocuments({
            asset: asset._id,
            active: true,
          }),
          0,
        );
      },
    );
    await t.test(
      "recruitment converts one accepted candidate to one employee and onboarding",
      async () => {
        const job = (
          await post(admin, "/recruitment/jobs", {
            title: "Engineer",
            department: "Engineering",
            location: "Head office",
            employmentType: "Full time",
            vacancies: 1,
            description: "Build dependable software systems",
            requirements: "Strong JavaScript development skills",
            openingDate: today,
          }).expect(201)
        ).body.data;
        candidate = (
          await post(admin, "/recruitment/candidates", {
            name: "New Colleague",
            email: "candidate@example.test",
            phone: "1234567890",
            job: job._id,
            source: "Referral",
            experience: "3 years",
            skills: "JavaScript",
          }).expect(201)
        ).body.data;
        await post(admin, `/recruitment/candidates/${candidate._id}/stage`, {
          status: "Selected",
        }).expect(409);
        for (const status of [
          "Screening",
          "Interview",
          "Evaluation",
          "Selected",
          "Offered",
          "Accepted",
        ])
          await post(admin, `/recruitment/candidates/${candidate._id}/stage`, {
            status,
            interviewAt: new Date(Date.now() + 86400000).toISOString(),
            feedback: "Reviewed by the hiring team",
          }).expect(200);
        const joined = await post(
          admin,
          `/recruitment/candidates/${candidate._id}/join`,
          {
            joiningDate: today,
            designation: "Engineer",
            branch: "Head office",
          },
        ).expect(200);
        await post(admin, `/recruitment/candidates/${candidate._id}/join`, {
          joiningDate: today,
          designation: "Engineer",
          branch: "Head office",
        }).expect(200);
        assert.equal(
          await Employee.countDocuments({ email: "candidate@example.test" }),
          1,
        );
        const list = (await admin.agent.get("/api/v1/onboarding")).body.data;
        onboarding = list.find(
          (r) => r.employee._id === joined.body.data.employee,
        );
        await post(admin, `/onboarding/${onboarding._id}/approve`).expect(409);
        const withItem = (
          await post(admin, `/onboarding/${onboarding._id}/items`, {
            title: "Verify joining documents",
            owner: employees[0].id,
            deadline: today,
          }).expect(200)
        ).body.data;
        await post(
          other,
          `/onboarding/${onboarding._id}/items/${withItem.checklist[0]._id}/complete`,
        ).expect(403);
        await post(
          staff,
          `/onboarding/${onboarding._id}/items/${withItem.checklist[0]._id}/complete`,
        ).expect(200);
        await post(admin, `/onboarding/${onboarding._id}/approve`).expect(200);
      },
    );
    await t.test(
      "performance follows employee assessment, manager review, approval and acknowledgement",
      async () => {
        const review = (
          await post(admin, "/performance", {
            employee: employees[0].id,
            title: "Quarterly growth",
            startDate: today,
            endDate: today,
            goals: [
              { title: "Delivery quality", weight: 60 },
              { title: "Collaboration", weight: 40 },
            ],
          }).expect(201)
        ).body.data;
        await post(other, `/performance/${review._id}/self-review`, {
          scores: [4, 5],
          comment: "My self-assessment",
        }).expect(404);
        await post(staff, `/performance/${review._id}/self-review`, {
          scores: [4, 5],
          comment: "Completed project delivery and supported teammates",
        }).expect(200);
        await post(admin, `/performance/${review._id}/manager-review`, {
          scores: [5, 4],
          comment: "Strong delivery with consistent collaboration",
        }).expect(200);
        const approved = (
          await post(admin, `/performance/${review._id}/approve`).expect(200)
        ).body.data;
        assert.equal(approved.weightedScore, 4.6);
        await post(staff, `/performance/${review._id}/acknowledge`).expect(200);
      },
    );
    await t.test(
      "documents are encrypted and owner/session authorization protects downloads",
      async () => {
        const bytes = Buffer.from(
          "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF",
        );
        await admin.agent
          .post("/api/v1/documents")
          .set("x-csrf-token", admin.csrf)
          .field("name", "Invalid upload")
          .field("category", "Other Records")
          .field("employee", employees[0].id)
          .attach("file", Buffer.from("<script>alert(1)</script>"), "fake.pdf")
          .expect(422);
        const doc = (
          await admin.agent
            .post("/api/v1/documents")
            .set("x-csrf-token", admin.csrf)
            .field("name", "Employment letter")
            .field("category", "Employment Letters")
            .field("employee", employees[0].id)
            .field("visibility", "Employee")
            .attach("file", bytes, "letter.pdf")
            .expect(201)
        ).body.data;
        assert.equal(doc.versions[0].key, undefined);
        await post(other, `/documents/${doc._id}/access`).expect(403);
        const access = (
          await post(staff, `/documents/${doc._id}/access`).expect(200)
        ).body.data.url;
        const response = await staff.agent.get(access).expect(200);
        assert.equal(response.headers["content-type"], "application/pdf");
        await other.agent.get(access).expect(403);
        await staff.agent
          .get(
            access.replace(/signature=[a-f\d]+/, "signature=" + "a".repeat(64)),
          )
          .expect(403);
        const privateDoc = (
          await admin.agent
            .post("/api/v1/documents")
            .set("x-csrf-token", admin.csrf)
            .field("name", "Private verification")
            .field("category", "Identity Documents")
            .field("employee", employees[0].id)
            .field("visibility", "HR Only")
            .attach("file", bytes, "identity.pdf")
            .expect(201)
        ).body.data;
        await post(staff, `/documents/${privateDoc._id}/access`).expect(403);
        assert.equal(
          (await staff.agent.get("/api/v1/documents")).body.data.length,
          1,
        );
      },
    );
    await t.test(
      "payroll snapshots, separate approval, payslip privacy and locks work together",
      async () => {
        const now = new Date(),
          month = new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
          )
            .toISOString()
            .slice(0, 7);
        await post(staff, "/salary-structures", {}).expect(403);
        await post(admin, "/salary-structures", {
          employee: employees[0].id,
          effectiveDate: month + "-01",
          earnings: [{ name: "Basic", amount: "30000.00" }],
          deductions: [
            { name: "Configured deduction", amount: "1000", prorate: false },
          ],
          employerContributions: [],
        }).expect(201);
        period = (
          await post(admin, "/payroll/periods", {
            month,
            payBasis: "Calendar days",
          }).expect(201)
        ).body.data;
        const missing = await Attendance.create({
          employee: employees[0]._id,
          date: month + "-02",
          punchIn: new Date(month + "-02T04:00Z"),
        });
        await post(admin, `/payroll/periods/${period._id}/calculate`).expect(
          409,
        );
        assert.equal(await PayrollEntry.countDocuments(), 0);
        missing.punchOut = new Date(month + "-02T12:00Z");
        await missing.save();
        await post(admin, `/payroll/periods/${period._id}/calculate`).expect(
          200,
        );
        await post(admin, `/payroll/periods/${period._id}/calculate`).expect(
          200,
        );
        assert.equal(
          await PayrollEntry.countDocuments({ period: period._id }),
          1,
        );
        const entries = (
          await admin.agent.get(`/api/v1/payroll/periods/${period._id}/entries`)
        ).body.data;
        assert.equal(entries[0].net, 2900000);
        await staff.agent
          .get(`/api/v1/payslips/${entries[0]._id}/download`)
          .expect(409);
        await post(admin, `/payroll/periods/${period._id}/submit`).expect(200);
        await post(admin, `/payroll/periods/${period._id}/approve`).expect(403);
        await post(approver, `/payroll/periods/${period._id}/approve`).expect(
          200,
        );
        await post(admin, `/payroll/periods/${period._id}/finalize`).expect(
          200,
        );
        const pdf = await staff.agent
          .get(`/api/v1/payslips/${entries[0]._id}/download`)
          .expect(200);
        assert.equal(pdf.headers["content-type"], "application/pdf");
        await other.agent
          .get(`/api/v1/payslips/${entries[0]._id}/download`)
          .expect(403);
        await post(admin, `/payroll/periods/${period._id}/close`).expect(409);
        await post(admin, `/payroll/periods/${period._id}/pay`, {
          paymentReference: "TEST-TRANSFER-123",
        }).expect(200);
        await post(admin, `/payroll/periods/${period._id}/close`).expect(200);
        await post(admin, `/payroll/periods/${period._id}/calculate`).expect(
          409,
        );
        await post(staff, "/attendance/regularizations", {
          date: month + "-02",
          requestedIn: month + "-02T04:00:00Z",
          requestedOut: month + "-02T12:00:00Z",
          reason: "Cannot modify locked payroll attendance",
        }).expect(409);
      },
    );
    await t.test(
      "report permissions exclude salaries and export escaped CSV",
      async () => {
        await staff.agent.get("/api/v1/reports/employees").expect(403);
        const report = await admin.agent
          .get("/api/v1/reports/employees?format=csv")
          .expect(200);
        assert.match(report.text, /code/);
        assert.doesNotMatch(report.text, /passwordHash/);
        const view = (await admin.agent.get("/api/v1/users").expect(200)).body
          .data;
        assert.ok(view.every((user) => !user.passwordHash && !user.resetHash));
      },
    );
    await t.test(
      "exit clearance prevents completion with assigned assets and disables the account afterward",
      async () => {
        await post(admin, `/assets/${asset._id}/allocate`, {
          employee: employees[0].id,
        }).expect(200);
        const exit = (
          await post(staff, "/exits", {
            resignationDate: today,
            lastWorkingDate: today,
            reason: "A new professional opportunity",
            separationType: "Resignation",
            handover: "Document systems and hand over ownership",
          }).expect(201)
        ).body.data;
        for (const status of [
          "Under Review",
          "Approved",
          "Notice Period",
          "Clearance",
        ])
          await post(admin, `/exits/${exit._id}/transition`, {
            status,
            note: "Reviewed by HR",
          }).expect(200);
        await post(admin, `/exits/${exit._id}/transition`, {
          status: "Settlement",
          note: "Clearance reviewed",
          handoverComplete: true,
          documentsComplete: true,
        }).expect(409);
        await post(admin, `/assets/${asset._id}/return`, {
          condition: "Good",
        }).expect(200);
        await post(admin, `/exits/${exit._id}/transition`, {
          status: "Settlement",
          note: "Clearance reviewed",
          handoverComplete: true,
          documentsComplete: true,
        }).expect(200);
        await post(admin, `/exits/${exit._id}/transition`, {
          status: "Completed",
          note: "Final settlement reviewed and documented",
          handoverComplete: true,
          documentsComplete: true,
          settlementReviewed: true,
        }).expect(200);
        await staff.agent.get("/api/v1/auth/me").expect(401);
        assert.equal(
          (await Employee.findById(employees[0]._id)).status,
          "Archived",
        );
      },
    );
  } finally {
    assert.ok(/^abco_test_[a-f\d]{32}$/.test(mongoose.connection.name));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    const parent = path.resolve("storage");
    assert.equal(path.dirname(storageRoot), parent);
    assert.ok(path.basename(storageRoot).startsWith("abco_test_"));
    await rm(storageRoot, { recursive: true, force: true });
  }
});
