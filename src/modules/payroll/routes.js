import { reserveLoanRecoveries, postLoanRecoveries } from "./loans.js";
import { BankAccount, PayrollAdjustment } from "./finance.js";
import { Router } from "express";
import { z } from "zod";
import { payslipPDF } from "./payslip.js";
import { zipFiles } from "../../shared/zip.js";
import { CompanySettings } from "../operations/models.js";
import { SalaryStructure, PayrollPeriod, PayrollEntry } from "./models.js";
import { Employee, Attendance, Leave } from "../../models.js";
import { can, workDate } from "../../security.js";
import {
  id,
  text,
  fail,
  permit,
  activeEmployee,
  audit,
  list,
  transaction,
} from "../../shared/workflow.js";
import { notifyEmployee } from "../operations/routes.js";
import { calculateSalary, toPaise } from "./calculator.js";

const amount = z
  .string()
  .regex(
    /^\d{1,9}(\.\d{1,2})?$/,
    "Enter an amount with up to two decimal places",
  )
  .transform(toPaise);
const component = z.object({
  name: text,
  amount,
  prorate: z.boolean().default(true),
});
export function payrollRoutes() {
  const router = Router();
  router.get(
    "/payroll/periods/:id/payslips",
    permit("payroll.view"),
    async (req, res) => {
      const period = await PayrollPeriod.findById(req.params.id);
      if (!period) fail(404, "Payroll not found");
      if (!["Finalized", "Paid", "Closed"].includes(period.status))
        fail(409, "Payslips must be released first");
      if ((await PayrollEntry.countDocuments({ period: period._id })) > 1000)
        fail(
          422,
          "Bulk archive is limited to 1000 payslips; use individual downloads for larger runs",
        );
      const entries = await PayrollEntry.find({ period: period._id }).lean(),
        files = [];
      let bytes = 0;
      for (const entry of entries) {
        const data = await payslipPDF({ ...entry, period });
        bytes += data.length;
        if (bytes > 64 * 1024 * 1024)
          fail(422, "Archive exceeds 64 MB; use individual downloads");
        files.push({ name: `payslip-${period.month}-${entry._id}.pdf`, data });
      }
      const archive = zipFiles(files);
      await audit(req, "payslips.bulk-downloaded", period.id);
      res
        .set({
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="payslips-${period.month}.zip"`,
          "Cache-Control": "no-store",
        })
        .send(archive);
    },
  );
  router.get("/salary-structures", permit("payroll.view"), async (req, res) =>
    res.json(
      await list(SalaryStructure, {}, req, {
        populate: {
          path: "employee",
          select: "firstName lastName code department",
        },
      }),
    ),
  );
  router.post(
    "/salary-structures",
    permit("payroll.process"),
    async (req, res) => {
      const input = z
        .object({
          employee: id,
          overtimeRate: amount.default("0"),
          effectiveDate: z.iso
            .date()
            .refine(
              (v) => v.endsWith("-01"),
              "Salary revisions must start on the first of a month",
            ),
          earnings: z.array(component).min(1).max(30),
          deductions: z.array(component).max(30).default([]),
          employerContributions: z.array(component).max(30).default([]),
        })
        .parse(req.body);
      const record = await transaction(async (session) => {
        const employee = await Employee.findOneAndUpdate(
          { _id: input.employee, status: { $ne: "Archived" } },
          { $inc: { leaveVersion: 1 } },
          { session, new: true },
        );
        if (!employee) fail(422, "Choose an active employee");
        if (
          await PayrollPeriod.exists({
            startDate: { $gte: input.effectiveDate },
            status: { $ne: "Draft" },
          }).session(session)
        )
          fail(
            409,
            "A calculated payroll period locks this effective date. Use a future salary revision.",
          );
        const [record] = await SalaryStructure.create(
          [
            {
              ...input,
              createdBy: req.user._id,
            },
          ],
          { session },
        );
        await audit(req, "salary.structure.created", record.id, session);
        return record;
      });
      res.status(201).json({ data: record });
    },
  );
  router.get("/payroll/periods", permit("payroll.view"), async (req, res) =>
    res.json(await list(PayrollPeriod, {}, req)),
  );
  router.post(
    "/payroll/periods",
    permit("payroll.process"),
    async (req, res) => {
      const input = z
        .object({
          month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
          payBasis: z.enum(["Calendar days", "Recorded attendance"]),
        })
        .parse(req.body);
      const [y, m] = input.month.split("-").map(Number);
      const record = await PayrollPeriod.create({
        ...input,
        startDate: input.month + "-01",
        endDate: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10),
      });
      await audit(req, "payroll.period.created", record.id);
      res.status(201).json({ data: record });
    },
  );
  router.post(
    "/payroll/periods/:id/calculate",
    permit("payroll.process"),
    async (req, res) => {
      const period = await transaction(async (session) => {
        const period = await PayrollPeriod.findById(req.params.id).session(
          session,
        );
        if (!period) fail(404, "Payroll period not found");
        if (period.status === "Calculated") return period;
        if (period.status !== "Draft")
          fail(409, "Only draft payroll can be calculated");
        if (period.endDate >= workDate())
          fail(409, "Calculate payroll after the period has ended");
        if (
          await Leave.exists({
            status: "Pending",
            startDate: { $lte: period.endDate },
            endDate: { $gte: period.startDate },
          }).session(session)
        )
          fail(409, "Resolve pending leave for this period first");
        const salaries = await SalaryStructure.find({
          effectiveDate: { $lte: period.startDate },
        })
          .sort({ effectiveDate: -1 })
          .session(session);
        const latest = new Map();
        for (const salary of salaries)
          if (!latest.has(String(salary.employee)))
            latest.set(String(salary.employee), salary);
        if (!latest.size)
          fail(409, "Configure at least one applicable salary structure");
        const periodDays = Number(period.endDate.slice(-2));
        const entries = [];
        for (const [employeeId, salary] of latest) {
          const employee = await Employee.findOneAndUpdate(
            { _id: employeeId },
            { $inc: { leaveVersion: 1 } },
            { new: true, session },
          );
          if (
            !employee ||
            employee.joiningDate.toISOString().slice(0, 10) > period.endDate
          )
            continue;
          const joined = employee.joiningDate.toISOString().slice(0, 10),
            start = joined > period.startDate ? joined : period.startDate;
          const end =
            employee.lastWorkingDate &&
            employee.lastWorkingDate < period.endDate
              ? employee.lastWorkingDate
              : period.endDate;
          if (end < start) continue;
          const eligibleDays =
            Math.round((new Date(end) - new Date(start)) / 86400000) + 1;
          const attendance = await Attendance.find({
            employee: employee._id,
            date: { $gte: start, $lte: end },
          }).session(session);
          if (attendance.some((a) => a.punchIn && !a.punchOut))
            fail(409, `Resolve missing punch-out for ${employee.code}`);
          const adjustments = await PayrollAdjustment.find({
            employee: employee._id,
            month: period.month,
            status: "Approved",
          }).session(session);
          const unpaid = await Leave.find({
            employee: employee._id,
            status: "Approved",
            paid: false,
            startDate: { $lte: end },
            endDate: { $gte: start },
          }).session(session);
          const unpaidDates = new Map();
          for (const leave of unpaid)
            for (const date of leave.dates.filter(
              (d) => d >= start && d <= end,
            ))
              unpaidDates.set(date, leave.halfDay ? 0.5 : 1);
          const unpaidDays = [...unpaidDates.values()].reduce(
            (sum, value) => sum + value,
            0,
          );
          const payableDays =
            period.payBasis === "Calendar days"
              ? eligibleDays - unpaidDays
              : attendance.reduce(
                  (sum, a) =>
                    sum +
                    Math.min(
                      1,
                      (a.punchIn && a.punchOut
                        ? a.attendanceClass === "Absent"
                          ? 0
                          : a.attendanceClass === "Half Day"
                            ? 0.5
                            : 1
                        : 0) +
                        (a.leaveFraction || 0) -
                        (unpaidDates.get(a.date) || 0),
                    ),
                  0,
                );
          let calculation;
          try {
            calculation = calculateSalary(
              salary.toObject(),
              payableDays,
              periodDays,
            );
          } catch (error) {
            fail(422, `${employee.code}: ${error.message}`);
          }
          const overtimeMinutes = attendance.reduce(
            (sum, record) => sum + (record.overtimeMinutes || 0),
            0,
          );
          if (salary.overtimeRate && overtimeMinutes) {
            const overtimeAmount = Number(
              (BigInt(salary.overtimeRate) * BigInt(overtimeMinutes) + 30n) /
                60n,
            );
            calculation.earnings.push({
              name: "Overtime",
              amount: overtimeAmount,
              prorate: false,
            });
            calculation.gross += overtimeAmount;
            calculation.net += overtimeAmount;
          }
          for (const adjustment of adjustments) {
            if (adjustment.type === "Earning") {
              calculation.earnings.push({
                name: adjustment.name,
                amount: adjustment.amount,
                prorate: false,
              });
              calculation.gross += adjustment.amount;
              calculation.net += adjustment.amount;
            } else {
              calculation.deductions.push({
                name: adjustment.name,
                amount: adjustment.amount,
                prorate: false,
              });
              calculation.deductionsTotal += adjustment.amount;
              calculation.net -= adjustment.amount;
            }
            adjustment.status = "Applied";
            adjustment.appliedPeriod = period._id;
            await adjustment.save({ session });
          }
          if (calculation.net < 0)
            fail(422, "Approved adjustments would create negative net salary");
          const loanDeductions = await reserveLoanRecoveries(
            employee._id,
            period,
            session,
          );
          for (const item of loanDeductions) {
            calculation.deductions.push(item);
            calculation.deductionsTotal += item.amount;
            calculation.net -= item.amount;
          }
          if (calculation.net < 0)
            fail(
              422,
              "Configured deductions and loan installments exceed gross pay",
            );
          const bank = await BankAccount.findOne({
            employee: employee._id,
          }).session(session);
          entries.push({
            bankSnapshot: bank
              ? { bankName: bank.bankName, maskedAccount: bank.maskedAccount }
              : undefined,
            overtimeMinutes,
            adjustmentIds: adjustments.map((a) => a._id),
            period: period._id,
            employee: employee._id,
            version: period.version + 1,
            employeeSnapshot: {
              name: `${employee.firstName} ${employee.lastName}`.trim(),
              code: employee.code,
              department: employee.department,
              designation: employee.designation,
            },
            salarySnapshot: {
              effectiveDate: salary.effectiveDate,
              currency: salary.currency,
              overtimeRate: salary.overtimeRate,
              earnings: salary.earnings,
              deductions: salary.deductions,
              employerContributions: salary.employerContributions,
            },
            periodDays,
            payableDays,
            unpaidDays: periodDays - payableDays,
            ...calculation,
          });
        }
        if (!entries.length) fail(409, "No eligible employees for this period");
        await PayrollEntry.insertMany(entries, { session, ordered: true });
        const company =
          await CompanySettings.findById("company").session(session);
        period.companySnapshot = {
          name: company?.name || "ABCO Computers",
          address: company?.address,
          logo: company?.logo,
        };
        period.status = "Calculated";
        period.version += 1;
        period.processor = req.user._id;
        period.history.push({
          status: "Calculated",
          actor: req.user._id,
          at: new Date(),
        });
        await period.save({ session });
        await audit(req, "payroll.calculated", period.id, session);
        return period;
      });
      res.json({ data: period });
    },
  );
  const steps = {
    submit: {
      from: "Calculated",
      to: "Under Review",
      permission: "payroll.process",
    },
    approve: {
      from: "Under Review",
      to: "Approved",
      permission: "payroll.approve",
    },
    finalize: {
      from: "Approved",
      to: "Finalized",
      permission: "payroll.release",
    },
    pay: { from: "Finalized", to: "Paid", permission: "payroll.release" },
    close: { from: "Paid", to: "Closed", permission: "payroll.release" },
  };
  for (const [action, step] of Object.entries(steps))
    router.post(
      `/payroll/periods/:id/${action}`,
      permit(step.permission),
      async (req, res) => {
        const record = await transaction(async (session) => {
          const period = await PayrollPeriod.findById(req.params.id).session(
            session,
          );
          if (!period) fail(404, "Payroll period not found");
          if (period.status === step.to) return period;
          if (period.status !== step.from)
            fail(409, `Expected ${step.from} payroll`);
          if (action === "approve" && String(period.processor) === req.user.id)
            fail(403, "A different authorized person must approve payroll");
          if (action === "approve") period.approver = req.user._id;
          if (action === "pay") {
            period.paymentReference = text.parse(req.body.paymentReference);
            period.paidAt = new Date();
          }
          period.status = step.to;
          period.history.push({
            status: step.to,
            actor: req.user._id,
            at: new Date(),
          });
          await period.save({ session });
          if (action === "finalize") {
            await postLoanRecoveries(period._id, session);
            const entries = await PayrollEntry.find({
              period: period._id,
            }).session(session);
            for (const entry of entries)
              await notifyEmployee(
                entry.employee,
                "Your payslip is ready",
                period.month,
                "/payroll",
                session,
              );
          }
          await audit(req, "payroll." + action, period.id, session);
          return period;
        });
        res.json({ data: record });
      },
    );
  router.get(
    "/payroll/periods/:id/entries",
    permit("payroll.view"),
    async (req, res) =>
      res.json(
        await list(PayrollEntry, { period: id.parse(req.params.id) }, req),
      ),
  );
  router.get("/payslips/me", async (req, res) => {
    const periods = await PayrollPeriod.find({
      status: { $in: ["Finalized", "Paid", "Closed"] },
    }).select("_id");
    res.json(
      await list(
        PayrollEntry,
        {
          employee: req.user.employee || null,
          period: { $in: periods.map((p) => p._id) },
        },
        req,
        { populate: { path: "period", select: "month status" } },
      ),
    );
  });
  router.get("/payslips/:id/download", async (req, res) => {
    const entry = await PayrollEntry.findById(req.params.id).populate("period");
    if (!entry) fail(404, "Payslip not found");
    if (!["Finalized", "Paid", "Closed"].includes(entry.period.status))
      fail(409, "Payslip is not released");
    if (
      !can(req.user, "payroll.view") &&
      String(entry.employee) !== String(req.user.employee)
    )
      fail(403, "Payslip access denied");
    await audit(req, "payslip.downloaded", entry.id);
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="ABCO-payslip-${entry.period.month}-${entry.employeeSnapshot.code}.pdf"`,
      "Cache-Control": "no-store",
    });
    res.send(await payslipPDF(entry));
  });
  return router;
}
