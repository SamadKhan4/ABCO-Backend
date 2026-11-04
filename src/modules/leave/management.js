import { Router } from "express";
import { z } from "zod";
import { LeavePolicy, Employee, LeaveBalance } from "../../models.js";
import { LeaveAdjustment, balanceFor } from "./balances.js";
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
} from "../../shared/workflow.js";
import { can } from "../../security.js";
import { toPaise } from "../payroll/calculator.js";
export function leaveManagement() {
  const router = Router();
  router.post(
    "/leave-policies/:id/deactivate",
    permit("organization.manage"),
    async (req, res) => {
      const record = await LeavePolicy.findByIdAndUpdate(
        req.params.id,
        { $set: { active: false } },
        { new: true },
      );
      if (!record) fail(404, "Leave policy not found");
      await audit(req, "leave.policy.deactivated", record.id);
      res.json({ data: record });
    },
  );
  router.get("/leave-adjustments", async (req, res) =>
    res.json(
      await list(
        LeaveAdjustment,
        can(req.user, "leave.manage")
          ? {}
          : { employee: req.user.employee || null },
        req,
        {
          populate: [
            { path: "employee", select: "firstName lastName code" },
            { path: "policy", select: "name" },
          ],
        },
      ),
    ),
  );
  router.post(
    "/leave-adjustments",
    permit("leave.manage"),
    async (req, res) => {
      const input = z
        .object({
          employee: id,
          policy: id,
          year: z.number().int().min(2000).max(2200),
          days: z
            .number()
            .multipleOf(0.5)
            .min(-366)
            .max(366)
            .refine((v) => v !== 0, "Adjustment must be nonzero"),
          reason: longText,
        })
        .parse(req.body);
      const record = await transaction(async (session) => {
        await activeEmployee(input.employee, session);
        await Employee.updateOne(
          { _id: input.employee },
          { $inc: { leaveVersion: 1 } },
          { session },
        );
        const policy = await LeavePolicy.findById(input.policy).session(
          session,
        );
        if (!policy) fail(404, "Leave policy not found");
        const balance = await balanceFor(
          input.employee,
          policy,
          input.year,
          session,
        );
        if (balance.opening + input.days < balance.used + balance.reserved)
          fail(409, "Adjustment would make available leave negative");
        balance.opening += input.days;
        await balance.save({ session });
        const [record] = await LeaveAdjustment.create(
          [
            {
              ...input,
              kind: "Adjustment",
              status: "Posted",
              actor: req.user._id,
            },
          ],
          { session },
        );
        await audit(req, "leave.balance.adjusted", record.id, session);
        return record;
      });
      res.status(201).json({ data: record });
    },
  );
  router.post("/leave-encashments", async (req, res) => {
    const input = z
      .object({
        policy: id,
        year: z.number().int().min(2000).max(2200),
        days: z.number().multipleOf(0.5).min(0.5).max(366),
        reason: longText,
      })
      .parse(req.body);
    const policy = await LeavePolicy.findOne({
      _id: input.policy,
      active: true,
      encashmentAllowed: true,
    });
    if (!policy) fail(422, "Choose a policy that permits encashment");
    const record = await LeaveAdjustment.create({
      ...input,
      employee: ownEmployee(req),
      kind: "Encashment",
      status: "Pending",
      actor: req.user._id,
    });
    await audit(req, "leave.encashment.requested", record.id);
    res.status(201).json({ data: record });
  });
  router.post(
    "/leave-encashments/:id/review",
    permit("leave.manage"),
    async (req, res) => {
      const input = z
        .object({
          status: z.enum(["Approved", "Rejected"]),
          amount: z
            .string()
            .regex(/^\d{1,9}(\.\d{1,2})?$/)
            .transform(toPaise),
          reason: longText,
        })
        .parse(req.body);
      const record = await transaction(async (session) => {
        const record = await LeaveAdjustment.findOne({
          _id: req.params.id,
          kind: "Encashment",
          status: "Pending",
        }).session(session);
        if (!record) fail(409, "Pending encashment request required");
        if (String(record.employee) === String(req.user.employee))
          fail(403, "Another reviewer must decide your encashment");
        if (input.status === "Approved") {
          await Employee.updateOne(
            { _id: record.employee },
            { $inc: { leaveVersion: 1 } },
            { session },
          );
          const policy = await LeavePolicy.findById(record.policy).session(
              session,
            ),
            balance = await balanceFor(
              record.employee,
              policy,
              record.year,
              session,
            );
          if (balance.opening - balance.used - balance.reserved < record.days)
            fail(409, "Insufficient leave available for encashment");
          balance.used += record.days;
          await balance.save({ session });
        }
        record.status = input.status;
        record.amount = input.amount;
        record.approver = req.user._id;
        record.reason += "\nDecision: " + input.reason;
        await record.save({ session });
        await audit(req, "leave.encashment.reviewed", record.id, session);
        return record;
      });
      res.json({ data: record });
    },
  );
  router.post(
    "/leave-encashments/:id/pay",
    permit("payroll.release"),
    async (req, res) => {
      const reference = text.parse(req.body.paymentReference);
      const record = await LeaveAdjustment.findOneAndUpdate(
        { _id: req.params.id, kind: "Encashment", status: "Approved" },
        { $set: { status: "Paid", paymentReference: reference } },
        { new: true },
      );
      if (!record) fail(409, "Approved encashment is required");
      await audit(req, "leave.encashment.payment.recorded", record.id);
      res.json({ data: record });
    },
  );
  return router;
}
