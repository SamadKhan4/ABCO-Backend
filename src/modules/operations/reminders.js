import mongoose from "mongoose";
import { Router } from "express";
import { z } from "zod";
import { Employee, User, Attendance } from "../../models.js";
import {
  CompanySettings,
  Notification,
  Task,
  DailyReport,
  Holiday,
} from "./models.js";
import { Document } from "../documents/routes.js";
import { Asset } from "../hr/models.js";
import { ApprovalCase } from "../approvals/index.js";
import { workDate } from "../../security.js";
import { addDays } from "../attendance/engine.js";
import { audit, fail, permit, transaction } from "../../shared/workflow.js";
const { Schema } = mongoose;
const claimSchema = new Schema(
  { user: { type: Schema.Types.ObjectId, ref: "User" }, key: String },
  { timestamps: true },
);
claimSchema.index({ user: 1, key: 1 }, { unique: true });
const ReminderClaim = mongoose.model("ReminderClaim", claimSchema);
const SchedulerLease = mongoose.model(
  "SchedulerLease",
  new Schema({ _id: String, until: Date }, { strict: "throw" }),
);
async function once(employee, key, title, body, path) {
  const users = await User.find({ employee, active: true });
  for (const user of users) {
    if (user.notificationPreferences?.inApp === false) continue;
    try {
      await transaction(async (session) => {
        await ReminderClaim.create([{ user: user._id, key }], { session });
        await Notification.create([{ user: user._id, title, body, path }], {
          session,
        });
      });
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
  }
}
export async function runReminders() {
  const settings = await CompanySettings.findById("company");
  if (!settings?.remindersEnabled) return { enabled: false };
  if (!Number.isInteger(settings.reminderLeadDays))
    return { enabled: false, reason: "Reminder lead days are not configured" };
  const now = new Date(),
    today = workDate(),
    upcoming = addDays(today, settings.reminderLeadDays);
  const tasks = await Task.find({
    status: { $nin: ["Completed", "Cancelled"] },
    dueDate: { $lte: upcoming },
  }).limit(500);
  for (const task of tasks)
    await once(
      task.employee,
      `task:${task.id}:${today}`,
      "Task deadline reminder",
      `${task.title} · Due ${task.dueDate}`,
      "/tasks",
    );
  const open = await Attendance.find({
    punchIn: { $lt: new Date(Date.now() - 36 * 3600000) },
    punchOut: null,
  }).limit(500);
  for (const record of open)
    await once(
      record.employee,
      `missing-punch:${record.id}:${today}`,
      "A workday needs your attention",
      `Your ${record.date} attendance has a missing punch-out.`,
      "/attendance",
    );
  const documents = await Document.find({
    expiresAt: { $gte: today, $lte: upcoming },
    visibility: "Employee",
  }).limit(500);
  for (const document of documents)
    if (document.employee)
      await once(
        document.employee,
        `document:${document.id}:${today}`,
        "Document expiry reminder",
        `${document.name} · Expires ${document.expiresAt}`,
        "/documents",
      );
  const employees = await Employee.find({ status: { $ne: "Archived" } })
    .select("firstName lastName dateOfBirth joiningDate branch")
    .limit(5000);
  const upcomingHolidays = await Holiday.find({
    active: { $ne: false },
    date: { $gte: today, $lte: upcoming },
  }).limit(500);
  for (const employee of employees) {
    for (const holiday of upcomingHolidays)
      if (!holiday.branch || holiday.branch === employee.branch)
        await once(
          employee._id,
          `holiday:${holiday.id}:${holiday.date}`,
          "Upcoming holiday",
          `${holiday.name}: ${holiday.date}`,
          "/holidays",
        );
    if (employee.dateOfBirth?.slice(5) === today.slice(5))
      await once(
        employee._id,
        `birthday:${today}`,
        "Happy birthday!",
        `Wishing you a wonderful day, ${employee.firstName}.`,
        "/",
      );
    if (
      employee.joiningDate?.toISOString().slice(5, 10) === today.slice(5) &&
      employee.joiningDate.toISOString().slice(0, 4) !== today.slice(0, 4)
    )
      await once(
        employee._id,
        `anniversary:${today}`,
        "Happy work anniversary!",
        `Thank you for being part of the team, ${employee.firstName}.`,
        "/",
      );
  }
  if (settings.requireDailyReport) {
    const yesterday = addDays(today, -1);
    const workdays = await Attendance.find({
      date: yesterday,
      punchIn: { $exists: true },
    }).limit(1000);
    for (const record of workdays) {
      const employee = await Employee.findById(record.employee);
      if (
        !employee ||
        (settings.dailyReportDepartments.length &&
          !settings.dailyReportDepartments.includes(employee.department))
      )
        continue;
      if (
        !(await DailyReport.exists({
          employee: employee._id,
          date: yesterday,
          status: { $in: ["Submitted", "Reviewed", "Approved"] },
        }))
      )
        await once(
          employee._id,
          `missing-report:${record.id}:${today}`,
          "Daily report reminder",
          `Your report for ${yesterday} is still missing.`,
          "/daily-reports",
        );
    }
  }
  const cases = await ApprovalCase.find({ status: "Pending" }).limit(500);
  for (const request of cases) {
    const step = request.steps[request.currentStep],
      last = request.history.at(-1)?.at || request.createdAt;
    if (!step?.escalationHours || now - last < step.escalationHours * 3600000)
      continue;
    const users = await User.find({
      active: true,
      ...(step.type === "Role" ? { role: step.role } : { _id: step.user }),
    });
    for (const user of users)
      if (user.employee)
        await once(
          user.employee,
          `approval:${request.id}:${request.currentStep}:${today}`,
          "Approval waiting for review",
          `${request.module}: ${request.title}`,
          "/approvals",
        );
  }
  return {
    enabled: true,
    tasks: tasks.length,
    missingPunches: open.length,
    expiringDocuments: documents.length,
    pendingApprovals: cases.length,
  };
}
export function startReminderWorker() {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      let lease;
      try {
        lease = await SchedulerLease.findOneAndUpdate(
          {
            _id: "reminders",
            $or: [
              { until: { $lt: new Date() } },
              { until: { $exists: false } },
            ],
          },
          { $set: { until: new Date(Date.now() + 5 * 60000) } },
          { upsert: true, new: true },
        );
      } catch (error) {
        if (error.code === 11000) return;
        throw error;
      }
      if (lease) await runReminders();
    } catch {
      console.error(
        "Reminder processing failed; the next scheduled run will retry.",
      );
    } finally {
      running = false;
    }
  }, 60000);
  timer.unref();
  return () => clearInterval(timer);
}
export function notificationSettings() {
  const router = Router();
  router.get("/notification-preferences", async (req, res) =>
    res.json({
      data: {
        inApp: req.user.notificationPreferences?.inApp !== false,
        email: req.user.notificationPreferences?.email === true,
        emailAvailable: Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM),
      },
    }),
  );
  router.patch("/notification-preferences", async (req, res) => {
    const input = z
      .object({ inApp: z.boolean(), email: z.boolean() })
      .parse(req.body);
    if (input.email && (!process.env.SMTP_HOST || !process.env.SMTP_FROM))
      fail(503, "Email delivery is not configured");
    await User.updateOne(
      { _id: req.user._id },
      { $set: { notificationPreferences: input } },
    );
    await audit(req, "notification.preferences.updated", req.user.id);
    res.json({ data: input });
  });
  router.post("/reminders/run", permit("settings.manage"), async (req, res) => {
    const result = await runReminders();
    await audit(req, "reminders.run", "company");
    res.json({ data: result });
  });
  return router;
}
