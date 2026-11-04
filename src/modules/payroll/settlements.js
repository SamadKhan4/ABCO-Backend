import mongoose from "mongoose";
import { Router } from "express";
import { z } from "zod";
import { scopedModel } from "../../shared/scope.js";
import { Employee, Leave } from "../../models.js";
import { Exit, Asset } from "../hr/models.js";
import { LeaveAdjustment } from "../leave/balances.js";
import { Loan, LoanRecovery } from "./loans.js";
import { can } from "../../security.js";
import {
  id,
  text,
  longText,
  fail,
  permit,
  audit,
  list,
  transaction,
} from "../../shared/workflow.js";
import { toPaise } from "./calculator.js";
import { notifyEmployee } from "../operations/routes.js";
const { Schema } = mongoose;
const component = new Schema({ name: String, amount: Number }, { _id: false });
export const FinalSettlement = scopedModel(
  "FinalSettlement",
  new Schema(
    {
      exit: { type: Schema.Types.ObjectId, ref: "Exit", unique: true },
      employee: { type: Schema.Types.ObjectId, ref: "Employee" },
      employeeSnapshot: { name: String, code: String, lastWorkingDate: String },
      earnings: [component],
      deductions: [component],
      manualEarnings: [component],
      manualDeductions: [component],
      gross: Number,
      deductionsTotal: Number,
      net: Number,
      loanSnapshots: [
        { loan: { type: Schema.Types.ObjectId, ref: "Loan" }, amount: Number },
      ],
      encashmentSnapshots: [
        {
          encashment: { type: Schema.Types.ObjectId, ref: "LeaveAdjustment" },
          amount: Number,
        },
      ],
      reason: String,
      status: {
        type: String,
        enum: ["Draft", "Approved", "Paid"],
        default: "Draft",
      },
      createdBy: { type: Schema.Types.ObjectId, ref: "User" },
      approver: { type: Schema.Types.ObjectId, ref: "User" },
      paymentReference: String,
      paidAt: Date,
      versions: [Schema.Types.Mixed],
    },
    { timestamps: true, strict: "throw", optimisticConcurrency: true },
  ),
);
const money = z
    .string()
    .regex(/^\d{1,9}(\.\d{1,2})?$/)
    .transform(toPaise),
  entry = z.object({ name: text, amount: money });
