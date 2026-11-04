import { enqueueEmail } from "../auth/recovery.js";
import { Project } from "../extended/models.js";
import { Router } from "express";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import {
  Task,
  DailyReport,
  Announcement,
  Notification,
  Ticket,
  Holiday,
  CompanySettings,
} from "./models.js";
import { Employee, User } from "../../models.js";
import { can, workDate } from "../../security.js";
import {
  id,
  text,
  longText,
  date,
  fail,
  permit,
  ownEmployee,
  activeEmployee,
  audit,
  list,
  transition,
} from "../../shared/workflow.js";

export async function notifyEmployee(employee, title, body, path, session) {
  const users = await User.find({ employee, active: true })
    .select("_id email notificationPreferences")
    .session(session || null);
  for (const user of users) {
    if (user.notificationPreferences?.inApp !== false)
      await Notification.create([{ user: user._id, title, body, path }], {
        session,
        ordered: true,
      });
    if (
      user.notificationPreferences?.email === true &&
      process.env.SMTP_HOST &&
      process.env.SMTP_FROM
    )
      await enqueueEmail(
        {
          to: user.email,
          subject: "ABCO HRMS · " + title,
          text: body + "\n" + process.env.FRONTEND_ORIGIN + path,
        },
        session,
      );
  }
}

const taskInput = z
  .object({
    project: id.optional(),
    title: text,
    description: longText,
    employee: id,
    priority: z.enum(["Low", "Normal", "High", "Urgent"]).default("Normal"),
    startDate: date,
    dueDate: date,
    estimatedMinutes: z.number().int().min(0).max(100000).default(0),
  })
  .refine((v) => v.dueDate >= v.startDate, "Due date must follow start date");
const reportInput = z.object({
  workStatus: z
    .enum(["In Progress", "Completed", "Blocked"])
    .default("In Progress"),
  project: id.optional(),
  date,
  title: text,
  description: longText,
  task: id.optional(),
  minutes: z.number().int().min(0).max(1440),
  blockers: z.string().max(2000).default(""),
  notes: z.string().max(2000).default(""),
});
const taskTransitions = {
  "To Do": ["In Progress", "Cancelled"],
  "In Progress": ["On Hold", "Completed", "Cancelled"],
  "On Hold": ["In Progress", "Cancelled"],
  Completed: [],
  Cancelled: [],
};
const ticketTransitions = {
  Open: ["In Progress", "Closed"],
  "In Progress": ["Awaiting Response", "Resolved"],
  "Awaiting Response": ["In Progress", "Resolved"],
  Resolved: ["In Progress", "Closed"],
  Closed: [],
};

