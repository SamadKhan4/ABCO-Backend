import mongoose from "mongoose";
import { Router } from "express";
import { z } from "zod";
import { scopedModel } from "../../shared/scope.js";
import { Employee } from "../../models.js";
import { PayrollPeriod } from "./models.js";
import { can, workDate } from "../../security.js";
import {
  id,
  text,
  longText,
  fail,
  permit,
  ownEmployee,
  audit,
  list,
  transaction,
} from "../../shared/workflow.js";
import { toPaise } from "./calculator.js";
const { Schema } = mongoose,
  ref = (name) => ({ type: Schema.Types.ObjectId, ref: name }),
  options = { timestamps: true, strict: "throw", optimisticConcurrency: true };
export const LoanPolicy = mongoose.model(
  "LoanPolicy",
  new Schema(
    {
      name: String,
      type: { type: String, enum: ["Loan", "Salary Advance"] },
      maximumAmount: Number,
      maximumInstallments: Number,
      flatInterestBasisPoints: Number,
      active: { type: Boolean, default: true },
    },
    options,
  ),
);
export const Loan = scopedModel(
  "Loan",
  new Schema(
    {
      employee: ref("Employee"),
      policy: ref("LoanPolicy"),
      policySnapshot: {
        name: String,
        type: { type: String, enum: ["Loan", "Salary Advance"] },
        flatInterestBasisPoints: Number,
      },
      amount: Number,
      interest: Number,
      total: Number,
      installments: Number,
      installmentAmount: Number,
      startMonth: String,
      reason: String,
      repaid: { type: Number, default: 0 },
      reserved: { type: Number, default: 0 },
      status: {
        type: String,
        enum: ["Requested", "Approved", "Rejected", "Disbursed", "Closed"],
        default: "Requested",
      },
      approver: ref("User"),
      reviewNote: String,
      paymentReference: String,
      disbursedAt: Date,
    },
    options,
  ),
);
const recoverySchema = new Schema(
  {
    loan: ref("Loan"),
    employee: ref("Employee"),
    period: ref("PayrollPeriod"),
    settlement: { type: Schema.Types.ObjectId, ref: "FinalSettlement" },
    month: String,
    version: Number,
    amount: Number,
    status: { type: String, enum: ["Reserved", "Posted", "Reversed"] },
    active: Boolean,
  },
  options,
);
recoverySchema.index(
  { loan: 1, period: 1 },
  { unique: true, partialFilterExpression: { active: true } },
);
export const LoanRecovery = scopedModel("LoanRecovery", recoverySchema);
const money = z
  .string()
  .regex(/^\d{1,9}(\.\d{1,2})?$/)
  .transform(toPaise);
