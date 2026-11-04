import dotenv from "dotenv";
import mongoose from "mongoose";
import session from "express-session";
import request from "supertest";
import { createApp } from "../src/app.js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
dotenv.config({ path: resolve(root, ".env"), quiet: true });
process.env.DOCUMENT_STORAGE_PATH = resolve(
  root,
  ".",
  process.env.DOCUMENT_STORAGE_PATH || "storage/documents",
);
if (process.env.NODE_ENV === "production")
  throw new Error("Demo verification is restricted to development/test.");
// Only this in-process app uses a temporary authenticated session. No real session/password is changed.
await mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 5000,
});
try {
  const roles = await mongoose.models.Role.find({ permissions: "*" });
  const actor = await mongoose.models.User.findOne({
    active: true,
    role: { $in: roles.map((r) => r._id) },
  });
  if (!actor) throw new Error("Administrator setup required");
  const store = new session.MemoryStore(),
    app = createApp({ sessionStore: store, logLevel: "silent" }),
    agent = request.agent(app);
  const csrf = (await agent.get("/api/v1/auth/csrf").expect(200)).body.data
    .token;
  const sessions = await new Promise((resolve, reject) =>
    store.all((error, data) => (error ? reject(error) : resolve(data))),
  );
  const [sid, data] = Object.entries(sessions)[0];
  data.userId = actor.id;
  data.authVersion = actor.authVersion;
  await new Promise((resolve, reject) =>
    store.set(sid, data, (error) => (error ? reject(error) : resolve())),
  );
  const routes = [
    "/employees",
    "/organization/departments",
    "/organization/designations",
    "/organization/branches",
    "/organization/shifts",
    "/attendance",
    "/shift-assignments",
    "/attendance/regularizations",
    "/leaves",
    "/leave-policies",
    "/tasks",
    "/daily-reports",
    "/projects",
    "/timesheets",
    "/training",
    "/training-enrollments",
    "/skills",
    "/expense-policies",
    "/expenses",
    "/travel",
    "/surveys",
    "/recognitions",
    "/suggestions",
    "/recruitment/jobs",
    "/recruitment/candidates",
    "/onboarding",
    "/performance",
    "/peer-feedback",
    "/improvement-plans",
    "/appraisal-recommendations",
    "/assets",
    "/asset-maintenance",
    "/exits",
    "/documents",
    "/document-templates",
    "/generated-letters",
    "/salary-structures",
    "/payroll/periods",
    "/payroll-adjustments",
    "/loan-policies",
    "/loans",
    "/final-settlements",
    "/helpdesk",
    "/announcements",
    "/holidays",
    "/approval-workflows",
    "/approvals",
    "/approval-delegations",
    "/notifications",
    "/users",
    "/roles",
  ];
  const seedReport = JSON.parse(
    readFileSync(resolve(root, "docs/demo-data-report.json"), "utf8"),
  );
  const attendanceDate = new Date(
    new Date(seedReport.anchorDate + "T12:00:00Z").getTime() - 86400000,
  )
    .toISOString()
    .slice(0, 10);
  const results = [];
  for (const path of routes) {
    const target =
      path === "/attendance" ? path + "?date=" + attendanceDate : path;
    const response = await agent.get("/api/v1" + target);
    if (response.status !== 200)
      throw new Error(`${path}: HTTP ${response.status}`);
    const rows = Array.isArray(response.body.data) ? response.body.data : null;
    results.push({
      path: target,
      status: 200,
      visibleRecords: rows?.length ?? null,
    });
    if (rows && rows.length < 3)
      throw new Error(`${path} has fewer than three visible sample records`);
  }
  const doc = await mongoose.models.Document.findOne({
    name: "DEMO sample document 1",
  });
  const grant = await agent
    .post(`/api/v1/documents/${doc.id}/access`)
    .set("x-csrf-token", csrf)
    .send({})
    .expect(200);
  const file = await agent
    .get(grant.body.data.url)
    .buffer(true)
    .parse((res, done) => {
      const parts = [];
      res.on("data", (p) => parts.push(p));
      res.on("end", () => done(null, Buffer.concat(parts)));
    })
    .expect(200);
  if (!file.body.subarray(0, 5).equals(Buffer.from("%PDF-")))
    throw new Error("Sample PDF download failed");
  const report = JSON.parse(
    readFileSync(resolve(root, "docs/demo-data-report.json"), "utf8"),
  );
  report.apiVerification = {
    routes: results,
    privatePDFDownload: true,
    verifiedAt: new Date().toISOString(),
  };
  writeFileSync(
    resolve(root, "docs/demo-data-report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify(
      { verifiedRoutes: results.length, privatePDFDownload: true, results },
      null,
      2,
    ),
  );
} finally {
  await mongoose.disconnect();
}
