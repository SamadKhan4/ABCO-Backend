import { Router } from "express";
import { z } from "zod";
import { Attendance, Leave, Employee } from "../../models.js";
import { Holiday } from "./models.js";
import { ShiftAssignment } from "../attendance/models.js";
import { ShiftOverride } from "../attendance/swaps.js";
import { Training, TrainingEnrollment, Travel } from "../extended/models.js";
import { can } from "../../security.js";
import { addDays } from "../attendance/engine.js";
export function calendarRoutes() {
  const router = Router();
  router.get("/calendar", async (req, res) => {
    const month = z
        .string()
        .regex(/^(20\d{2}|21\d{2})-(0[1-9]|1[0-2])$/)
        .parse(req.query.month),
      kind = z
        .enum([
          "Attendance",
          "Leave",
          "Holidays",
          "Shifts",
          "Training",
          "Travel",
        ])
        .parse(req.query.kind);
    const [year, index] = month.split("-").map(Number),
      start = month + "-01",
      end = new Date(Date.UTC(year, index, 0)).toISOString().slice(0, 10);
    const events = [];
    if (kind === "Attendance") {
      const filter = {
        date: { $gte: start, $lte: end },
        ...(can(req.user, "attendance.read")
          ? {}
          : { employee: req.user.employee || null }),
      };
      const rows = await Attendance.aggregate([
        { $match: filter },
        {
          $group: {
            _id: "$date",
            present: {
              $sum: {
                $cond: [{ $ne: [{ $ifNull: ["$punchIn", null] }, null] }, 1, 0],
              },
            },
            leave: {
              $sum: { $cond: [{ $eq: ["$status", "On Leave"] }, 1, 0] },
            },
            absent: { $sum: { $cond: [{ $eq: ["$status", "Absent"] }, 1, 0] } },
            late: { $sum: { $cond: [{ $gt: ["$lateMinutes", 0] }, 1, 0] } },
          },
        },
      ]);
      for (const row of rows) {
        if (row.present)
          events.push({
            date: row._id,
            title: `${row.present} present`,
            type: "Present",
          });
        if (row.leave)
          events.push({
            date: row._id,
            title: `${row.leave} on leave`,
            type: "On Leave",
          });
        if (row.absent)
          events.push({
            date: row._id,
            title: `${row.absent} absent`,
            type: "Absent",
          });
        if (row.late)
          events.push({
            date: row._id,
            title: `${row.late} late`,
            type: "Late",
          });
      }
    }
    if (kind === "Leave") {
      const rows = await Leave.find({
        startDate: { $lte: end },
        endDate: { $gte: start },
        status: { $in: ["Pending", "Approved"] },
        ...(can(req.user, "leave.read")
          ? {}
          : { employee: req.user.employee || null }),
      })
        .select("employee type dates halfDay status")
        .populate("employee", "firstName lastName")
        .limit(5000);
      for (const row of rows)
        for (const date of row.dates.filter((d) => d >= start && d <= end))
          events.push({
            date,
            title: `${row.employee?.firstName || "Employee"} · ${row.type}${row.halfDay ? " (half day)" : ""}`,
            type: row.status,
          });
    }
    if (kind === "Holidays") {
      const employee = await Employee.findById(req.user.employee).select(
        "branch",
      );
      const holidays = await Holiday.find({
        date: { $gte: start, $lte: end },
        active: { $ne: false },
        ...(can(req.user, "organization.manage")
          ? {}
          : {
              $or: [{ branch: "" }, { branch: employee?.branch || "__none__" }],
            }),
      });
      for (const holiday of holidays)
        events.push({
          date: holiday.date,
          title: holiday.name,
          type: holiday.optional ? "Optional" : "Holiday",
        });
    }
    if (kind === "Shifts") {
      const overrides = await ShiftOverride.find({
        date: { $gte: start, $lte: end },
        active: true,
        ...(can(req.user, "attendance.manage")
          ? {}
          : { employee: req.user.employee || null }),
      }).populate("snapshot.shift", "name");
      const assignments = await ShiftAssignment.find({
        effectiveFrom: { $lte: end },
        ...(can(req.user, "attendance.manage")
          ? {}
          : { employee: req.user.employee || null }),
      })
        .populate("shift", "name")
        .populate("employee", "firstName lastName")
        .sort({ effectiveFrom: -1 })
        .limit(5000);
      const people = [
        ...new Set(assignments.map((a) => String(a.employee?._id))),
      ];
      for (let day = start; day <= end; day = addDays(day, 1)) {
        for (const employee of people) {
          let assignment = assignments.find(
            (a) =>
              String(a.employee?._id) === employee && a.effectiveFrom <= day,
          );
          const override = overrides.find(
            (o) => String(o.employee) === employee && o.date === day,
          );
          if (assignment && override)
            assignment = {
              ...override.snapshot.toObject(),
              employee: assignment.employee,
            };
          if (!assignment) continue;
          const off = assignment.weeklyOffDays.includes(
            new Date(day + "T12:00Z").getUTCDay(),
          );
          events.push({
            date: day,
            title: `${assignment.employee?.firstName} · ${off ? "Weekly off" : `${assignment.shift?.name || "Shift"} ${assignment.startTime}–${assignment.endTime}`}`,
            type: off ? "Weekly Off" : "Shift",
          });
        }
      }
    }
    if (kind === "Training") {
      const enrollments = can(req.user, "training.manage")
        ? null
        : await TrainingEnrollment.find({
            employee: req.user.employee || null,
          }).select("training");
      const programs = await Training.find({
        startDate: { $lte: end },
        endDate: { $gte: start },
        status: { $ne: "Cancelled" },
        ...(enrollments
          ? { _id: { $in: enrollments.map((e) => e.training) } }
          : {}),
      }).limit(500);
      for (const program of programs)
        for (
          let day = program.startDate > start ? program.startDate : start;
          day <= program.endDate && day <= end;
          day = addDays(day, 1)
        )
          events.push({ date: day, title: program.title, type: "Training" });
    }
    if (kind === "Travel") {
      const trips = await Travel.find({
        startDate: { $lte: end },
        endDate: { $gte: start },
        status: { $nin: ["Rejected", "Cancelled"] },
        ...(can(req.user, "travel.approve")
          ? {}
          : { employee: req.user.employee || null }),
      }).limit(500);
      for (const trip of trips)
        for (
          let day = trip.startDate > start ? trip.startDate : start;
          day <= trip.endDate && day <= end;
          day = addDays(day, 1)
        )
          events.push({
            date: day,
            title: trip.destination,
            type: trip.status,
          });
    }
    res.json({ data: { month, kind, events } });
  });
  return router;
}