export async function reserveLoanRecoveries(employee, period, session) {
  const loans = await Loan.find({
    employee,
    status: "Disbursed",
    startMonth: { $lte: period.month },
  }).session(session);
  const deductions = [];
  for (const loan of loans) {
    if (
      await LoanRecovery.exists({
        loan: loan._id,
        active: true,
        status: "Reserved",
        period: { $ne: period._id },
      }).session(session)
    )
      fail(
        409,
        "Finalize the prior payroll containing this loan recovery first",
      );
    if (
      await LoanRecovery.exists({
        loan: loan._id,
        active: true,
        month: { $gte: period.month },
      }).session(session)
    )
      fail(
        409,
        "Loan recovery history prevents backdated or duplicate recovery",
      );
    const available = loan.total - loan.repaid - loan.reserved;
    if (available <= 0) continue;
    const posted = await LoanRecovery.countDocuments({
      loan: loan._id,
      status: "Posted",
      active: true,
    }).session(session);
    const amount =
      posted >= loan.installments - 1
        ? available
        : Math.min(loan.installmentAmount, available);
    loan.reserved += amount;
    await loan.save({ session });
    await LoanRecovery.create(
      [
        {
          loan: loan._id,
          employee,
          period: period._id,
          month: period.month,
          version: period.version + 1,
          amount,
          status: "Reserved",
          active: true,
        },
      ],
      { session },
    );
    deductions.push({
      name:
        loan.policySnapshot.type === "Salary Advance"
          ? "Salary advance recovery"
          : "Loan installment",
      amount,
      prorate: false,
    });
  }
  return deductions;
}
export async function releaseLoanRecoveries(period, session) {
  const recoveries = await LoanRecovery.find({
    period,
    status: "Reserved",
    active: true,
  }).session(session);
  for (const recovery of recoveries) {
    await Loan.updateOne(
      { _id: recovery.loan },
      { $inc: { reserved: -recovery.amount } },
      { session },
    );
    recovery.status = "Reversed";
    recovery.active = false;
    await recovery.save({ session });
  }
}
export async function postLoanRecoveries(period, session) {
  const recoveries = await LoanRecovery.find({
    period,
    status: "Reserved",
    active: true,
  }).session(session);
  for (const recovery of recoveries) {
    const loan = await Loan.findById(recovery.loan).session(session);
    if (!loan || loan.reserved < recovery.amount)
      fail(409, "Loan recovery requires reconciliation");
    loan.reserved -= recovery.amount;
    loan.repaid += recovery.amount;
    if (loan.repaid === loan.total) loan.status = "Closed";
    await loan.save({ session });
    recovery.status = "Posted";
    await recovery.save({ session });
  }
}
export function loanRoutes() {
  const router = Router();
  router.get("/loan-policies", async (req, res) =>
    res.json(await list(LoanPolicy, { active: true }, req)),
  );
  router.post("/loan-policies", permit("payroll.process"), async (req, res) => {
    const input = z
      .object({
        name: text,
        type: z.enum(["Loan", "Salary Advance"]),
        maximumAmount: money,
        maximumInstallments: z.number().int().min(1).max(120),
        flatInterestBasisPoints: z.number().int().min(0).max(10000),
      })
      .parse(req.body);
    const record = await LoanPolicy.create(input);
    await audit(req, "loan.policy.created", record.id);
    res.status(201).json({ data: record });
  });
  router.post(
    "/loan-policies/:id/deactivate",
    permit("payroll.process"),
    async (req, res) => {
      const record = await LoanPolicy.findByIdAndUpdate(
        req.params.id,
        { $set: { active: false } },
        { new: true },
      );
      if (!record) fail(404, "Policy not found");
      await audit(req, "loan.policy.deactivated", record.id);
      res.json({ data: record });
    },
  );
  router.get("/loans", async (req, res) =>
    res.json(
      await list(
        Loan,
        can(req.user, "payroll.view")
          ? {}
          : { employee: req.user.employee || null },
        req,
        { populate: { path: "employee", select: "firstName lastName code" } },
      ),
    ),
  );
  router.post("/loans", async (req, res) => {
    const input = z
      .object({
        policy: id,
        amount: money,
        installments: z.number().int().min(1).max(120),
        startMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
        reason: longText,
      })
      .parse(req.body);
    const employee = ownEmployee(req),
      policy = await LoanPolicy.findOne({ _id: input.policy, active: true });
    if (!policy)
      fail(422, "Configure and choose an approved loan or advance policy");
    if (input.startMonth < workDate().slice(0, 7))
      fail(422, "Repayment cannot start in a past month");
    if (
      input.amount <= 0 ||
      input.amount > policy.maximumAmount ||
      input.installments > policy.maximumInstallments
    )
      fail(422, "The request exceeds the configured policy limits");
    const interest = Number(
        (BigInt(input.amount) * BigInt(policy.flatInterestBasisPoints) +
          5000n) /
          10000n,
      ),
      total = input.amount + interest,
      installmentAmount = Math.floor(total / input.installments);
    if (!installmentAmount)
      fail(
        422,
        "The amount is too small for the requested number of installments",
      );
    const record = await Loan.create({
      ...input,
      employee,
      interest,
      total,
      installmentAmount,
      policySnapshot: {
        name: policy.name,
        type: policy.type,
        flatInterestBasisPoints: policy.flatInterestBasisPoints,
      },
    });
    await audit(req, "loan.requested", record.id);
    res.status(201).json({ data: record });
  });
  router.post(
    "/loans/:id/review",
    permit("payroll.approve"),
    async (req, res) => {
      const input = z
        .object({ status: z.enum(["Approved", "Rejected"]), note: longText })
        .parse(req.body);
      const record = await Loan.findById(req.params.id);
      if (!record) fail(404, "Loan not found");
      if (String(record.employee) === String(req.user.employee))
        fail(403, "Another finance reviewer must decide your request");
      if (record.status !== "Requested")
        fail(409, "Only requested loans can be reviewed");
      record.status = input.status;
      record.approver = req.user._id;
      record.reviewNote = input.note;
      await record.save();
      await audit(req, "loan.reviewed", record.id);
      res.json({ data: record });
    },
  );
  router.post(
    "/loans/:id/disburse",
    permit("payroll.release"),
    async (req, res) => {
      const paymentReference = text.parse(req.body.paymentReference);
      const record = await transaction(async (session) => {
        const record = await Loan.findById(req.params.id).session(session);
        if (!record) fail(404, "Loan not found");
        if (record.status !== "Approved")
          fail(409, "An approved loan is required");
        await Employee.updateOne(
          { _id: record.employee },
          { $inc: { leaveVersion: 1 } },
          { session },
        );
        if (
          record.startMonth < workDate().slice(0, 7) ||
          (await PayrollPeriod.exists({
            month: record.startMonth,
            status: { $ne: "Draft" },
          }).session(session))
        )
          fail(
            409,
            "The agreed repayment start month is past or locked; revise the request before disbursement",
          );
        record.status = "Disbursed";
        record.paymentReference = paymentReference;
        record.disbursedAt = new Date();
        await record.save({ session });
        await audit(req, "loan.disbursement.recorded", record.id, session);
        return record;
      });
      res.json({ data: record });
    },
  );
  router.get("/loans/:id/recoveries", async (req, res) => {
    const loan = await Loan.findById(req.params.id);
    if (!loan) fail(404, "Loan not found");
    if (
      !can(req.user, "payroll.view") &&
      String(loan.employee) !== String(req.user.employee)
    )
      fail(403, "Loan history access denied");
    res.json({
      data: await LoanRecovery.find({ loan: loan._id })
        .sort({ createdAt: -1 })
        .lean(),
    });
  });
  return router;
}
