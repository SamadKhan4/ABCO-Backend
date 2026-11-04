import { openApproval, advanceApproval } from "../approvals/index.js";
import { Router } from "express";
import { z } from "zod";
import { Project, Timesheet } from "./models.js";
import { Task, DailyReport } from "../operations/models.js";
import { Employee } from "../../models.js";
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
  transaction,
  transition,
} from "../../shared/workflow.js";
import { notifyEmployee } from "../operations/routes.js";
const visible = (req) =>
  can(req.user, "projects.manage")
    ? {}
    : { employees: req.user.employee || null };
export function projectRoutes() {
  const router = Router();
  router.get("/projects", async (req, res) =>
    res.json(await list(Project, visible(req), req)),
  );
  const input = z
    .object({
      name: text,
      code: z
        .string()
        .trim()
        .min(1)
        .max(30)
        .transform((v) => v.toUpperCase()),
      description: longText,
      department: text,
      employees: z.array(id).min(1).max(500),
      startDate: date,
      endDate: date,
    })
    .refine((v) => v.endDate >= v.startDate, "Project end must follow start");
  router.post("/projects", permit("projects.manage"), async (req, res) => {
    const data = input.parse(req.body);
    for (const employee of data.employees) await activeEmployee(employee);
    const record = await Project.create(data);
    await audit(req, "project.created", record.id);
    res.status(201).json({ data: record });
  });
  router.patch("/projects/:id", permit("projects.manage"), async (req, res) => {
    const record = await Project.findById(req.params.id);
    if (!record) fail(404, "Project not found");
    if (["Completed", "Archived"].includes(record.status))
      fail(409, "Closed projects are immutable");
    const data = input.parse(req.body);
    for (const employee of data.employees) await activeEmployee(employee);
    Object.assign(record, data);
    await record.save();
    await audit(req, "project.updated", record.id);
    res.json({ data: record });
  });
  router.post(
    "/projects/:id/status",
    permit("projects.manage"),
    async (req, res) => {
      const status = z
        .enum(["Planned", "Active", "On Hold", "Completed", "Archived"])
        .parse(req.body.status);
      const record = await Project.findById(req.params.id);
      if (!record) fail(404, "Project not found");
      transition(record, status, {
        Planned: ["Active", "Archived"],
        Active: ["On Hold", "Completed"],
        "On Hold": ["Active", "Archived"],
        Completed: ["Archived"],
        Archived: [],
      });
      await record.save();
      await audit(req, "project.status.updated", record.id);
      res.json({ data: record });
    },
  );
  router.get("/projects/:id/overview", async (req, res) => {
    const project = await Project.findOne({
      _id: req.params.id,
      ...visible(req),
    });
    if (!project) fail(404, "Project not found");
    const manager = can(req.user, "projects.manage");
    const filter = {
      project: project._id,
      ...(manager ? {} : { employee: req.user.employee }),
    };
    const [tasks, reports, timesheets] = await Promise.all([
      Task.find(filter).select("title employee status dueDate").lean(),
      DailyReport.find(filter)
        .select("employee date title minutes status")
        .lean(),
      Timesheet.find({ ...filter, status: "Approved" }).lean(),
    ]);
    res.json({
      data: {
        project,
        tasks,
        reports,
        billableMinutes: timesheets
          .filter((r) => r.billable)
          .reduce((sum, r) => sum + r.minutes, 0),
        nonBillableMinutes: timesheets
          .filter((r) => !r.billable)
          .reduce((sum, r) => sum + r.minutes, 0),
      },
    });
  });
  router.get("/timesheets", async (req, res) =>
    res.json(
      await list(
        Timesheet,
        can(req.user, "timesheets.approve")
          ? {}
          : { employee: req.user.employee || null },
        req,
        {
          populate: [
            { path: "project", select: "name code" },
            { path: "employee", select: "firstName lastName code" },
          ],
        },
      ),
    ),
  );
  const timesheetInput = z.object({
    project: id,
    date,
    minutes: z.number().int().min(1).max(1440),
    billable: z.boolean(),
    description: longText,
  });
  async function validate(data, employee, session, exclude) {
    if (data.date > workDate()) fail(422, "Future timesheets are not allowed");
    const project = await Project.findOne({
      _id: data.project,
      employees: employee,
      status: { $in: ["Active", "On Hold"] },
      startDate: { $lte: data.date },
      endDate: { $gte: data.date },
    }).session(session);
    if (!project) fail(422, "Choose an assigned project within its work dates");
    const records = await Timesheet.find({
      employee,
      date: data.date,
      ...(exclude ? { _id: { $ne: exclude } } : {}),
    }).session(session);
    if (records.reduce((sum, r) => sum + r.minutes, 0) + data.minutes > 1440)
      fail(422, "Daily time cannot exceed 24 hours");
  }
  router.post("/timesheets", async (req, res) => {
    const data = timesheetInput.parse(req.body),
      employee = ownEmployee(req);
    const record = await transaction(async (session) => {
      await Employee.updateOne(
        { _id: employee },
        { $inc: { leaveVersion: 1 } },
        { session },
      );
      await validate(data, employee, session);
      const [record] = await Timesheet.create([{ ...data, employee }], {
        session,
      });
      await audit(req, "timesheet.created", record.id, session);
      return record;
    });
    res.status(201).json({ data: record });
  });
  router.patch("/timesheets/:id", async (req, res) => {
    const data = timesheetInput.parse(req.body),
      employee = ownEmployee(req);
    const record = await transaction(async (session) => {
      await Employee.updateOne(
        { _id: employee },
        { $inc: { leaveVersion: 1 } },
        { session },
      );
      const record = await Timesheet.findOne({
        _id: req.params.id,
        employee,
        status: { $in: ["Draft", "Rejected"] },
      }).session(session);
      if (!record)
        fail(409, "Only your draft or rejected entries can be edited");
      await validate(data, employee, session, record._id);
      Object.assign(record, data, { status: "Draft" });
      await record.save({ session });
      return record;
    });
    res.json({ data: record });
  });
  router.post("/timesheets/:id/submit", async (req, res) => {
    const record = await transaction(async (session) => {
      const record = await Timesheet.findOneAndUpdate(
        { _id: req.params.id, employee: ownEmployee(req), status: "Draft" },
        { $set: { status: "Submitted" } },
        { new: true, session },
      );
      if (!record) fail(409, "Only your draft timesheets can be submitted");
      await openApproval(req, "Timesheet", record, session);
      await audit(req, "timesheet.submitted", record.id, session);
      return record;
    });
    res.json({ data: record });
  });
  router.post(
    "/timesheets/:id/review",
    permit("timesheets.approve"),
    async (req, res) => {
      const data = z
        .object({ status: z.enum(["Approved", "Rejected"]), note: longText })
        .parse(req.body);
      const record = await transaction(async (session) => {
        const record = await Timesheet.findById(req.params.id).session(session);
        if (!record) fail(404, "Timesheet not found");
        if (String(record.employee) === String(req.user.employee))
          fail(403, "You cannot approve your own timesheet");
        if (record.status !== "Submitted")
          fail(409, "A submitted entry is required");
        if (
          !(await advanceApproval(
            req,
            "Timesheet",
            record,
            data.status,
            data.note,
            session,
          ))
        )
          return record;
        record.status = data.status;
        record.reviewNote = data.note;
        record.approver = req.user._id;
        await record.save({ session });
        await audit(req, "timesheet.reviewed", record.id, session);
        await notifyEmployee(
          record.employee,
          "Timesheet " + record.status.toLowerCase(),
          data.note,
          "/timesheets",
          session,
        );
        return record;
      });
      res.json({ data: record });
    },
  );
  return router;
}
