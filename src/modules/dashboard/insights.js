import { Router } from "express";
import { Employee, Attendance, Leave } from "../../models.js";
import { PayrollEntry, PayrollPeriod } from "../payroll/models.js";
import { Holiday } from "../operations/models.js";
import { Document } from "../documents/routes.js";
import { ShiftAssignment } from "../attendance/models.js";
import { can, workDate } from "../../security.js";
import { addDays } from "../attendance/engine.js";
export function dashboardInsights() {
  const router = Router();
  router.get("/dashboard-insights", async (req, res) => {
    const broad = can(req.user, "employee.read"),
      today = workDate(),
      weekStart = addDays(today, -6),
      nextWeek = addDays(today, 7);
    const filter = broad
      ? { status: { $ne: "Archived" } }
      : { _id: req.user.employee || null, status: { $ne: "Archived" } };
    const employees = await Employee.find(filter)
        .select(
          "firstName lastName code department branch dateOfBirth joiningDate",
        )
        .lean(),
      ids = employees.map((e) => e._id);
    const [attendance, leaves, holidays, assignments, documents] =
      await Promise.all([
        Attendance.find({
          employee: { $in: ids },
          date: { $gte: weekStart, $lte: today },
        }).lean(),
        Leave.find({
          employee: { $in: ids },
          status: "Approved",
          dates: today,
        }).lean(),
        Holiday.find({
          date: { $gte: today, $lte: nextWeek },
          $or: [
            { branch: "" },
            { branch: { $in: employees.map((e) => e.branch) } },
          ],
        })
          .sort({ date: 1 })
          .lean(),
        ShiftAssignment.find({
          employee: { $in: ids },
          effectiveFrom: { $lte: today },
        })
          .sort({ effectiveFrom: -1 })
          .lean(),
        Document.find({
          employee: { $in: ids },
          ...(can(req.user, "documents.manage")
            ? {}
            : { employee: req.user.employee || null, visibility: "Employee" }),
          expiresAt: { $gte: today, $lte: addDays(today, 30) },
        })
          .select("name expiresAt employee")
          .limit(10)
          .lean(),
      ]);
    const current = attendance.filter((a) => a.date === today),
      onLeaveIds = new Set(leaves.map((l) => String(l.employee))),
      presentIds = new Set(
        current.filter((a) => a.punchIn).map((a) => String(a.employee)),
      );
    let scheduled = 0,
      absent = 0,
      unconfigured = 0;
    for (const employee of employees) {
      const assignment = assignments.find(
        (a) => String(a.employee) === String(employee._id),
      );
      if (!assignment) {
        unconfigured++;
        continue;
      }
      const weekday = new Date(today + "T12:00Z").getUTCDay(),
        holiday = holidays.some(
          (h) =>
            h.date === today &&
            !h.optional &&
            (!h.branch || h.branch === employee.branch),
        );
      if (assignment.weeklyOffDays.includes(weekday) || holiday) continue;
      scheduled++;
      if (
        !presentIds.has(String(employee._id)) &&
        !onLeaveIds.has(String(employee._id))
      )
        absent++;
    }
    const trend = Array.from({ length: 7 }, (_, index) => {
      const date = addDays(weekStart, index),
        records = attendance.filter((a) => a.date === date);
      return {
        date,
        present: records.filter((a) => a.punchIn).length,
        onLeave: records.filter((a) => a.status === "On Leave").length,
        late: records.filter((a) => a.lateMinutes > 0).length,
      };
    });
    const celebrations = [];
    for (const employee of employees) {
      for (const [kind, date] of [
        ["Birthday", employee.dateOfBirth],
        ["Work anniversary", employee.joiningDate?.toISOString().slice(0, 10)],
      ]) {
        if (!date) continue;
        let next = today.slice(0, 4) + date.slice(4);
        if (next < today)
          next = String(Number(today.slice(0, 4)) + 1) + date.slice(4);
        if (next <= nextWeek)
          celebrations.push({
            name: `${employee.firstName} ${employee.lastName}`.trim(),
            kind,
            date: next,
          });
      }
    }
    let payroll = null;
    if (can(req.user, "payroll.view")) {
      const periods = await PayrollPeriod.find({
        status: { $in: ["Finalized", "Paid", "Closed"] },
      })
        .sort({ month: -1 })
        .limit(6)
        .lean();
      payroll = [];
      for (const period of periods) {
        const entries = await PayrollEntry.find({ period: period._id })
          .select("gross deductionsTotal net")
          .lean();
        payroll.push({
          month: period.month,
          gross: entries.reduce((sum, e) => sum + e.gross, 0),
          deductions: entries.reduce((sum, e) => sum + e.deductionsTotal, 0),
          net: entries.reduce((sum, e) => sum + e.net, 0),
          employees: entries.length,
        });
      }
    }
    res.json({
      data: {
        today,
        present: presentIds.size,
        onLeave: onLeaveIds.size,
        late: current.filter((a) => a.lateMinutes > 0).length,
        missingPunch: current.filter((a) => a.punchIn && !a.punchOut).length,
        scheduled,
        absent,
        unconfigured,
        trend,
        holidays,
        celebrations: celebrations.sort((a, b) => a.date.localeCompare(b.date)),
        expiringDocuments: documents,
        payroll,
      },
    });
  });
  return router;
}
