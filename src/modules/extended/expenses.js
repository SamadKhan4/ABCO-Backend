import { openApproval, advanceApproval } from "../approvals/index.js";
import { Router } from "express";
import { z } from "zod";
import { ExpensePolicy, Expense, Travel } from "./models.js";
import { Document } from "../documents/routes.js";
import { can, workDate } from "../../security.js";
import {
  id,
  text,
  longText,
  date,
  fail,
  permit,
  ownEmployee,
  audit,
  list,
  transaction,
} from "../../shared/workflow.js";
import { toPaise } from "../payroll/calculator.js";
import { notifyEmployee } from "../operations/routes.js";
const money = z
  .string()
  .regex(/^\d{1,9}(\.\d{1,2})?$/, "Use a positive amount with up to 2 decimals")
  .transform(toPaise);
export function expenseRoutes() {
  const router = Router();
  router.get("/expense-policies", async (req, res) =>
    res.json(
      await list(
        ExpensePolicy,
        can(req.user, "expenses.manage") ? {} : { active: true },
        req,
      ),
    ),
  );
  router.post(
    "/expense-policies",
    permit("expenses.manage"),
    async (req, res) => {
      const data = z
        .object({
          name: text,
          maximumAmount: money,
          receiptRequired: z.boolean(),
          effectiveFrom: date,
        })
        .parse(req.body);
      const record = await ExpensePolicy.create(data);
      await audit(req, "expense.policy.created", record.id);
      res.status(201).json({ data: record });
    },
  );
  router.post(
    "/expense-policies/:id/deactivate",
    permit("expenses.manage"),
    async (req, res) => {
      const record = await ExpensePolicy.findByIdAndUpdate(
        req.params.id,
        { $set: { active: false } },
        { new: true },
      );
      if (!record) fail(404, "Policy not found");
      await audit(req, "expense.policy.deactivated", record.id);
      res.json({ data: record });
    },
  );
  const expenseInput = z.object({
    policy: id,
    title: text,
    date,
    amount: money,
    description: longText,
    receipt: id.optional(),
    travel: id.optional(),
  });
  async function validate(input, employee) {
    if (input.date > workDate()) fail(422, "Future expenses are not allowed");
    const policy = await ExpensePolicy.findOne({
      _id: input.policy,
      active: true,
      effectiveFrom: { $lte: input.date },
    });
    if (!policy)
      fail(422, "Choose an active policy effective on the expense date");
    if (input.amount > policy.maximumAmount)
      fail(422, "Expense exceeds the configured policy limit");
    if (policy.receiptRequired && !input.receipt)
      fail(422, "This expense policy requires a receipt document");
    if (
      input.receipt &&
      !(await Document.exists({
        _id: input.receipt,
        employee,
        visibility: "Employee",
      }))
    )
      fail(422, "Choose a receipt document owned by you");
    if (
      input.travel &&
      !(await Travel.exists({
        _id: input.travel,
        employee,
        startDate: { $lte: input.date },
        endDate: { $gte: input.date },
        status: { $in: ["Approved", "In Progress"] },
      }))
    )
      fail(422, "Choose an approved trip covering the expense date");
    return policy;
  }
  router.get("/expenses", async (req, res) =>
    res.json(
      await list(
        Expense,
        can(req.user, "expenses.approve") || can(req.user, "expenses.pay")
          ? {
              $or: [
                { status: { $ne: "Draft" } },
                { employee: req.user.employee || null },
              ],
            }
          : { employee: req.user.employee || null },
        req,
        { populate: { path: "employee", select: "firstName lastName code" } },
      ),
    ),
  );
  router.post("/expenses", async (req, res) => {
    const data = expenseInput.parse(req.body),
      employee = ownEmployee(req),
      policy = await validate(data, employee);
    const record = await Expense.create({
      ...data,
      employee,
      policySnapshot: {
        name: policy.name,
        maximumAmount: policy.maximumAmount,
        receiptRequired: policy.receiptRequired,
      },
    });
    await audit(req, "expense.created", record.id);
    res.status(201).json({ data: record });
  });
  router.patch("/expenses/:id", async (req, res) => {
    const data = expenseInput.parse(req.body),
      employee = ownEmployee(req);
    const record = await Expense.findOne({
      _id: req.params.id,
      employee,
      status: { $in: ["Draft", "Rejected"] },
    });
    if (!record)
      fail(409, "Only your draft or rejected expenses can be edited");
    const policy = await validate(data, employee);
    Object.assign(record, data, {
      status: "Draft",
      policySnapshot: {
        name: policy.name,
        maximumAmount: policy.maximumAmount,
        receiptRequired: policy.receiptRequired,
      },
    });
    await record.save();
    await audit(req, "expense.updated", record.id);
    res.json({ data: record });
  });
  router.post("/expenses/:id/submit", async (req, res) => {
    const record = await transaction(async (session) => {
      const record = await Expense.findOne({
        _id: req.params.id,
        employee: ownEmployee(req),
      }).session(session);
      if (!record) fail(404, "Expense not found");
      if (record.status !== "Draft")
        fail(409, "Only draft claims can be submitted");
      record.status = "Submitted";
      await record.save({ session });
      await openApproval(req, "Expense", record, session);
      await audit(req, "expense.submitted", record.id, session);
      return record;
    });
    res.json({ data: record });
  });
  router.post(
    "/expenses/:id/review",
    permit("expenses.approve"),
    async (req, res) => {
      const input = z
        .object({ status: z.enum(["Approved", "Rejected"]), note: longText })
        .parse(req.body);
      const record = await transaction(async (session) => {
        const record = await Expense.findById(req.params.id).session(session);
        if (!record) fail(404, "Expense not found");
        if (String(record.employee) === String(req.user.employee))
          fail(403, "You cannot approve your own claim");
        if (record.status !== "Submitted")
          fail(409, "A submitted claim is required");
        if (
          !(await advanceApproval(
            req,
            "Expense",
            record,
            input.status,
            input.note,
            session,
          ))
        )
          return record;
        record.status = input.status;
        record.reviewNote = input.note;
        record.approver = req.user._id;
        await record.save({ session });
        await audit(req, "expense.reviewed", record.id, session);
        await notifyEmployee(
          record.employee,
          "Expense " + record.status.toLowerCase(),
          record.title,
          "/expenses",
          session,
        );
        return record;
      });
      res.json({ data: record });
    },
  );
  router.post("/expenses/:id/pay", permit("expenses.pay"), async (req, res) => {
    const paymentReference = text.parse(req.body.paymentReference);
    const record = await Expense.findOneAndUpdate(
      { _id: req.params.id, status: "Approved" },
      { $set: { status: "Paid", paymentReference, paidAt: new Date() } },
      { new: true },
    );
    if (!record) fail(409, "Only approved claims can be recorded as paid");
    await audit(req, "expense.payment.recorded", record.id);
    await notifyEmployee(
      record.employee,
      "Expense payment recorded",
      record.title,
      "/expenses",
    );
    res.json({ data: record });
  });
  router.get("/travel", async (req, res) =>
    res.json(
      await list(
        Travel,
        can(req.user, "travel.approve") || can(req.user, "expenses.pay")
          ? {}
          : { employee: req.user.employee || null },
        req,
        { populate: { path: "employee", select: "firstName lastName code" } },
      ),
    ),
  );
  router.post("/travel", async (req, res) => {
    const input = z
      .object({
        destination: text,
        purpose: longText,
        startDate: date,
        endDate: date,
        itinerary: longText,
        advanceRequested: money,
      })
      .refine((v) => v.endDate >= v.startDate, "Travel end must follow start")
      .parse(req.body);
    if (input.startDate < workDate())
      fail(422, "Travel requests must start today or later");
    const record = await transaction(async (session) => {
      const [record] = await Travel.create(
        [{ ...input, employee: ownEmployee(req) }],
        { session },
      );
      await openApproval(req, "Travel", record, session);
      await audit(req, "travel.requested", record.id, session);
      return record;
    });
    res.status(201).json({ data: record });
  });
  router.post(
    "/travel/:id/review",
    permit("travel.approve"),
    async (req, res) => {
      const input = z
        .object({ status: z.enum(["Approved", "Rejected"]), note: longText })
        .parse(req.body);
      const record = await transaction(async (session) => {
        const record = await Travel.findById(req.params.id).session(session);
        if (!record) fail(404, "Travel request not found");
        if (String(record.employee) === String(req.user.employee))
          fail(403, "You cannot approve your own trip");
        if (record.status !== "Requested")
          fail(409, "Only requested travel can be reviewed");
        if (
          !(await advanceApproval(
            req,
            "Travel",
            record,
            input.status,
            input.note,
            session,
          ))
        )
          return record;
        record.status = input.status;
        record.approver = req.user._id;
        record.reviewNote = input.note;
        await record.save({ session });
        await audit(req, "travel.reviewed", record.id, session);
        await notifyEmployee(
          record.employee,
          "Travel " + record.status.toLowerCase(),
          record.destination,
          "/travel",
          session,
        );
        return record;
      });
      res.json({ data: record });
    },
  );
  router.post(
    "/travel/:id/advance",
    permit("expenses.pay"),
    async (req, res) => {
      const input = z
        .object({ amount: money, paymentReference: text })
        .parse(req.body);
      const record = await Travel.findById(req.params.id);
      if (!record) fail(404, "Trip not found");
      if (record.status !== "Approved")
        fail(409, "Approved travel is required");
      if (record.advanceReference)
        fail(409, "An advance payment is already recorded");
      if (input.amount > record.advanceRequested)
        fail(422, "Advance exceeds the approved request");
      record.advancePaid = input.amount;
      record.advanceReference = input.paymentReference;
      await record.save();
      await audit(req, "travel.advance.recorded", record.id);
      res.json({ data: record });
    },
  );
  router.post("/travel/:id/start", async (req, res) => {
    const record = await Travel.findOne({
      _id: req.params.id,
      employee: ownEmployee(req),
    });
    if (!record) fail(404, "Trip not found");
    if (record.status !== "Approved") fail(409, "Approved travel is required");
    if (workDate() < record.startDate || workDate() > record.endDate)
      fail(409, "Start travel during the approved dates");
    record.status = "In Progress";
    await record.save();
    res.json({ data: record });
  });
  router.post("/travel/:id/submit-settlement", async (req, res) => {
    const record = await Travel.findOne({
      _id: req.params.id,
      employee: ownEmployee(req),
    });
    if (!record) fail(404, "Trip not found");
    if (!["Approved", "In Progress"].includes(record.status))
      fail(409, "Trip cannot be settled in its current state");
    if (workDate() < record.endDate)
      fail(409, "Submit settlement after the last travel day");
    if (
      await Expense.exists({
        travel: record._id,
        status: { $in: ["Draft", "Submitted"] },
      })
    )
      fail(409, "Resolve pending travel expenses before settlement");
    record.status = "Settlement Submitted";
    await record.save();
    await audit(req, "travel.settlement.submitted", record.id);
    res.json({ data: record });
  });
  router.post(
    "/travel/:id/settle",
    permit("expenses.pay"),
    async (req, res) => {
      const reference = text.parse(req.body.paymentReference);
      const record = await transaction(async (session) => {
        const travel = await Travel.findById(req.params.id).session(session);
        if (!travel) fail(404, "Trip not found");
        if (travel.status !== "Settlement Submitted")
          fail(409, "Submitted travel settlement is required");
        const expenses = await Expense.find({
          travel: travel._id,
          status: { $ne: "Rejected" },
        }).session(session);
        if (expenses.some((expense) => expense.status !== "Paid"))
          fail(409, "Record payment for every approved claim first");
        travel.actualExpenses = expenses.reduce(
          (sum, expense) => sum + expense.amount,
          0,
        );
        travel.balance = travel.actualExpenses - travel.advancePaid;
        travel.settlementReference = reference;
        travel.status = "Settled";
        await travel.save({ session });
        await audit(req, "travel.settled", travel.id, session);
        return travel;
      });
      res.json({ data: record });
    },
  );
  router.post("/travel/:id/cancel", async (req, res) => {
    const record = await Travel.findOne({
      _id: req.params.id,
      employee: ownEmployee(req),
      status: { $in: ["Requested", "Approved"] },
    });
    if (!record) fail(409, "Only your unstarted travel can be cancelled");
    if (record.advancePaid)
      fail(409, "Reconcile the paid advance before cancelling");
    record.status = "Cancelled";
    await record.save();
    await audit(req, "travel.cancelled", record.id);
    res.json({ data: record });
  });
  return router;
}
