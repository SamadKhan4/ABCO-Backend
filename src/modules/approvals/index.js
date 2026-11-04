import { can } from "../../security.js";
import mongoose from "mongoose";
import { Router } from "express";
import { z } from "zod";
import { scopedModel, systemScope } from "../../shared/scope.js";
import { User, Role, Employee } from "../../models.js";
import {
  id,
  text,
  fail,
  permit,
  audit,
  list,
  transaction,
} from "../../shared/workflow.js";
import { recentAuthentication } from "../admin/routes.js";
import { notifyEmployee } from "../operations/routes.js";
const { Schema } = mongoose;
export const approvalPermissions = {
  Leave: "leave.approve",
  Expense: "expenses.approve",
  Travel: "travel.approve",
  Timesheet: "timesheets.approve",
};
const workflowSchema = new Schema(
  {
    name: String,
    module: { type: String, enum: Object.keys(approvalPermissions) },
    active: { type: Boolean, default: true },
    steps: [
      {
        type: { type: String, enum: ["Role", "Reporting Manager"] },
        role: { type: Schema.Types.ObjectId, ref: "Role" },
        escalationHours: Number,
      },
    ],
  },
  { timestamps: true, strict: "throw" },
);
workflowSchema.index(
  { module: 1 },
  { unique: true, partialFilterExpression: { active: true } },
);
export const ApprovalWorkflow = mongoose.model(
  "ApprovalWorkflow",
  workflowSchema,
);
const caseSchema = new Schema(
  {
    workflow: { type: Schema.Types.ObjectId, ref: "ApprovalWorkflow" },
    module: String,
    resource: Schema.Types.ObjectId,
    employee: { type: Schema.Types.ObjectId, ref: "Employee" },
    title: String,
    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected", "Cancelled"],
      default: "Pending",
    },
    currentStep: { type: Number, default: 0 },
    steps: [
      {
        type: { type: String, enum: ["Role", "Reporting Manager"] },
        role: { type: Schema.Types.ObjectId, ref: "Role" },
        user: { type: Schema.Types.ObjectId, ref: "User" },
        escalationHours: Number,
      },
    ],
    history: [
      {
        step: Number,
        decision: String,
        actor: { type: Schema.Types.ObjectId, ref: "User" },
        at: Date,
        note: String,
      },
    ],
  },
  { timestamps: true, strict: "throw", optimisticConcurrency: true },
);
caseSchema.index({ module: 1, resource: 1 }, { unique: true });
export const ApprovalCase = scopedModel("ApprovalCase", caseSchema);
export const ApprovalDelegation = mongoose.model(
  "ApprovalDelegation",
  new Schema(
    {
      module: String,
      from: { type: Schema.Types.ObjectId, ref: "User" },
      delegate: { type: Schema.Types.ObjectId, ref: "User" },
      startsAt: Date,
      endsAt: Date,
      active: { type: Boolean, default: true },
    },
    { timestamps: true, strict: "throw" },
  ),
);
export async function openApproval(req, module, record, session) {
  const existing = await ApprovalCase.findOne({
    module,
    resource: record._id,
  }).session(session || null);
  if (existing) return existing;
  const workflow = await ApprovalWorkflow.findOne({
    module,
    active: true,
  }).session(session || null);
  if (!workflow) return null;
  const employee = await Employee.findById(record.employee).session(
    session || null,
  );
  const steps = [];
  for (const step of workflow.steps) {
    if (step.type === "Reporting Manager") {
      const manager = employee?.manager
        ? await systemScope(() =>
            User.findOne({ employee: employee.manager, active: true })
              .populate("role")
              .session(session || null),
          )
        : null;
      if (
        !manager ||
        !manager.role?.permissions?.some(
          (p) => p === "*" || p === approvalPermissions[module],
        )
      )
        fail(
          422,
          "The employee needs an active reporting manager with approval permission",
        );
      steps.push({
        type: step.type,
        user: manager._id,
        escalationHours: step.escalationHours,
      });
    } else
      steps.push({
        type: step.type,
        role: step.role,
        escalationHours: step.escalationHours,
      });
  }
  const [recordCase] = await ApprovalCase.create(
    [
      {
        workflow: workflow._id,
        module,
        resource: record._id,
        employee: record.employee,
        title:
          record.title ||
          record.type ||
          record.destination ||
          module + " request",
        steps,
      },
    ],
    { session, ordered: true },
  );
  await audit(req, "approval.opened", recordCase.id, session);
  return recordCase;
}
export async function advanceApproval(
  req,
  module,
  record,
  decision,
  note,
  session,
) {
  const request = await openApproval(req, module, record, session);
  if (!request) return true;
  if (request.status === decision) return true;
  if (request.status !== "Pending")
    fail(409, "Approval workflow is already decided");
  if (String(record.employee) === String(req.user.employee))
    fail(403, "You cannot approve your own request");
  if (
    request.history.some(
      (event) =>
        String(event.actor) === req.user.id && event.decision === "Approved",
    )
  )
    return false;
  const step = request.steps[request.currentStep];
  let authorized =
    step.type === "Role"
      ? String(step.role) === String(req.user.role._id)
      : String(step.user) === req.user.id;
  if (!authorized) {
    const delegations = await systemScope(() =>
      ApprovalDelegation.find({
        module,
        delegate: req.user._id,
        active: true,
        startsAt: { $lte: new Date() },
        endsAt: { $gt: new Date() },
      })
        .populate({ path: "from", populate: { path: "role" } })
        .session(session),
    );
    authorized = delegations.some(
      (d) =>
        d.from?.active &&
        can(d.from, approvalPermissions[module]) &&
        (step.type === "Role"
          ? String(d.from?.role?._id) === String(step.role)
          : String(d.from?._id) === String(step.user)),
    );
  }
  if (!authorized)
    fail(403, "This request is waiting for a different approval step");
  request.history.push({
    step: request.currentStep,
    decision,
    actor: req.user._id,
    at: new Date(),
    note,
  });
  if (decision === "Rejected") {
    request.status = "Rejected";
  } else if (request.currentStep === request.steps.length - 1) {
    request.status = "Approved";
  } else request.currentStep += 1;
  await request.save({ session });
  await audit(
    req,
    "approval.step." + decision.toLowerCase(),
    request.id,
    session,
  );
  return request.status !== "Pending";
}
export function approvalRoutes() {
  const router = Router();
  router.get(
    "/approval-workflows",
    permit("approvals.manage"),
    async (req, res) =>
      res.json(
        await list(ApprovalWorkflow, {}, req, {
          populate: { path: "steps.role", select: "name" },
        }),
      ),
  );
  router.get(
    "/approval-role-lookups",
    permit("approvals.manage"),
    async (_req, res) =>
      res.json({ data: await Role.find().select("name permissions").lean() }),
  );
  router.post(
    "/approval-workflows",
    permit("approvals.manage"),
    async (req, res) => {
      recentAuthentication(req);
      const data = z
        .object({
          name: text,
          module: z.enum(Object.keys(approvalPermissions)),
          steps: z
            .array(
              z.object({
                type: z.enum(["Role", "Reporting Manager"]),
                role: id.optional(),
                escalationHours: z.number().int().min(1).max(720),
              }),
            )
            .min(1)
            .max(10),
        })
        .parse(req.body);
      for (const step of data.steps)
        if (step.type === "Role") {
          const role = await Role.findById(step.role);
          if (
            !role ||
            !role.permissions.some(
              (p) => p === "*" || p === approvalPermissions[data.module],
            )
          )
            fail(
              422,
              "Every selected role must have the relevant module approval permission",
            );
        }
      const record = await transaction(async (session) => {
        await ApprovalWorkflow.updateMany(
          { module: data.module, active: true },
          { $set: { active: false } },
          { session },
        );
        const [record] = await ApprovalWorkflow.create([data], { session });
        await audit(req, "approval.workflow.configured", record.id, session);
        return record;
      });
      res.status(201).json({ data: record });
    },
  );
  router.get("/approvals", async (req, res) => {
    const filter = {
      $or: [
        { employee: req.user.employee || null },
        { "steps.role": req.user.role._id },
        { "steps.user": req.user._id },
      ],
    };
    res.json(
      await list(ApprovalCase, filter, req, {
        populate: [
          { path: "employee", select: "firstName lastName" },
          { path: "steps.role", select: "name" },
          { path: "steps.user", select: "name" },
        ],
      }),
    );
  });
  router.get("/approval-delegations", async (req, res) =>
    res.json(
      await list(
        ApprovalDelegation,
        { $or: [{ from: req.user._id }, { delegate: req.user._id }] },
        req,
        {
          populate: [
            { path: "from", select: "name" },
            { path: "delegate", select: "name" },
          ],
        },
      ),
    ),
  );
  router.get("/approval-user-lookups", async (req, res) => {
    const permissions = Object.values(approvalPermissions);
    if (
      !req.user.role.permissions.some(
        (p) => p === "*" || permissions.includes(p),
      )
    )
      fail(403, "Approval permission required");
    const roles = await Role.find({
      permissions: { $in: [...permissions, "*"] },
    });
    res.json({
      data: await systemScope(() =>
        User.find({
          active: true,
          role: { $in: roles.map((r) => r._id) },
          _id: { $ne: req.user._id },
        })
          .select("name role")
          .limit(200)
          .lean(),
      ),
    });
  });
  router.post("/approval-delegations", async (req, res) => {
    const data = z
      .object({
        module: z.enum(Object.keys(approvalPermissions)),
        delegate: id,
        startsAt: z.iso.datetime(),
        endsAt: z.iso.datetime(),
      })
      .refine(
        (v) =>
          v.endsAt > v.startsAt &&
          new Date(v.endsAt) - new Date(v.startsAt) <= 31 * 86400000,
        "Delegation duration must be between 1 minute and 31 days",
      )
      .parse(req.body);
    if (
      !req.user.role.permissions.some(
        (p) => p === "*" || p === approvalPermissions[data.module],
      )
    )
      fail(403, "You do not hold this approval permission");
    const delegate = await systemScope(() =>
      User.findOne({ _id: data.delegate, active: true }).populate("role"),
    );
    if (
      !delegate ||
      delegate.id === req.user.id ||
      !delegate.role?.permissions.some(
        (p) => p === "*" || p === approvalPermissions[data.module],
      )
    )
      fail(422, "Choose another authorized approver");
    const record = await ApprovalDelegation.create({
      ...data,
      from: req.user._id,
    });
    await audit(req, "approval.delegated", record.id);
    res.status(201).json({ data: record });
  });
  router.post("/approval-delegations/:id/revoke", async (req, res) => {
    const record = await ApprovalDelegation.findOneAndUpdate(
      { _id: req.params.id, from: req.user._id },
      { $set: { active: false } },
      { new: true },
    );
    if (!record) fail(404, "Delegation not found");
    await audit(req, "approval.delegation.revoked", record.id);
    res.json({ data: record });
  });
  return router;
}
