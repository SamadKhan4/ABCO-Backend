import { balanceFor, accruedDays } from "./modules/leave/balances.js";
import {
  openApproval,
  advanceApproval,
  ApprovalCase,
} from "./modules/approvals/index.js";
import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import {
  Employee,
  Leave,
  LeavePolicy,
  LeaveBalance,
  LeaveLedger,
  Attendance,
  Audit,
} from "./models.js";
import { can, workDate } from "./security.js";
import { Holiday } from "./modules/operations/models.js";
import { ensureUnlocked } from "./modules/attendance/routes.js";
import { notifyEmployee } from "./modules/operations/routes.js";

const fail = (status, message) => {
  const error = new Error(message);
  error.status = status;
  throw error;
};
export function leaveDates(start, end, policy) {
  const dates = [];
  for (
    let date = new Date(`${start}T00:00:00Z`);
    date <= new Date(`${end}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 1)
  ) {
    if (
      !policy.excludeWeekends ||
      !policy.weekendDays.includes(date.getUTCDay())
    )
      dates.push(date.toISOString().slice(0, 10));
  }
  return dates;
}
async function transaction(callback) {
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(() => callback(session));
  } finally {
    await session.endSession();
  }
}
async function lockEmployee(employee, session) {
  const record = await Employee.findOneAndUpdate(
    { _id: employee, status: { $ne: "Archived" } },
    { $inc: { leaveVersion: 1 } },
    { session, new: true },
  );
  if (!record) fail(409, "An active employee profile is required");
}
export function leaveRoutes() {
  const router = Router();
  const approve = (req, res, next) =>
    can(req.user, "leave.approve")
      ? next()
      : res
          .status(403)
          .json({ error: { message: "Leave approval permission required" } });
  const manage = (req, res, next) =>
    can(req.user, "organization.manage")
      ? next()
      : res.status(403).json({
          error: { message: "Organization management permission required" },
        });
  router.get("/leave-policies", async (_req, res) =>
    res.json({
      data: await LeavePolicy.find({ active: true }).sort({ name: 1 }).lean(),
    }),
  );
  const policyInput = z.object({
    name: z.string().trim().min(2).max(80),
    annualDays: z.number().min(0).max(366),
    paid: z.boolean().default(true),
    accrual: z.enum(["Annual", "Monthly"]).default("Annual"),
    carryForwardLimit: z.number().min(0).max(366).default(0),
    halfDayAllowed: z.boolean().default(false),
    encashmentAllowed: z.boolean().default(false),
    minimumNoticeDays: z.number().int().min(0).max(365).default(0),
    probationAllowed: z.boolean().default(true),
    excludeWeekends: z.boolean().default(true),
    weekendDays: z.array(z.number().int().min(0).max(6)).max(7).default([0, 6]),
  });
  router.post("/leave-policies", manage, async (req, res) => {
    const record = await LeavePolicy.create(policyInput.parse(req.body));
    await Audit.create({
      actor: req.user._id,
      action: "leave.policy.created",
      resource: record.id,
      requestId: req.id,
    });
    res.status(201).json({ data: record });
  });
  router.get("/leave-balances/me", async (req, res) => {
    const year = Number(workDate().slice(0, 4));
    const policies = await LeavePolicy.find({ active: true }).lean();
    const balances = await LeaveBalance.find({
      employee: req.user.employee || null,
      year,
    }).lean();
    res.json({
      data: policies.map((policy) => {
        const balance = balances.find(
          (b) => String(b.policy) === String(policy._id),
        );
        return {
          policy: policy._id,
          name: policy.name,
          year,
          opening: balance
            ? balance.opening +
              Math.max(
                0,
                accruedDays(
                  balance.annualSnapshot || policy.annualDays,
                  balance.accrualSnapshot || policy.accrual,
                  year,
                ) - (balance.accruedPosted ?? balance.opening),
              )
            : accruedDays(policy.annualDays, policy.accrual, year),
          used: balance?.used || 0,
          reserved: balance?.reserved || 0,
          available:
            (balance
              ? balance.opening +
                Math.max(
                  0,
                  accruedDays(
                    balance.annualSnapshot ?? policy.annualDays,
                    balance.accrualSnapshot || policy.accrual,
                    year,
                  ) - (balance.accruedPosted ?? balance.opening),
                )
              : accruedDays(policy.annualDays, policy.accrual, year)) -
            (balance?.used || 0) -
            (balance?.reserved || 0),
        };
      }),
    });
  });
  router.get("/leaves/me", async (req, res) =>
    res.json({
      data: await Leave.find({ employee: req.user.employee || null })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
    }),
  );
  router.get("/leaves", approve, async (_req, res) =>
    res.json({
      data: await Leave.find()
        .populate("employee", "firstName lastName code department")
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
    }),
  );
  router.post("/leaves", async (req, res) => {
    if (!req.user.employee) fail(409, "Link an employee profile first");
    const input = z
      .object({
        halfDay: z.boolean().default(false),
        halfDayPeriod: z.enum(["Morning", "Afternoon"]).optional(),
        type: z.string().min(1).max(80),
        startDate: z.iso.date(),
        endDate: z.iso.date(),
        reason: z.string().trim().min(10).max(1000),
      })
      .refine(
        (v) => v.endDate >= v.startDate,
        "End date must follow start date",
      )
      .refine(
        (v) => v.startDate.slice(0, 4) === v.endDate.slice(0, 4),
        "Split requests across calendar years",
      )
      .parse(req.body);
    if (input.startDate < workDate())
      fail(422, "Leave requests must start today or later");
    const record = await transaction(async (session) => {
      await lockEmployee(req.user.employee, session);
      const policy = await LeavePolicy.findOne({
        name: input.type,
        active: true,
      }).session(session);
      if (!policy) fail(422, "Choose an active leave policy");
      await ensureUnlocked(input.startDate, session);
      await ensureUnlocked(input.endDate, session);
      const employeeRecord = await Employee.findById(req.user.employee).session(
        session,
      );
      const holidays = await Holiday.find({
        date: { $gte: input.startDate, $lte: input.endDate },
        optional: false,
        active: { $ne: false },
        $or: [{ branch: "" }, { branch: employeeRecord.branch }],
      }).session(session);
      const excluded = new Set(holidays.map((h) => h.date));
      if (!policy.probationAllowed && employeeRecord.status === "Probation")
        fail(422, "This policy is not available during probation");
      if (
        new Date(input.startDate) - new Date(workDate()) <
        (policy.minimumNoticeDays || 0) * 86400000
      )
        fail(422, "Request does not meet the configured notice period");
      if (
        input.halfDay &&
        (!policy.halfDayAllowed ||
          input.startDate !== input.endDate ||
          !input.halfDayPeriod)
      )
        fail(
          422,
          "Choose a permitted single-day half-day request and morning/afternoon period",
        );
      const dates = leaveDates(input.startDate, input.endDate, policy).filter(
        (day) => !excluded.has(day),
      );
      if (!dates.length) fail(422, "No working days in this date range");
      if (
        await Leave.exists({
          employee: req.user.employee,
          status: { $in: ["Pending", "Approved"] },
          startDate: { $lte: input.endDate },
          endDate: { $gte: input.startDate },
        }).session(session)
      )
        fail(409, "This request overlaps existing leave");
      const year = Number(input.startDate.slice(0, 4));
      const balance = await balanceFor(
        req.user.employee,
        policy,
        year,
        session,
      );
      const requestedDays = input.halfDay ? 0.5 : dates.length;
      if (balance.opening - balance.used - balance.reserved < requestedDays)
        fail(409, "Insufficient available leave balance");
      balance.reserved += requestedDays;
      await balance.save({ session });
      const [leave] = await Leave.create(
        [
          {
            ...input,
            employee: req.user.employee,
            paid: policy.paid,
            policy: policy._id,
            days: requestedDays,
            dates,
            year,
          },
        ],
        { session },
      );
      await LeaveLedger.create(
        [
          {
            employee: req.user.employee,
            request: leave._id,
            action: "Reserve",
            days: requestedDays,
          },
        ],
        { session },
      );
      await openApproval(req, "Leave", leave, session);
      await Audit.create(
        [
          {
            actor: req.user._id,
            action: "leave.requested",
            resource: leave.id,
            requestId: req.id,
          },
        ],
        { session },
      );
      return leave;
    });
    res.status(201).json({ data: record });
  });
  async function decide(req, res, action) {
    const decisionReason =
      action === "Rejected"
        ? z.string().trim().min(3).max(500).parse(req.body.reason)
        : "";
    const record = await transaction(async (session) => {
      const leave = await Leave.findById(req.params.id).session(session);
      if (!leave) fail(404, "Leave request not found");
      const own = String(leave.employee) === String(req.user.employee);
      if (action === "Cancelled" && !own)
        fail(403, "You can cancel only your own request");
      if (action !== "Cancelled" && own)
        fail(403, "You cannot approve or reject your own request");
      if (leave.status === action) return leave;
      if (leave.status !== "Pending")
        fail(409, "Only pending requests can be changed");
      await lockEmployee(leave.employee, session);
      for (const day of leave.dates) await ensureUnlocked(day, session);
      if (
        action !== "Cancelled" &&
        !(await advanceApproval(
          req,
          "Leave",
          leave,
          action === "Approved" ? "Approved" : "Rejected",
          decisionReason || "Leave approval",
          session,
        ))
      )
        return leave;
      const balance = await LeaveBalance.findOne({
        employee: leave.employee,
        policy: leave.policy,
        year: leave.year,
      }).session(session);
      if (!balance || balance.reserved < leave.days)
        fail(409, "Leave balance requires reconciliation");
      if (action === "Approved") {
        if (
          !leave.halfDay &&
          (await Attendance.exists({
            employee: leave.employee,
            date: { $in: leave.dates },
            punchIn: { $exists: true },
          }).session(session))
        )
          fail(409, "Attendance already exists for these dates");
        balance.used += leave.days;
        await Attendance.bulkWrite(
          leave.dates.map((date) => ({
            updateOne: {
              filter: { employee: leave.employee, date },
              update: leave.halfDay
                ? {
                    $set: { leaveFraction: 0.5 },
                    $setOnInsert: { status: "On Leave" },
                  }
                : { $set: { status: "On Leave", leaveFraction: 1 } },
              upsert: true,
            },
          })),
          { session },
        );
      }
      balance.reserved -= leave.days;
      if (action === "Cancelled")
        await ApprovalCase.updateOne(
          { module: "Leave", resource: leave._id, status: "Pending" },
          {
            $set: { status: "Cancelled" },
            $push: {
              history: {
                step: 0,
                decision: "Cancelled",
                actor: req.user._id,
                at: new Date(),
                note: "Employee cancelled the request",
              },
            },
          },
          { session },
        );
      await balance.save({ session });
      await notifyEmployee(
        leave.employee,
        "Leave request " + action.toLowerCase(),
        `${leave.type}: ${leave.startDate} – ${leave.endDate}`,
        "/leaves",
        session,
      );
      leave.status = action;
      leave.approver = req.user._id;
      leave.decidedAt = new Date();
      leave.decisionReason = decisionReason;
      await leave.save({ session });
      await LeaveLedger.create(
        [
          {
            employee: leave.employee,
            request: leave._id,
            action: action === "Approved" ? "Approve" : "Release",
            days: leave.days,
          },
        ],
        { session },
      );
      await Audit.create(
        [
          {
            actor: req.user._id,
            action: `leave.${action.toLowerCase()}`,
            resource: leave.id,
            requestId: req.id,
          },
        ],
        { session },
      );
      return leave;
    });
    res.json({ data: record });
  }
  router.post("/leaves/:id/approve", approve, (req, res) =>
    decide(req, res, "Approved"),
  );
  router.post("/leaves/:id/reject", approve, (req, res) =>
    decide(req, res, "Rejected"),
  );
  router.post("/leaves/:id/cancel", (req, res) =>
    decide(req, res, "Cancelled"),
  );
  router.post("/leaves/:id/request-cancellation", async (req, res) => {
    const reason = z.string().trim().min(10).max(1000).parse(req.body.reason);
    const record = await transaction(async (session) => {
      const leave = await Leave.findOne({
        _id: req.params.id,
        employee: req.user.employee,
        status: "Approved",
      }).session(session);
      if (!leave)
        fail(409, "Only your approved leave can be submitted for cancellation");
      await lockEmployee(leave.employee, session);
      for (const day of leave.dates) await ensureUnlocked(day, session);
      leave.cancellationRequested = true;
      leave.cancellationReason = reason;
      await leave.save({ session });
      await Audit.create(
        [
          {
            actor: req.user._id,
            action: "leave.cancellation.requested",
            resource: leave.id,
            requestId: req.id,
          },
        ],
        { session },
      );
      return leave;
    });
    res.json({ data: record });
  });
  router.post("/leaves/:id/review-cancellation", approve, async (req, res) => {
    const input = z
      .object({
        approve: z.boolean(),
        reason: z.string().trim().min(3).max(500),
      })
      .parse(req.body);
    const record = await transaction(async (session) => {
      const leave = await Leave.findById(req.params.id).session(session);
      if (!leave) fail(404, "Leave not found");
      if (String(leave.employee) === String(req.user.employee))
        fail(403, "Another authorized reviewer must decide your cancellation");
      if (leave.status !== "Approved" || !leave.cancellationRequested)
        fail(409, "A pending cancellation request is required");
      await lockEmployee(leave.employee, session);
      for (const day of leave.dates) await ensureUnlocked(day, session);
      if (input.approve) {
        const balance = await LeaveBalance.findOne({
          employee: leave.employee,
          policy: leave.policy,
          year: leave.year,
        }).session(session);
        if (!balance || balance.used < leave.days)
          fail(409, "Leave balance requires reconciliation");
        balance.used -= leave.days;
        await balance.save({ session });
        await Attendance.updateMany(
          { employee: leave.employee, date: { $in: leave.dates } },
          { $set: { leaveFraction: 0 } },
          { session },
        );
        await Attendance.updateMany(
          {
            employee: leave.employee,
            date: { $in: leave.dates },
            punchIn: { $exists: false },
            status: "On Leave",
          },
          { $set: { status: "Cancelled Leave" } },
          { session },
        );
        await Attendance.updateMany(
          {
            employee: leave.employee,
            date: { $in: leave.dates },
            punchIn: { $exists: true },
            status: "On Leave",
          },
          { $set: { status: "Present" } },
          { session },
        );
        leave.status = "Cancelled";
        await LeaveLedger.create(
          [
            {
              employee: leave.employee,
              request: leave._id,
              action: "Release",
              days: leave.days,
            },
          ],
          { session },
        );
      }
      leave.cancellationRequested = false;
      leave.decisionReason = input.reason;
      await leave.save({ session });
      await notifyEmployee(
        leave.employee,
        input.approve
          ? "Leave cancellation approved"
          : "Leave cancellation declined",
        input.reason,
        "/leaves",
        session,
      );
      await Audit.create(
        [
          {
            actor: req.user._id,
            action: input.approve
              ? "leave.cancellation.approved"
              : "leave.cancellation.rejected",
            resource: leave.id,
            requestId: req.id,
          },
        ],
        { session },
      );
      return leave;
    });
    res.json({ data: record });
  });
  return router;
}