export function operationsRoutes() {
  const router = Router();
  router.post(
    "/tasks/:id/archive",
    permit("tasks.manage"),
    async (req, res) => {
      const record = await Task.findById(req.params.id);
      if (!record) fail(404, "Task not found");
      if (!["Completed", "Cancelled"].includes(record.status))
        fail(409, "Complete or cancel the task before archiving");
      if (!record.archived) {
        record.archived = true;
        record.history.push({
          action: "Archived",
          actor: req.user._id,
          at: new Date(),
        });
        await record.save();
        await audit(req, "task.archived", record.id);
      }
      res.json({ data: record });
    },
  );
  router.post(
    "/announcements/:id/archive",
    permit("announcements.manage"),
    async (req, res) => {
      const record = await Announcement.findByIdAndUpdate(
        req.params.id,
        { $set: { archived: true } },
        { new: true },
      );
      if (!record) fail(404, "Announcement not found");
      await audit(req, "announcement.archived", record.id);
      res.json({ data: record });
    },
  );
  router.post(
    "/holidays/:id/deactivate",
    permit("organization.manage"),
    async (req, res) => {
      const record = await Holiday.findByIdAndUpdate(
        req.params.id,
        { $set: { active: false } },
        { new: true },
      );
      if (!record) fail(404, "Holiday not found");
      await audit(req, "holiday.deactivated", record.id);
      res.json({ data: record });
    },
  );
  router.get("/lookups/employees", async (req, res) => {
    const broad = [
      "employee.read",
      "tasks.manage",
      "payroll.process",
      "recruitment.manage",
      "assets.manage",
      "performance.manage",
      "onboarding.manage",
      "projects.manage",
      "training.manage",
    ].some((p) => can(req.user, p));
    res.json({
      data: await Employee.find(
        broad
          ? { status: { $ne: "Archived" } }
          : { _id: req.user.employee || null },
      )
        .select("firstName lastName code department")
        .sort({ firstName: 1 })
        .limit(1000)
        .lean(),
    });
  });
  router.get("/tasks", async (req, res) =>
    res.json(
      await list(
        Task,
        can(req.user, "tasks.manage")
          ? {}
          : { employee: req.user.employee || null },
        req,
        { populate: { path: "employee", select: "firstName lastName code" } },
      ),
    ),
  );
  router.post("/tasks", permit("tasks.manage"), async (req, res) => {
    const input = taskInput.parse(req.body);
    await activeEmployee(input.employee);
    if (
      input.project &&
      !(await Project.exists({
        _id: input.project,
        employees: input.employee,
        status: "Active",
      }))
    )
      fail(422, "Choose an active project assigned to this employee");
    const task = await Task.create({
      ...input,
      createdBy: req.user._id,
      history: [{ action: "Created", actor: req.user._id, at: new Date() }],
    });
    await audit(req, "task.created", task.id);
    await notifyEmployee(task.employee, "A task for you", task.title, "/tasks");
    res.status(201).json({ data: task });
  });
  router.patch("/tasks/:id", permit("tasks.manage"), async (req, res) => {
    const input = taskInput.parse(req.body);
    await activeEmployee(input.employee);
    if (
      input.project &&
      !(await Project.exists({
        _id: input.project,
        employees: input.employee,
        status: "Active",
      }))
    )
      fail(422, "Choose an assigned active project");
    const record = await Task.findById(req.params.id);
    if (!record) fail(404, "Task not found");
    if (["Completed", "Cancelled"].includes(record.status))
      fail(409, "Closed tasks cannot be edited");
    const previous = String(record.employee);
    Object.assign(record, input);
    record.history.push({
      action: "Edited",
      actor: req.user._id,
      at: new Date(),
    });
    await record.save();
    if (previous !== String(record.employee))
      await notifyEmployee(
        record.employee,
        "Task reassigned to you",
        record.title,
        "/tasks",
      );
    await audit(req, "task.updated", record.id);
    res.json({ data: record });
  });
  router.post("/tasks/:id/status", async (req, res) => {
    const next = z
      .enum(["To Do", "In Progress", "On Hold", "Completed", "Cancelled"])
      .parse(req.body.status);
    const task = await Task.findById(req.params.id);
    if (!task) fail(404, "Task not found");
    if (task.archived) fail(409, "Archived tasks preserve their final history");
    const manager = can(req.user, "tasks.manage");
    if (!manager && String(task.employee) !== String(req.user.employee))
      fail(403, "Task access denied");
    if (next === "Cancelled" && !manager)
      fail(403, "Only the assigning manager can cancel a task");
    transition(task, next, taskTransitions);
    task.history.push({ action: next, actor: req.user._id, at: new Date() });
    task.actualMinutes = z
      .number()
      .int()
      .min(0)
      .max(100000)
      .default(task.actualMinutes)
      .parse(req.body.actualMinutes);
    await task.save();
    await audit(req, "task.status.updated", task.id);
    res.json({ data: task });
  });
  router.post("/tasks/:id/comments", async (req, res) => {
    const task = await Task.findById(req.params.id);
    if (!task) fail(404, "Task not found");
    if (task.archived) fail(409, "Archived task comments are read-only");
    if (
      !can(req.user, "tasks.manage") &&
      String(task.employee) !== String(req.user.employee)
    )
      fail(403, "Task access denied");
    task.comments.push({
      author: req.user._id,
      body: longText.parse(req.body.body),
      at: new Date(),
    });
    await task.save();
    res.status(201).json({ data: task });
  });
  router.get("/daily-reports", async (req, res) =>
    res.json(
      await list(
        DailyReport,
        can(req.user, "reports.review")
          ? {}
          : { employee: req.user.employee || null },
        req,
        { populate: { path: "employee", select: "firstName lastName code" } },
      ),
    ),
  );
  router.post("/daily-reports", async (req, res) => {
    const employee = ownEmployee(req),
      input = reportInput.parse(req.body);
    if (input.date > workDate())
      fail(422, "Daily reports cannot be dated in the future");
    if (input.task && !(await Task.exists({ _id: input.task, employee })))
      fail(422, "Choose one of your assigned tasks");
    if (
      input.project &&
      !(await Project.exists({
        _id: input.project,
        employees: employee,
        status: { $in: ["Active", "On Hold"] },
      }))
    )
      fail(422, "Choose an assigned active project");
    const report = await DailyReport.create({ ...input, employee });
    await audit(req, "daily-report.created", report.id);
    res.status(201).json({ data: report });
  });
  router.patch("/daily-reports/:id", async (req, res) => {
    const report = await DailyReport.findOne({
      _id: req.params.id,
      employee: ownEmployee(req),
    });
    if (!report) fail(404, "Report not found");
    if (!["Draft", "Rejected"].includes(report.status))
      fail(409, "Only drafts and rejected reports can be edited");
    const input = reportInput.parse(req.body);
    if (input.date > workDate()) fail(422, "Future reports are not allowed");
    if (
      input.task &&
      !(await Task.exists({ _id: input.task, employee: report.employee }))
    )
      fail(422, "Choose one of your tasks");
    if (
      input.project &&
      !(await Project.exists({
        _id: input.project,
        employees: report.employee,
        status: { $in: ["Active", "On Hold"] },
      }))
    )
      fail(422, "Choose one of your assigned projects");
    Object.assign(report, input);
    report.status = "Draft";
    await report.save();
    res.json({ data: report });
  });
  router.post("/daily-reports/:id/submit", async (req, res) => {
    const report = await DailyReport.findOne({
      _id: req.params.id,
      employee: ownEmployee(req),
    });
    if (!report) fail(404, "Report not found");
    if (report.status === "Draft") {
      report.status = "Submitted";
      report.submittedAt = new Date();
      await report.save();
      await audit(req, "daily-report.submitted", report.id);
    }
    res.json({ data: report });
  });
  router.post(
    "/daily-reports/:id/review",
    permit("reports.review"),
    async (req, res) => {
      const report = await DailyReport.findById(req.params.id);
      if (!report) fail(404, "Report not found");
      if (String(report.employee) === String(req.user.employee))
        fail(403, "You cannot review your own report");
      if (report.status !== "Submitted")
        fail(409, "Only submitted reports can be reviewed");
      report.reviewComment = longText.parse(req.body.comment);
      report.status = z
        .enum(["Reviewed", "Approved", "Rejected"])
        .default("Reviewed")
        .parse(req.body.status);
      report.reviewHistory.push({
        status: report.status,
        comment: report.reviewComment,
        actor: req.user._id,
        at: new Date(),
      });
      report.reviewer = req.user._id;
      await report.save();
      await notifyEmployee(
        report.employee,
        "Daily report reviewed",
        report.reviewComment,
        "/daily-reports",
      );
      await audit(req, "daily-report.reviewed", report.id);
      res.json({ data: report });
    },
  );
  router.get("/announcements", async (req, res) => {
    const employee = await Employee.findById(req.user.employee);
    const manager = can(req.user, "announcements.manage");
    const now = new Date();
    const filter = manager
      ? {}
      : {
          archived: { $ne: true },
          $and: [
            { publishAt: { $lte: now } },
            { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
            {
              $or: [
                { department: "" },
                { department: employee?.department || "__none__" },
              ],
            },
            {
              $or: [{ branch: "" }, { branch: employee?.branch || "__none__" }],
            },
          ],
        };
    res.json(await list(Announcement, filter, req));
  });
  const announcementInput = z
    .object({
      title: text,
      body: longText,
      department: z.string().max(100).default(""),
      branch: z.string().max(100).default(""),
      important: z.boolean().default(false),
      publishAt: z.iso.datetime(),
      expiresAt: z.iso.datetime().nullable().default(null),
    })
    .refine(
      (v) => !v.expiresAt || v.expiresAt > v.publishAt,
      "Expiry must follow publication",
    );
  router.post(
    "/announcements",
    permit("announcements.manage"),
    async (req, res) => {
      const input = announcementInput.parse(req.body);
      const record = await Announcement.create({
        ...input,
        author: req.user._id,
      });
      await audit(req, "announcement.created", record.id);
      res.status(201).json({ data: record });
    },
  );
  router.patch(
    "/announcements/:id",
    permit("announcements.manage"),
    async (req, res) => {
      const record = await Announcement.findByIdAndUpdate(
        req.params.id,
        { $set: announcementInput.parse(req.body) },
        { new: true },
      );
      if (!record) fail(404, "Announcement not found");
      await audit(req, "announcement.updated", record.id);
      res.json({ data: record });
    },
  );
  router.post("/announcements/:id/acknowledge", async (req, res) => {
    const employee = await activeEmployee(ownEmployee(req));
    const record = await Announcement.findById(req.params.id);
    if (!record) fail(404, "Announcement not found");
    if (
      record.archived ||
      record.publishAt > new Date() ||
      (record.expiresAt && record.expiresAt < new Date()) ||
      (record.department && record.department !== employee.department) ||
      (record.branch && record.branch !== employee.branch)
    )
      fail(403, "Announcement access denied");
    await Announcement.updateOne(
      { _id: record._id },
      { $addToSet: { acknowledgedBy: employee._id } },
    );
    res.json({ data: true });
  });
  router.get("/notifications", async (req, res) =>
    res.json({
      ...(await list(Notification, { user: req.user._id }, req)),
      unread: await Notification.countDocuments({
        user: req.user._id,
        readAt: null,
      }),
    }),
  );
  router.post("/notifications/read-all", async (req, res) => {
    await Notification.updateMany(
      { user: req.user._id, readAt: null },
      { $set: { readAt: new Date() } },
    );
    res.json({ data: true });
  });
  router.post("/notifications/:id/read", async (req, res) => {
    const record = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { $set: { readAt: new Date() } },
      { new: true },
    );
    if (!record) fail(404, "Notification not found");
    res.json({ data: record });
  });
  const ticketInput = z.object({
    subject: text,
    description: longText,
    category: z.enum([
      "Payroll",
      "Attendance",
      "Leave",
      "Documents",
      "HR Policy",
      "IT Support",
      "Other",
    ]),
    priority: z.enum(["Low", "Normal", "High", "Urgent"]).default("Normal"),
  });
  const ticketFilter = (req) =>
    can(req.user, "helpdesk.manage")
      ? {
          $or: [
            { assignedTo: req.user._id },
            { assignedTo: null },
            { employee: req.user.employee || null },
          ],
        }
      : { employee: req.user.employee || null };
  router.get("/helpdesk", async (req, res) =>
    res.json(
      await list(Ticket, ticketFilter(req), req, {
        populate: { path: "employee", select: "firstName lastName" },
      }),
    ),
  );
  router.post("/helpdesk", async (req, res) => {
    const record = await Ticket.create({
      ...ticketInput.parse(req.body),
      number: "HR-" + randomBytes(4).toString("hex").toUpperCase(),
      employee: ownEmployee(req),
    });
    await audit(req, "helpdesk.created", record.id);
    res.status(201).json({ data: record });
  });
  router.post("/helpdesk/:id/reply", async (req, res) => {
    const record = await Ticket.findOne({
      _id: req.params.id,
      ...ticketFilter(req),
    });
    if (!record) fail(404, "Ticket not found");
    if (record.status === "Closed")
      fail(409, "Closed tickets cannot receive messages");
    record.messages.push({
      author: req.user._id,
      body: longText.parse(req.body.body),
      at: new Date(),
    });
    await record.save();
    res.json({ data: record });
  });
  router.post(
    "/helpdesk/:id/status",
    permit("helpdesk.manage"),
    async (req, res) => {
      const record = await Ticket.findOne({
        _id: req.params.id,
        ...ticketFilter(req),
      });
      if (!record) fail(404, "Ticket not found");
      const next = z
        .enum([
          "Open",
          "In Progress",
          "Awaiting Response",
          "Resolved",
          "Closed",
        ])
        .parse(req.body.status);
      transition(record, next, ticketTransitions);
      record.assignedTo = req.user._id;
      await record.save();
      await notifyEmployee(
        record.employee,
        "Helpdesk update",
        `${record.number}: ${record.status}`,
        "/helpdesk",
      );
      await audit(req, "helpdesk.status.updated", record.id);
      res.json({ data: record });
    },
  );
  router.get("/holidays", async (req, res) => {
    const employee = await Employee.findById(req.user.employee);
    res.json(
      await list(
        Holiday,
        can(req.user, "organization.manage")
          ? {}
          : {
              active: { $ne: false },
              $or: [{ branch: "" }, { branch: employee?.branch || "__none__" }],
            },
        req,
      ),
    );
  });
  const holidayInput = z.object({
    category: z.enum(["National", "Company", "Optional"]).default("Company"),
    name: text,
    date,
    branch: z.string().max(100).default(""),
    optional: z.boolean().default(false),
  });
  router.post("/holidays", permit("organization.manage"), async (req, res) => {
    const record = await Holiday.create(holidayInput.parse(req.body));
    await audit(req, "holiday.created", record.id);
    res.status(201).json({ data: record });
  });
  router.patch(
    "/holidays/:id",
    permit("organization.manage"),
    async (req, res) => {
      const record = await Holiday.findByIdAndUpdate(
        req.params.id,
        { $set: holidayInput.parse(req.body) },
        { new: true },
      );
      if (!record) fail(404, "Holiday not found");
      await audit(req, "holiday.updated", record.id);
      res.json({ data: record });
    },
  );
  router.get(
    "/company-settings",
    permit("settings.manage"),
    async (_req, res) =>
      res.json({
        data: (await CompanySettings.findById("company").lean()) || {
          name: "ABCO Computers",
          timezone: "Asia/Kolkata",
          requireDailyReport: false,
          dailyReportDepartments: [],
        },
      }),
  );
  router.patch(
    "/company-settings",
    permit("settings.manage"),
    async (req, res) => {
      const input = z
        .object({
          name: text,
          address: z.string().max(1000).default(""),
          financialYearStartMonth: z.number().int().min(1).max(12).optional(),
          timezone: z.string().refine((v) => {
            try {
              new Intl.DateTimeFormat("en", { timeZone: v });
              return true;
            } catch {
              return false;
            }
          }, "Invalid timezone"),
          requireDailyReport: z.boolean(),
          requireFinalSettlement: z.boolean().default(false),
          allowWorkFromHome: z.boolean().default(false),
          allowShiftSwaps: z.boolean().default(false),
          remindersEnabled: z.boolean().default(false),
          reminderLeadDays: z.number().int().min(1).max(365).optional(),
          dailyReportDepartments: z
            .array(z.string().max(100))
            .max(100)
            .default([]),
        })
        .parse(req.body);
      const patch = Object.fromEntries(
        Object.entries(input).filter(([key]) => Object.hasOwn(req.body, key)),
      );
      const current = await CompanySettings.findById("company").lean();
      if (
        (patch.remindersEnabled ?? current?.remindersEnabled) &&
        (patch.reminderLeadDays ?? current?.reminderLeadDays) == null
      )
        fail(422, "Configure reminder lead days before enabling reminders");
      const record = await CompanySettings.findByIdAndUpdate(
        "company",
        { $set: patch },
        { upsert: true, new: true },
      );
      await audit(req, "company.settings.updated", record.id);
      res.json({ data: record });
    },
  );
  return router;
}
