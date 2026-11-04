import mongoose from "mongoose";
import { Router } from "express";
import { z } from "zod";
import { scopedModel, systemScope } from "../../shared/scope.js";
import { Employee, Attendance, Organization } from "../../models.js";
import { CompanySettings } from "../operations/models.js";
import { ShiftAssignment } from "./models.js";
import { can, workDate } from "../../security.js";
import {
  id,
  date,
  longText,
  fail,
  permit,
  ownEmployee,
  audit,
  list,
  transaction,
} from "../../shared/workflow.js";
import { ensureUnlocked } from "./routes.js";
import { shiftOccurrence, localDate, addDays } from "./engine.js";
const { Schema } = mongoose,
  ref = (name) => ({ type: Schema.Types.ObjectId, ref: name }),
  options = { timestamps: true, strict: "throw", optimisticConcurrency: true };
export const ShiftSwap = mongoose.model(
  "ShiftSwap",
  new Schema(
    {
      employee: ref("Employee"),
      otherEmployee: ref("Employee"),
      date: String,
      reason: String,
      status: {
        type: String,
        enum: [
          "Requested",
          "Accepted",
          "Approved",
          "Rejected",
          "Cancelled",
          "Reversed",
        ],
        default: "Requested",
      },
      approver: ref("User"),
      decisionReason: String,
    },
    options,
  ),
);
const snapshot = new Schema(
  {
    shift: ref("Organization"),
    timezone: String,
    startTime: String,
    endTime: String,
    graceMinutes: Number,
    fullDayMinutes: Number,
    halfDayMinutes: Number,
    weeklyOffDays: [Number],
  },
  { _id: false },
);
const overrideSchema = new Schema(
  {
    employee: ref("Employee"),
    date: String,
    swap: ref("ShiftSwap"),
    snapshot,
    active: { type: Boolean, default: true },
  },
  options,
);
overrideSchema.index(
  { employee: 1, date: 1 },
  { unique: true, partialFilterExpression: { active: true } },
);
export const ShiftOverride = scopedModel("ShiftOverride", overrideSchema);
const summarize = (shift) => ({
  shift: shift.shift,
  timezone: shift.timezone,
  startTime: shift.startTime,
  endTime: shift.endTime,
  graceMinutes: shift.graceMinutes,
  fullDayMinutes: shift.fullDayMinutes,
  halfDayMinutes: shift.halfDayMinutes,
  weeklyOffDays: shift.weeklyOffDays,
});
export async function resolveShift(employee, now, session) {
  const candidates = await ShiftAssignment.find({
    employee: employee._id,
    effectiveFrom: { $lte: addDays(workDate(now), 1) },
  })
    .sort({ effectiveFrom: -1 })
    .limit(100)
    .session(session || null);
  let base;
  for (const candidate of candidates) {
    const occurrence = shiftOccurrence(now, candidate);
    if (occurrence.date >= candidate.effectiveFrom) {
      base = candidate;
      break;
    }
  }
  const branch = employee.branchId
    ? await Organization.findById(employee.branchId).session(session || null)
    : null;
  const timezone = base?.timezone || branch?.timezone || "Asia/Kolkata",
    today = localDate(now, timezone);
  const overrides = await ShiftOverride.find({
    employee: employee._id,
    date: { $in: [today, addDays(today, -1)] },
    active: true,
  })
    .sort({ date: -1 })
    .session(session || null);
  for (const override of overrides) {
    const occurrence = shiftOccurrence(now, override.snapshot);
    if (occurrence.date === override.date)
      return { assignment: override.snapshot, occurrence };
  }
  return base
    ? { assignment: base, occurrence: shiftOccurrence(now, base) }
    : { assignment: null, occurrence: { date: today, timezone } };
}
async function policy(session) {
  const company = await CompanySettings.findById("company").session(
    session || null,
  );
  if (!company?.allowShiftSwaps)
    fail(422, "Shift swaps are not enabled in company policy");
}
async function reviewAccess(req, record) {
  if (can(req.user, "attendance.manage")) return;
  if (!can(req.user, "shifts.approve"))
    fail(403, "Shift approval permission required");
  const count = await Employee.countDocuments({
    _id: { $in: [record.employee, record.otherEmployee] },
  });
  if (count !== 2)
    fail(403, "Both employees must be within your authorized team");
}
export function shiftSwapRoutes() {
  const router = Router();
  router.get("/shift-swap-colleagues", async (req, res) => {
    await policy();
    const employee = await Employee.findById(ownEmployee(req));
    res.json({
      data: await systemScope(() =>
        Employee.find({
          branch: employee.branch,
          status: { $ne: "Archived" },
          _id: { $ne: employee._id },
        })
          .select("firstName lastName code")
          .limit(1000)
          .lean(),
      ),
    });
  });
  router.get("/shift-swaps", async (req, res) => {
    let filter;
    if (can(req.user, "attendance.manage")) filter = {};
    else if (can(req.user, "shifts.approve")) {
      const people = await Employee.find().select("_id"),
        ids = people.map((p) => p._id);
      filter = { employee: { $in: ids }, otherEmployee: { $in: ids } };
    } else
      filter = {
        $or: [
          { employee: req.user.employee || null },
          { otherEmployee: req.user.employee || null },
        ],
      };
    res.json(
      await systemScope(() =>
        list(ShiftSwap, filter, req, {
          populate: [
            { path: "employee", select: "firstName lastName code" },
            { path: "otherEmployee", select: "firstName lastName code" },
          ],
        }),
      ),
    );
  });
  router.post("/shift-swaps", async (req, res) => {
    await policy();
    const input = z
        .object({ otherEmployee: id, date, reason: longText })
        .parse(req.body),
      employee = await Employee.findById(ownEmployee(req));
    if (input.otherEmployee === String(employee._id))
      fail(422, "Choose another colleague");
    if (input.date < workDate())
      fail(422, "Only today or future workdays may be swapped");
    const other = await systemScope(() =>
      Employee.findOne({
        _id: input.otherEmployee,
        status: { $ne: "Archived" },
        branch: employee.branch,
      }).select("_id"),
    );
    if (!other) fail(422, "Choose an active colleague in your branch");
    const record = await ShiftSwap.create({ ...input, employee: employee._id });
    await audit(req, "shift-swap.requested", record.id);
    res.status(201).json({ data: record });
  });
  router.post("/shift-swaps/:id/respond", async (req, res) => {
    const input = z
      .object({ accept: z.boolean(), reason: longText })
      .parse(req.body);
    const record = await ShiftSwap.findById(req.params.id);
    if (!record) fail(404, "Swap request not found");
    if (String(record.otherEmployee) !== ownEmployee(req))
      fail(403, "Only the requested colleague can respond");
    if (record.status !== "Requested")
      fail(409, "The swap has already received a response");
    if (record.date < workDate()) fail(409, "The workday has already passed");
    record.status = input.accept ? "Accepted" : "Rejected";
    record.decisionReason = input.reason;
    await record.save();
    await audit(req, "shift-swap.responded", record.id);
    res.json({ data: record });
  });
  router.post("/shift-swaps/:id/review", async (req, res) => {
    const input = z
      .object({ approve: z.boolean(), reason: longText })
      .parse(req.body);
    const record = await transaction(async (session) => {
      await policy(session);
      const record = await ShiftSwap.findById(req.params.id).session(session);
      if (!record) fail(404, "Swap request not found");
      await reviewAccess(req, record);
      if (
        [String(record.employee), String(record.otherEmployee)].includes(
          String(req.user.employee),
        )
      )
        fail(403, "A different manager must review your swap");
      if (record.status !== "Accepted")
        fail(409, "Colleague consent is required");
      if (record.date < workDate()) fail(409, "The workday has already passed");
      await ensureUnlocked(record.date, session);
      const people = await Employee.find({
        _id: { $in: [record.employee, record.otherEmployee] },
        status: { $ne: "Archived" },
      }).session(session);
      if (people.length !== 2) fail(409, "Both employees must remain active");
      for (const person of [...people].sort((a, b) => a.id.localeCompare(b.id)))
        await Employee.updateOne(
          { _id: person._id },
          { $inc: { leaveVersion: 1 } },
          { session },
        );
      if (input.approve) {
        if (
          await Attendance.exists({
            employee: { $in: people.map((p) => p._id) },
            date: record.date,
            punchIn: { $exists: true },
          }).session(session)
        )
          fail(409, "Attendance has already started for this workday");
        const first = await ShiftAssignment.findOne({
            employee: record.employee,
            effectiveFrom: { $lte: record.date },
          })
            .sort({ effectiveFrom: -1 })
            .session(session),
          second = await ShiftAssignment.findOne({
            employee: record.otherEmployee,
            effectiveFrom: { $lte: record.date },
          })
            .sort({ effectiveFrom: -1 })
            .session(session);
        if (!first || !second || first.timezone !== second.timezone)
          fail(
            422,
            "Both employees need assigned shifts in the same branch timezone",
          );
        await ShiftOverride.create(
          [
            {
              employee: record.employee,
              date: record.date,
              swap: record._id,
              snapshot: summarize(second),
            },
            {
              employee: record.otherEmployee,
              date: record.date,
              swap: record._id,
              snapshot: summarize(first),
            },
          ],
          { session, ordered: true },
        );
        record.status = "Approved";
      } else record.status = "Rejected";
      record.approver = req.user._id;
      record.decisionReason = input.reason;
      await record.save({ session });
      await audit(req, "shift-swap.reviewed", record.id, session);
      return record;
    });
    res.json({ data: record });
  });
  router.post("/shift-swaps/:id/cancel", async (req, res) => {
    const record = await ShiftSwap.findOne({
      _id: req.params.id,
      employee: ownEmployee(req),
      status: { $in: ["Requested", "Accepted"] },
    });
    if (!record) fail(409, "Only your unapproved swap may be cancelled");
    record.status = "Cancelled";
    await record.save();
    await audit(req, "shift-swap.cancelled", record.id);
    res.json({ data: record });
  });
  router.post(
    "/shift-swaps/:id/reverse",
    permit("attendance.manage"),
    async (req, res) => {
      const reason = longText.parse(req.body.reason);
      const record = await transaction(async (session) => {
        const record = await ShiftSwap.findOne({
          _id: req.params.id,
          status: "Approved",
        }).session(session);
        if (!record) fail(409, "Approved swap required");
        if (record.date < workDate())
          fail(409, "Past swaps preserve their applied schedule");
        await ensureUnlocked(record.date, session);
        for (const employee of [record.employee, record.otherEmployee].sort(
          (a, b) => String(a).localeCompare(String(b)),
        ))
          await Employee.updateOne(
            { _id: employee },
            { $inc: { leaveVersion: 1 } },
            { session },
          );
        if (
          await Attendance.exists({
            employee: { $in: [record.employee, record.otherEmployee] },
            date: record.date,
            punchIn: { $exists: true },
          }).session(session)
        )
          fail(409, "The workday has already started");
        await ShiftOverride.updateMany(
          { swap: record._id, active: true },
          { $set: { active: false } },
          { session },
        );
        record.status = "Reversed";
        record.decisionReason = reason;
        await record.save({ session });
        await audit(req, "shift-swap.reversed", record.id, session);
        return record;
      });
      res.json({ data: record });
    },
  );
  return router;
}
