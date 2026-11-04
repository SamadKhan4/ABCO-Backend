import { resolveShift } from "./swaps.js";
import { Router } from "express";
import { z } from "zod";
import { Attendance, Employee, Organization, Leave } from "../../models.js";
import { ShiftAssignment, Regularization } from "./models.js";
import { PayrollPeriod } from "../payroll/models.js";
import { DailyReport, CompanySettings, Holiday } from "../operations/models.js";
import { can, workDate } from "../../security.js";
import {
  id,
  date,
  text,
  longText,
  fail,
  permit,
  ownEmployee,
  activeEmployee,
  audit,
  list,
  transaction,
} from "../../shared/workflow.js";
import { localDate, shiftOccurrence, summarize } from "./engine.js";
import { notifyEmployee } from "../operations/routes.js";

export async function ensureUnlocked(date, session) {
  if (
    await PayrollPeriod.exists({
      startDate: { $lte: date },
      endDate: { $gte: date },
      status: { $ne: "Draft" },
    }).session(session || null)
  )
    fail(
      409,
      "This workday is locked by payroll. Use an authorized adjustment in a later period.",
    );
}
async function lock(employee, session) {
  const record = await Employee.findOneAndUpdate(
    { _id: employee, status: { $ne: "Archived" } },
    { $inc: { leaveVersion: 1 } },
    { new: true, session },
  );
  if (!record) fail(409, "An active employee profile is required");
  return record;
}
export function attendanceRoutes() {
  const router = Router();
  router.get("/attendance/options", async (req, res) => {
    const settings = await CompanySettings.findById("company");
    res.json({
      data: {
        modes: settings?.allowWorkFromHome
          ? ["Office", "Work From Home"]
          : ["Office"],
        shiftSwapsAllowed: settings?.allowShiftSwaps === true,
      },
    });
  });
  router.get(
    "/shift-assignments",
    permit("attendance.manage"),
    async (req, res) =>
      res.json(
        await list(ShiftAssignment, {}, req, {
          populate: [
            { path: "employee", select: "firstName lastName code" },
            { path: "shift", select: "name" },
          ],
        }),
      ),
  );
  router.post(
    "/shift-assignments",
    permit("attendance.manage"),
    async (req, res) => {
      const input = z
        .object({
          employee: id,
          shift: id,
          effectiveFrom: date,
          timezone: z.string().refine((value) => {
            try {
              new Intl.DateTimeFormat("en", { timeZone: value });
              return true;
            } catch {
              return false;
            }
          }, "Invalid timezone"),
          fullDayMinutes: z.number().int().min(60).max(1440),
          halfDayMinutes: z.number().int().min(1).max(1440),
          weeklyOffDays: z.array(z.number().int().min(0).max(6)).max(6),
        })
        .refine(
          (v) => v.halfDayMinutes < v.fullDayMinutes,
          "Half day threshold must be less than full day",
        )
        .parse(req.body);
      if (input.effectiveFrom < workDate())
        fail(422, "Shift assignments must take effect today or later");
      await activeEmployee(input.employee);
      const shift = await Organization.findOne({
        _id: input.shift,
        kind: "shifts",
        active: true,
      });
      if (!shift?.startTime || !shift.endTime)
        fail(422, "Choose a configured active shift");
      const record = await ShiftAssignment.create({
        ...input,
        startTime: shift.startTime,
        endTime: shift.endTime,
        graceMinutes: shift.graceMinutes,
        createdBy: req.user._id,
      });
      await audit(req, "shift.assigned", record.id);
      res.status(201).json({ data: record });
    },
  );
  router.get("/attendance/me", async (req, res) =>
    res.json({
      data: await Attendance.find({ employee: req.user.employee || null })
        .sort({ date: -1 })
        .limit(62)
        .lean(),
    }),
  );
  router.get("/attendance", permit("attendance.read"), async (req, res) => {
    const filter = {};
    if (req.query.date) filter.date = date.parse(req.query.date);
    else if (req.query.from || req.query.to) {
      filter.date = {};
      if (req.query.from) filter.date.$gte = date.parse(req.query.from);
      if (req.query.to) filter.date.$lte = date.parse(req.query.to);
    } else filter.date = workDate();
    res.json(
      await list(Attendance, filter, req, {
        populate: {
          path: "employee",
          select: "firstName lastName code department",
        },
      }),
    );
  });
  router.post("/attendance/punch-in", async (req, res) => {
    const record = await transaction(async (session) => {
      const employee = await lock(ownEmployee(req), session);
      const now = new Date();
      const mode = z
        .enum(["Office", "Work From Home"])
        .default("Office")
        .parse(req.body.mode);
      const settings =
        await CompanySettings.findById("company").session(session);
      if (mode === "Work From Home" && !settings?.allowWorkFromHome)
        fail(422, "Work-from-home attendance is not enabled by company policy");
      const open = await Attendance.findOne({
        employee: employee._id,
        punchIn: { $exists: true },
        punchOut: null,
      })
        .sort({ punchIn: -1 })
        .session(session);
      if (open) {
        if (now - open.punchIn > 36 * 3600000)
          fail(
            409,
            "An earlier workday has a missing punch. Request a correction before starting another.",
          );
        return open;
      }
      const resolved = await resolveShift(employee, now, session),
        assignment = resolved.assignment,
        occurrence = resolved.occurrence;
      let shiftSnapshot;
      if (assignment)
        shiftSnapshot = {
          name: assignment.shift,
          startTime: assignment.startTime,
          endTime: assignment.endTime,
          timezone: assignment.timezone,
          fullDayMinutes: assignment.fullDayMinutes,
          halfDayMinutes: assignment.halfDayMinutes,
          graceMinutes: assignment.graceMinutes,
        };
      await ensureUnlocked(occurrence.date, session);
      if (
        await Leave.exists({
          employee: employee._id,
          status: "Approved",
          halfDay: { $ne: true },
          dates: occurrence.date,
        }).session(session)
      )
        fail(409, "Approved leave is recorded for this workday");
      let attendance = await Attendance.findOne({
        employee: employee._id,
        date: occurrence.date,
      }).session(session);
      if (attendance?.punchIn) return attendance;
      const holiday = await Holiday.exists({
        date: occurrence.date,
        optional: false,
        active: { $ne: false },
        $or: [{ branch: "" }, { branch: employee.branch }],
      }).session(session);
      const weeklyOff = assignment?.weeklyOffDays.includes(
        new Date(occurrence.date + "T12:00Z").getUTCDay(),
      );
      const values = {
        mode,
        employee: employee._id,
        date: occurrence.date,
        punchIn: now,
        status: "Present",
        timezone: occurrence.timezone,
        scheduledStart: occurrence.start,
        scheduledEnd: occurrence.end,
        shiftSnapshot,
        dayType: holiday ? "Holiday" : weeklyOff ? "Weekly Off" : "Working Day",
        lateMinutes: occurrence.start
          ? Math.max(
              0,
              Math.floor((now - occurrence.start) / 60000) -
                (assignment.graceMinutes || 0),
            )
          : 0,
      };
      if (attendance) {
        Object.assign(attendance, values);
        await attendance.save({ session });
      } else {
        [attendance] = await Attendance.create([values], { session });
      }
      await audit(req, "attendance.punched-in", attendance.id, session);
      return attendance;
    });
    res.json({ data: record });
  });
  async function endDay(req, res, manual = false) {
    const record = await transaction(async (session) => {
      const employee = manual ? id.parse(req.body.employee) : ownEmployee(req);
      const person = await lock(employee, session);
      const attendance = await Attendance.findOne({
        employee,
        punchIn: { $exists: true },
        punchOut: null,
      })
        .sort({ punchIn: -1 })
        .session(session);
      if (!attendance) {
        const latest = await Attendance.findOne({
          employee,
          punchOut: { $ne: null },
        })
          .sort({ punchOut: -1 })
          .session(session);
        if (latest && Date.now() - latest.punchOut < 36 * 3600000)
          return latest;
        fail(409, "Punch in first");
      }
      await ensureUnlocked(attendance.date, session);
      if (attendance.breaks.some((b) => !b.end))
        fail(409, "End your break before punching out");
      const settings =
        await CompanySettings.findById("company").session(session);
      if (
        !manual &&
        settings?.requireDailyReport &&
        (!settings.dailyReportDepartments.length ||
          settings.dailyReportDepartments.includes(person.department)) &&
        !(await DailyReport.exists({
          employee,
          date: attendance.date,
          status: { $in: ["Submitted", "Reviewed", "Approved"] },
        }).session(session))
      )
        fail(409, "Submit your daily work report before punching out");
      if (manual) longText.parse(req.body.reason);
      const now = new Date();
      if (now - attendance.punchIn > 36 * 3600000)
        fail(409, "Submit a regularization request for this missing punch");
      attendance.punchOut = now;
      Object.assign(attendance, summarize(attendance, now));
      await attendance.save({ session });
      await audit(
        req,
        manual ? "attendance.manually-closed" : "attendance.punched-out",
        attendance.id,
        session,
      );
      return attendance;
    });
    res.json({ data: record });
  }
  router.post("/attendance/punch-out", (req, res) => endDay(req, res));
  router.post(
    "/attendance/manual-close",
    permit("attendance.manage"),
    (req, res) => endDay(req, res, true),
  );
  for (const action of ["start", "end"])
    router.post(`/attendance/break-${action}`, async (req, res) => {
      const record = await transaction(async (session) => {
        const employee = ownEmployee(req);
        await lock(employee, session);
        const attendance = await Attendance.findOne({
          employee,
          punchIn: { $exists: true },
          punchOut: null,
        }).session(session);
        if (!attendance) fail(409, "An active workday is required");
        await ensureUnlocked(attendance.date, session);
        const current = attendance.breaks.find((b) => !b.end);
        if (action === "start") {
          if (current) return attendance;
          attendance.breaks.push({ start: new Date() });
        } else {
          if (!current) fail(409, "No active break");
          current.end = new Date();
        }
        await attendance.save({ session });
        return attendance;
      });
      res.json({ data: record });
    });
  router.get("/attendance/regularizations", async (req, res) =>
    res.json(
      await list(
        Regularization,
        can(req.user, "attendance.regularize")
          ? {}
          : { employee: req.user.employee || null },
        req,
        { populate: { path: "employee", select: "firstName lastName code" } },
      ),
    ),
  );
  router.post("/attendance/regularizations", async (req, res) => {
    const input = z
      .object({
        date,
        requestedIn: z.iso.datetime(),
        requestedOut: z.iso.datetime(),
        reason: longText,
      })
      .refine(
        (v) => v.requestedOut > v.requestedIn,
        "Punch out must follow punch in",
      )
      .refine(
        (v) =>
          new Date(v.requestedOut) - new Date(v.requestedIn) <= 36 * 3600000,
        "A workday cannot exceed 36 hours",
      )
      .parse(req.body);
    if (new Date(input.requestedOut) > new Date())
      fail(422, "Future corrections are not allowed");
    const employee = ownEmployee(req);
    const existing = await Attendance.findOne({ employee, date: input.date });
    if (
      localDate(
        new Date(input.requestedIn),
        existing?.timezone || "Asia/Kolkata",
      ) !== input.date
    )
      fail(422, "Punch-in must match the requested local workday");
    await ensureUnlocked(input.date);
    const record = await Regularization.create({
      ...input,
      employee,
      originalIn: existing?.punchIn,
      originalOut: existing?.punchOut,
    });
    await audit(req, "attendance.correction.requested", record.id);
    res.status(201).json({ data: record });
  });
  for (const decision of ["approve", "reject"])
    router.post(
      `/attendance/regularizations/:id/${decision}`,
      permit("attendance.regularize"),
      async (req, res) => {
        const record = await transaction(async (session) => {
          const request = await Regularization.findById(req.params.id).session(
            session,
          );
          if (!request) fail(404, "Correction request not found");
          const status = decision === "approve" ? "Approved" : "Rejected";
          if (request.status === status) return request;
          if (request.status !== "Pending")
            fail(409, "Correction already decided");
          if (String(request.employee) === String(req.user.employee))
            fail(403, "Another authorized person must review your correction");
          await lock(request.employee, session);
          await ensureUnlocked(request.date, session);
          const reason = longText.parse(req.body.reason);
          if (decision === "approve") {
            if (
              await Leave.exists({
                employee: request.employee,
                status: "Approved",
                dates: request.date,
              }).session(session)
            )
              fail(409, "Approved leave must be reconciled first");
            let attendance = await Attendance.findOne({
              employee: request.employee,
              date: request.date,
            }).session(session);
            if (!attendance)
              attendance = new Attendance({
                employee: request.employee,
                date: request.date,
                timezone: "Asia/Kolkata",
              });
            if (
              String(attendance.punchIn || "") !==
                String(request.originalIn || "") ||
              String(attendance.punchOut || "") !==
                String(request.originalOut || "")
            )
              fail(
                409,
                "Attendance changed after this request. Submit a fresh correction.",
              );
            if (
              attendance.breaks.some(
                (b) =>
                  !b.end ||
                  b.start < request.requestedIn ||
                  b.end > request.requestedOut,
              )
            )
              fail(409, "Requested times conflict with recorded breaks");
            attendance.corrections.push({
              request: request._id,
              originalIn: attendance.punchIn,
              originalOut: attendance.punchOut,
              newIn: request.requestedIn,
              newOut: request.requestedOut,
              actor: req.user._id,
              at: new Date(),
            });
            attendance.punchIn = request.requestedIn;
            attendance.punchOut = request.requestedOut;
            attendance.status = "Present";
            Object.assign(
              attendance,
              summarize(attendance, request.requestedOut),
            );
            await attendance.save({ session });
          }
          request.status = status;
          request.approver = req.user._id;
          request.decisionReason = reason;
          await request.save({ session });
          await audit(
            req,
            "attendance.correction." + decision,
            request.id,
            session,
          );
          await notifyEmployee(
            request.employee,
            "Attendance correction " + status.toLowerCase(),
            reason,
            "/attendance",
            session,
          );
          return request;
        });
        res.json({ data: record });
      },
    );
  return router;
}
