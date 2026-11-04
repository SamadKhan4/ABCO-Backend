import { releaseLoanRecoveries } from "./loans.js";
import mongoose from "mongoose";
import { Router } from "express";
import { z } from "zod";
import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createHash,
} from "node:crypto";
import { scopedModel } from "../../shared/scope.js";
import { PayrollPeriod, PayrollEntry } from "./models.js";
import { Employee } from "../../models.js";
import {
  id,
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
import { recentAuthentication } from "../admin/routes.js";
import { toPaise } from "./calculator.js";
const { Schema } = mongoose;
export const BankAccount = scopedModel(
  "BankAccount",
  new Schema(
    {
      employee: { type: Schema.Types.ObjectId, ref: "Employee", unique: true },
      holder: String,
      bankName: String,
      maskedAccount: String,
      encrypted: { type: String, select: false },
    },
    { timestamps: true, strict: "throw" },
  ),
);
export const PayrollAdjustment = scopedModel(
  "PayrollAdjustment",
  new Schema(
    {
      employee: { type: Schema.Types.ObjectId, ref: "Employee" },
      month: String,
      category: String,
      name: String,
      type: { type: String, enum: ["Earning", "Deduction"] },
      amount: Number,
      reason: String,
      status: {
        type: String,
        enum: ["Pending", "Approved", "Rejected", "Applied"],
        default: "Pending",
      },
      createdBy: { type: Schema.Types.ObjectId, ref: "User" },
      approver: { type: Schema.Types.ObjectId, ref: "User" },
      appliedPeriod: { type: Schema.Types.ObjectId, ref: "PayrollPeriod" },
    },
    { timestamps: true, strict: "throw", optimisticConcurrency: true },
  ),
);
export const PayrollArchive = mongoose.model(
  "PayrollArchive",
  new Schema(
    {
      period: { type: Schema.Types.ObjectId, ref: "PayrollPeriod" },
      version: Number,
      reason: String,
      entries: [Schema.Types.Mixed],
      actor: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true, strict: "throw" },
  ),
);
function key() {
  if (!/^[a-f\d]{64}$/i.test(process.env.DOCUMENT_KEY || ""))
    fail(503, "Private financial encryption key is not configured");
  return createHash("sha256")
    .update("abco-bank:")
    .update(process.env.DOCUMENT_KEY)
    .digest();
}
function encrypt(value) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  const bytes = Buffer.concat([
    cipher.update(JSON.stringify(value)),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString("base64");
}
function decrypt(value) {
  const bytes = Buffer.from(value, "base64"),
    decipher = createDecipheriv("aes-256-gcm", key(), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([
      decipher.update(bytes.subarray(28)),
      decipher.final(),
    ]).toString(),
  );
}
const money = z
  .string()
  .regex(/^\d{1,9}(\.\d{1,2})?$/)
  .transform(toPaise);
export function financeRoutes() {
  const router = Router();
  router.get("/employees/me/bank-details", async (req, res) =>
    res.json({
      data: await BankAccount.findOne({ employee: req.user.employee || null })
        .select("holder bankName maskedAccount updatedAt")
        .lean(),
    }),
  );
  router.put("/employees/me/bank-details", async (req, res) => {
    recentAuthentication(req);
    const input = z
        .object({
          holder: text,
          bankName: text,
          accountNumber: z
            .string()
            .trim()
            .regex(
              /^[A-Z0-9]{5,34}$/i,
              "Use an account identifier with 5–34 letters or digits",
            ),
          routingCode: z.string().trim().min(3).max(30),
        })
        .parse(req.body),
      employee = ownEmployee(req);
    await activeEmployee(employee);
    const record = await BankAccount.findOneAndUpdate(
      { employee },
      {
        $set: {
          holder: input.holder,
          bankName: input.bankName,
          maskedAccount: "••••" + input.accountNumber.slice(-4),
          encrypted: encrypt({
            accountNumber: input.accountNumber,
            routingCode: input.routingCode,
          }),
        },
      },
      { upsert: true, new: true },
    );
    await audit(req, "bank.details.updated", record.id);
    res.json({
      data: {
        holder: record.holder,
        bankName: record.bankName,
        maskedAccount: record.maskedAccount,
      },
    });
  });
  router.get("/payroll-adjustments", permit("payroll.view"), async (req, res) =>
    res.json(
      await list(PayrollAdjustment, {}, req, {
        populate: { path: "employee", select: "firstName lastName code" },
      }),
    ),
  );
  router.post(
    "/payroll-adjustments",
    permit("payroll.process"),
    async (req, res) => {
      const input = z
        .object({
          employee: id,
          month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
          category: z.enum([
            "Incentive",
            "Bonus",
            "Arrears",
            "Advance Recovery",
            "Loan Deduction",
            "Correction",
            "Other",
          ]),
          name: text,
          type: z.enum(["Earning", "Deduction"]),
          amount: money,
          reason: longText,
        })
        .parse(req.body);
      await activeEmployee(input.employee);
      if (
        await PayrollPeriod.exists({
          month: input.month,
          status: { $ne: "Draft" },
        })
      )
        fail(409, "Choose a payroll month that has not been calculated");
      const record = await PayrollAdjustment.create({
        ...input,
        createdBy: req.user._id,
      });
      await audit(req, "payroll.adjustment.created", record.id);
      res.status(201).json({ data: record });
    },
  );
  router.post(
    "/payroll-adjustments/:id/review",
    permit("payroll.approve"),
    async (req, res) => {
      const status = z.enum(["Approved", "Rejected"]).parse(req.body.status);
      const record = await transaction(async (session) => {
        const record = await PayrollAdjustment.findById(req.params.id).session(
          session,
        );
        if (!record) fail(404, "Adjustment not found");
        if (record.status !== "Pending")
          fail(409, "Only pending adjustments can be reviewed");
        if (String(record.createdBy) === req.user.id)
          fail(403, "A separate approver must review payroll adjustments");
        await Employee.updateOne(
          { _id: record.employee },
          { $inc: { leaveVersion: 1 } },
          { session },
        );
        if (
          await PayrollPeriod.exists({
            month: record.month,
            status: { $ne: "Draft" },
          }).session(session)
        )
          fail(409, "The target payroll month is already locked");
        record.status = status;
        record.approver = req.user._id;
        await record.save({ session });
        await audit(req, "payroll.adjustment.reviewed", record.id, session);
        return record;
      });
      res.json({ data: record });
    },
  );
  router.post(
    "/payroll/periods/:id/reopen",
    permit("payroll.process"),
    async (req, res) => {
      const reason = longText.parse(req.body.reason);
      const record = await transaction(async (session) => {
        const period = await PayrollPeriod.findById(req.params.id).session(
          session,
        );
        if (!period) fail(404, "Payroll not found");
        if (!["Calculated", "Under Review"].includes(period.status))
          fail(
            409,
            "Only unapproved calculations may be reopened. Released payroll requires an adjustment in another month.",
          );
        const entries = await PayrollEntry.find({ period: period._id })
          .lean()
          .session(session);
        await PayrollArchive.create(
          [
            {
              period: period._id,
              version: period.version,
              reason,
              entries,
              actor: req.user._id,
            },
          ],
          { session },
        );
        await releaseLoanRecoveries(period._id, session);
        await PayrollEntry.deleteMany({ period: period._id }, { session });
        await PayrollAdjustment.updateMany(
          { appliedPeriod: period._id, status: "Applied" },
          { $set: { status: "Approved" }, $unset: { appliedPeriod: 1 } },
          { session },
        );
        period.status = "Draft";
        period.history.push({
          status: "Draft",
          actor: req.user._id,
          at: new Date(),
        });
        await period.save({ session });
        await audit(req, "payroll.reopened", period.id, session);
        return period;
      });
      res.json({ data: record });
    },
  );
  router.get(
    "/payroll/periods/:id/history",
    permit("payroll.view"),
    async (req, res) =>
      res.json({
        data: await PayrollArchive.find({ period: req.params.id })
          .select("period version reason createdAt actor")
          .lean(),
      }),
  );
  router.get(
    "/payroll/periods/:id/bank-statement",
    permit("payroll.release"),
    async (req, res) => {
      recentAuthentication(req);
      const period = await PayrollPeriod.findById(req.params.id);
      if (!period || !["Finalized", "Paid", "Closed"].includes(period.status))
        fail(409, "Released payroll is required");
      const entries = await PayrollEntry.find({ period: period._id });
      const rows = [];
      for (const entry of entries) {
        const bank = await BankAccount.findOne({
          employee: entry.employee,
        }).select("+encrypted");
        if (!bank)
          fail(
            409,
            "Every employee in this run needs verified bank details before a payment statement can be generated",
          );
        const details = decrypt(bank.encrypted);
        rows.push([
          entry.employeeSnapshot.code,
          entry.employeeSnapshot.name,
          bank.holder,
          bank.bankName,
          details.accountNumber,
          details.routingCode,
          (entry.net / 100).toFixed(2),
          "INR",
        ]);
      }
      const cell = (value) => {
        const raw = String(value),
          safe = /^[\s]*[=+@\-\t\r]/.test(raw) ? "'" + raw : raw;
        return '"' + safe.replaceAll('"', '""') + '"';
      };
      const csv = [
        [
          "Employee code",
          "Employee name",
          "Account holder",
          "Bank",
          "Account",
          "Routing code",
          "Net amount",
          "Currency",
        ],
        ...rows,
      ]
        .map((row) => row.map(cell).join(","))
        .join("\r\n");
      await audit(req, "payroll.bank-statement.exported", period.id);
      res
        .set({
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="ABCO-bank-statement-${period.month}.csv"`,
          "Cache-Control": "no-store",
        })
        .send("\uFEFF" + csv);
    },
  );
  return router;
}