const inputSchema = z.object({
  exit: id,
  earnings: z.array(entry).min(1).max(30),
  deductions: z.array(entry).max(30).default([]),
  includeOutstandingLoans: z.boolean(),
  includeApprovedEncashments: z.boolean(),
  reason: longText,
});
async function compute(input, session) {
  const exit = await Exit.findById(input.exit).session(session || null);
  if (
    !exit ||
    !["Approved", "Notice Period", "Clearance", "Settlement"].includes(
      exit.status,
    )
  )
    fail(422, "Choose an approved exit that has not been completed");
  const employee = await Employee.findById(exit.employee).session(
    session || null,
  );
  if (!employee) fail(404, "Employee not found");
  const earnings = [...input.earnings],
    deductions = [...input.deductions],
    loanSnapshots = [],
    encashmentSnapshots = [];
  const loans = await Loan.find({
    employee: employee._id,
    status: "Disbursed",
  }).session(session || null);
  if (loans.some((loan) => loan.reserved > 0))
    fail(
      409,
      "Finalize or reopen the pending payroll containing loan recovery first",
    );
  if (loans.length && !input.includeOutstandingLoans)
    fail(
      422,
      "Outstanding tracked loans must be explicitly included or settled before final settlement",
    );
  for (const loan of loans) {
    const amount = loan.total - loan.repaid;
    if (amount > 0) {
      deductions.push({
        name: `Final ${loan.policySnapshot.type.toLowerCase()} recovery`,
        amount,
      });
      loanSnapshots.push({ loan: loan._id, amount });
    }
  }
  if (input.includeApprovedEncashments) {
    const encashments = await LeaveAdjustment.find({
      employee: employee._id,
      kind: "Encashment",
      status: "Approved",
    }).session(session || null);
    for (const encashment of encashments) {
      earnings.push({
        name: "Approved leave encashment",
        amount: encashment.amount,
      });
      encashmentSnapshots.push({
        encashment: encashment._id,
        amount: encashment.amount,
      });
    }
  }
  const sum = (items) => items.reduce((total, item) => total + item.amount, 0),
    gross = sum(earnings),
    deductionsTotal = sum(deductions);
  if (deductionsTotal > gross)
    fail(
      422,
      "Deductions exceed the settlement earnings. Resolve the separate recovery arrangement before proceeding.",
    );
  return {
    exit: exit._id,
    employee: employee._id,
    employeeSnapshot: {
      name: `${employee.firstName} ${employee.lastName}`.trim(),
      code: employee.code,
      lastWorkingDate: exit.lastWorkingDate,
    },
    earnings,
    deductions,
    manualEarnings: input.earnings,
    manualDeductions: input.deductions,
    gross,
    deductionsTotal,
    net: gross - deductionsTotal,
    loanSnapshots,
    encashmentSnapshots,
    reason: input.reason,
  };
}
async function validateSources(record, session) {
  const exit = await Exit.findById(record.exit).session(session);
  if (
    !exit ||
    !["Approved", "Notice Period", "Clearance", "Settlement"].includes(
      exit.status,
    ) ||
    exit.lastWorkingDate !== record.employeeSnapshot.lastWorkingDate
  )
    fail(409, "Exit details changed. Reopen and recalculate this settlement.");
  const loans = await Loan.find({
    employee: record.employee,
    status: "Disbursed",
  }).session(session);
  if (
    loans.length !== record.loanSnapshots.length ||
    loans.some(
      (loan) => !record.loanSnapshots.some((s) => String(s.loan) === loan.id),
    )
  )
    fail(
      409,
      "Outstanding loans changed. Reopen and recalculate this settlement.",
    );
  const encashments = await LeaveAdjustment.find({
    employee: record.employee,
    kind: "Encashment",
    status: "Approved",
  }).session(session);
  if (
    encashments.length !== record.encashmentSnapshots.length ||
    encashments.some(
      (e) =>
        !record.encashmentSnapshots.some((s) => String(s.encashment) === e.id),
    )
  )
    fail(
      409,
      "Approved encashments must be included or paid separately. Reopen and recalculate this settlement.",
    );
  for (const snapshot of record.loanSnapshots) {
    const loan = await Loan.findById(snapshot.loan).session(session);
    if (
      !loan ||
      loan.status !== "Disbursed" ||
      loan.reserved ||
      loan.total - loan.repaid !== snapshot.amount
    )
      fail(409, "Loan balances changed. Recalculate this draft settlement.");
  }
  for (const snapshot of record.encashmentSnapshots) {
    if (
      !(await LeaveAdjustment.exists({
        _id: snapshot.encashment,
        status: "Approved",
        amount: snapshot.amount,
      }).session(session))
    )
      fail(409, "Leave encashment changed. Recalculate this draft settlement.");
  }
  if (
    await Asset.exists({
      employee: record.employee,
      status: "Assigned",
    }).session(session)
  )
    fail(409, "Return assigned assets before approving or paying settlement");
  if (
    await Leave.exists({
      employee: record.employee,
      status: "Pending",
    }).session(session)
  )
    fail(409, "Resolve pending leave before settlement");
}
export function settlementRoutes() {
  const router = Router();
  router.post(
    "/final-settlements/:id/reopen",
    permit("payroll.process"),
    async (req, res) => {
      const reason = longText.parse(req.body.reason);
      const record = await transaction(async (session) => {
        const record = await FinalSettlement.findById(req.params.id).session(
          session,
        );
        if (!record || record.status !== "Approved")
          fail(409, "Only approved unpaid settlements may be reopened");
        await Employee.updateOne(
          { _id: record.employee },
          { $inc: { leaveVersion: 1 } },
          { session },
        );
        const previous = record.toObject();
        delete previous.versions;
        record.versions.push({ ...previous, reopenReason: reason });
        record.status = "Draft";
        record.approver = undefined;
        await record.save({ session });
        await audit(req, "settlement.reopened", record.id, session);
        return record;
      });
      res.json({ data: record });
    },
  );
  router.get(
    "/settlement-exit-lookups",
    permit("payroll.view"),
    async (_req, res) =>
      res.json({
        data: await Exit.find({
          status: {
            $in: ["Approved", "Notice Period", "Clearance", "Settlement"],
          },
        })
          .select("employee lastWorkingDate status")
          .populate("employee", "firstName lastName code")
          .limit(500)
          .lean(),
      }),
  );
  router.get("/final-settlements", async (req, res) =>
    res.json(
      await list(
        FinalSettlement,
        can(req.user, "payroll.view")
          ? {}
          : { employee: req.user.employee || null },
        req,
        { populate: { path: "employee", select: "firstName lastName code" } },
      ),
    ),
  );
  router.post(
    "/final-settlements",
    permit("payroll.process"),
    async (req, res) => {
      const input = inputSchema.parse(req.body);
      const record = await transaction(async (session) => {
        const data = await compute(input, session);
        await Employee.updateOne(
          { _id: data.employee },
          { $inc: { leaveVersion: 1 } },
          { session },
        );
        const [record] = await FinalSettlement.create(
          [{ ...data, createdBy: req.user._id }],
          { session },
        );
        await audit(req, "settlement.created", record.id, session);
        return record;
      });
      res.status(201).json({ data: record });
    },
  );
  router.patch(
    "/final-settlements/:id",
    permit("payroll.process"),
    async (req, res) => {
      const input = inputSchema.parse(req.body);
      const record = await transaction(async (session) => {
        const record = await FinalSettlement.findById(req.params.id).session(
          session,
        );
        if (!record || record.status !== "Draft")
          fail(409, "Only draft settlements can be recalculated");
        if (String(record.exit) !== input.exit)
          fail(422, "A settlement cannot be moved to another exit");
        const data = await compute(input, session);
        await Employee.updateOne(
          { _id: data.employee },
          { $inc: { leaveVersion: 1 } },
          { session },
        );
        const previous = record.toObject();
        delete previous.versions;
        record.versions.push(previous);
        Object.assign(record, data);
        await record.save({ session });
        await audit(req, "settlement.recalculated", record.id, session);
        return record;
      });
      res.json({ data: record });
    },
  );
  router.post(
    "/final-settlements/:id/approve",
    permit("payroll.approve"),
    async (req, res) => {
      const record = await transaction(async (session) => {
        const record = await FinalSettlement.findById(req.params.id).session(
          session,
        );
        if (!record) fail(404, "Settlement not found");
        if (record.status !== "Draft") fail(409, "Draft settlement required");
        if (
          String(record.createdBy) === req.user.id ||
          String(record.employee) === String(req.user.employee)
        )
          fail(403, "A separate finance approver must review settlement");
        await Employee.updateOne(
          { _id: record.employee },
          { $inc: { leaveVersion: 1 } },
          { session },
        );
        await validateSources(record, session);
        record.status = "Approved";
        record.approver = req.user._id;
        await record.save({ session });
        await audit(req, "settlement.approved", record.id, session);
        return record;
      });
      res.json({ data: record });
    },
  );
  router.post(
    "/final-settlements/:id/pay",
    permit("payroll.release"),
    async (req, res) => {
      const paymentReference = text.parse(req.body.paymentReference);
      const record = await transaction(async (session) => {
        const record = await FinalSettlement.findById(req.params.id).session(
          session,
        );
        if (!record) fail(404, "Settlement not found");
        if (record.status === "Paid") return record;
        if (record.status !== "Approved")
          fail(409, "Approved settlement required");
        await Employee.updateOne(
          { _id: record.employee },
          { $inc: { leaveVersion: 1 } },
          { session },
        );
        await validateSources(record, session);
        for (const snapshot of record.loanSnapshots) {
          const loan = await Loan.findById(snapshot.loan).session(session);
          loan.repaid += snapshot.amount;
          loan.status = "Closed";
          await loan.save({ session });
          await LoanRecovery.create(
            [
              {
                loan: loan._id,
                employee: record.employee,
                month: record.employeeSnapshot.lastWorkingDate.slice(0, 7),
                settlement: record._id,
                amount: snapshot.amount,
                status: "Posted",
                active: true,
              },
            ],
            { session },
          );
        }
        for (const snapshot of record.encashmentSnapshots)
          await LeaveAdjustment.updateOne(
            { _id: snapshot.encashment, status: "Approved" },
            { $set: { status: "Paid", paymentReference } },
            { session },
          );
        record.status = "Paid";
        record.paymentReference = paymentReference;
        record.paidAt = new Date();
        await record.save({ session });
        await notifyEmployee(
          record.employee,
          "Final settlement payment recorded",
          "Your final settlement statement has been updated.",
          "/final-settlements",
          session,
        );
        await audit(req, "settlement.payment.recorded", record.id, session);
        return record;
      });
      res.json({ data: record });
    },
  );
  return router;
}
