import { exportReport } from "./exports.js";
import {
  Project,
  Timesheet,
  Training,
  TrainingEnrollment,
  Expense,
  Travel,
  Survey,
  Skill,
} from "../extended/models.js";
import { Router } from "express";
import { z } from "zod";
import argon2 from "argon2";
import {
  Role,
  User,
  Employee,
  Attendance,
  Leave,
  LeaveBalance,
  Audit,
  Organization,
} from "../../models.js";
import { Task, DailyReport } from "../operations/models.js";
import {
  Candidate,
  Onboarding,
  Performance,
  Asset,
  Exit,
} from "../hr/models.js";
import { PayrollEntry, PayrollPeriod } from "../payroll/models.js";
import {
  id,
  text,
  fail,
  permit,
  audit,
  list,
  transaction,
} from "../../shared/workflow.js";
import { can } from "../../security.js";
import { scopedPermissions } from "../../shared/scope.js";

export const permissionCatalog = [
  "shifts.approve",
  "leave.manage",
  "projects.manage",
  "timesheets.approve",
  "training.manage",
  "expenses.manage",
  "expenses.approve",
  "expenses.pay",
  "travel.approve",
  "engagement.manage",
  "approvals.manage",
  "employee.read",
  "employee.create",
  "employee.update",
  "employee.archive",
  "attendance.read",
  "attendance.manage",
  "attendance.regularize",
  "leave.read",
  "leave.approve",
  "organization.manage",
  "tasks.manage",
  "reports.review",
  "announcements.manage",
  "helpdesk.manage",
  "recruitment.manage",
  "onboarding.manage",
  "performance.manage",
  "performance.approve",
  "assets.manage",
  "exit.manage",
  "documents.manage",
  "payroll.view",
  "payroll.process",
  "payroll.approve",
  "payroll.release",
  "reports.export",
  "settings.manage",
  "roles.manage",
  "audit.read",
];
export function recentAuthentication(req) {
  if (
    !req.session.reauthenticatedAt ||
    Date.now() - req.session.reauthenticatedAt > 5 * 60000
  )
    fail(
      403,
      "Re-enter your password in Settings before this sensitive operation",
    );
}
const csvCell = (value) => {
  let string = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(string)) string = "'" + string;
  return '"' + string.replaceAll('"', '""') + '"';
};
export function adminRoutes() {
  const router = Router();
  router.patch("/employees/me/profile", async (req, res) => {
    const input = z
      .object({
        phone: z.string().max(30),
        dateOfBirth: z.union([z.iso.date(), z.literal("")]).default(""),
        address: z.string().max(1500).default(""),
        emergencyContact: z
          .object({
            name: z.string().max(100).default(""),
            phone: z.string().max(30).default(""),
            relationship: z.string().max(100).default(""),
          })
          .optional(),
      })
      .parse(req.body);
    if (
      input.dateOfBirth &&
      input.dateOfBirth > new Date().toISOString().slice(0, 10)
    )
      fail(422, "Birth date cannot be in the future");
    const record = await Employee.findOneAndUpdate(
      { _id: req.user.employee || null, status: { $ne: "Archived" } },
      { $set: input },
      { new: true },
    );
    if (!record) fail(409, "Active employee profile required");
    await audit(req, "employee.own-profile.updated", record.id);
    res.json({ data: record });
  });
  router.post("/auth/reauthenticate", async (req, res) => {
    const password = z.string().max(128).parse(req.body.password);
    const user = await User.findById(req.user.id).select("+passwordHash");
    if (!(await argon2.verify(user.passwordHash, password)))
      fail(401, "Password is incorrect");
    req.session.reauthenticatedAt = Date.now();
    res.json({ data: true });
  });
  router.get("/permissions", permit("roles.manage"), (_req, res) =>
    res.json({ data: permissionCatalog }),
  );
  router.get("/roles", permit("roles.manage"), async (_req, res) =>
    res.json({ data: await Role.find().sort({ name: 1 }).lean() }),
  );
  const roleInput = z
    .object({
      permissions: z
        .array(z.enum(permissionCatalog))
        .max(permissionCatalog.length),
      scope: z
        .enum(["Company", "Department", "Branch", "Direct reports", "Own"])
        .default("Company"),
    })
    .refine(
      (value) =>
        value.scope === "Company" ||
        value.permissions.every((permission) =>
          scopedPermissions.includes(permission),
        ),
      "Administrative, financial and private-document permissions require a company-scoped role",
    );
  router.post("/roles", permit("roles.manage"), async (req, res) => {
    recentAuthentication(req);
    const input = roleInput.parse(req.body),
      name = text
        .refine(
          (value) => value !== "Super Admin",
          "The Super Admin role is reserved",
        )
        .parse(req.body.name);
    const role = await Role.create({ ...input, name });
    await audit(req, "role.created", role.id);
    res.status(201).json({ data: role });
  });
  router.patch("/roles/:id", permit("roles.manage"), async (req, res) => {
    recentAuthentication(req);
    const input = roleInput.parse(req.body);
    const role = await Role.findById(req.params.id);
    if (!role) fail(404, "Role not found");
    if (role.name === "Super Admin")
      fail(409, "The bootstrap Super Admin role is immutable");
    role.permissions = input.permissions;
    role.scope = input.scope;
    await role.save();
    await audit(req, "role.permissions.updated", role.id);
    res.json({ data: role });
  });
  router.get("/users", permit("roles.manage"), async (req, res) =>
    res.json(
      await list(User, {}, req, {
        populate: { path: "role", select: "name" },
        select: "name email role active employee createdAt",
      }),
    ),
  );
  router.post("/users/:id/role", permit("roles.manage"), async (req, res) => {
    recentAuthentication(req);
    const roleId = id.parse(req.body.role);
    const record = await transaction(async (session) => {
      const role = await Role.findById(roleId).session(session),
        user = await User.findById(req.params.id)
          .populate("role")
          .session(session);
      if (!role || !user) fail(404, "User or role not found");
      if (user.id === req.user.id)
        fail(409, "Another administrator must change your role");
      if (user.role?.name === "Super Admin")
        fail(409, "The bootstrap administrator role is protected");
      if (role.name === "Super Admin")
        fail(403, "Assign a dedicated role with explicit permissions");
      user.role = role._id;
      user.authVersion += 1;
      await user.save({ session });
      await audit(req, "user.role.changed", user.id, session);
      return user;
    });
    res.json({ data: { id: record.id, role: record.role } });
  });
  router.get("/audit-logs", permit("audit.read"), async (req, res) =>
    res.json(
      await list(Audit, {}, req, {
        populate: { path: "actor", select: "name" },
      }),
    ),
  );
  router.get("/organization-lookups", async (_req, res) =>
    res.json({
      data: await Organization.find({ active: true })
        .select("name kind code timezone")
        .sort({ name: 1 })
        .lean(),
    }),
  );
  router.patch(
    "/employees/:id/organization",
    permit("employee.update"),
    async (req, res) => {
      const input = z
        .object({
          departmentId: id,
          designationId: id,
          branchId: id,
          manager: id.nullable().default(null),
        })
        .parse(req.body);
      if (input.manager === req.params.id)
        fail(422, "An employee cannot report to themselves");
      const records = await Organization.find({
        _id: { $in: [input.departmentId, input.designationId, input.branchId] },
        active: true,
      });
      const department = records.find(
          (r) => r.id === input.departmentId && r.kind === "departments",
        ),
        designation = records.find(
          (r) => r.id === input.designationId && r.kind === "designations",
        ),
        branch = records.find(
          (r) => r.id === input.branchId && r.kind === "branches",
        );
      if (!department || !designation || !branch)
        fail(422, "Select active department, designation and branch records");
      if (
        input.manager &&
        !(await Employee.exists({
          _id: input.manager,
          status: { $ne: "Archived" },
        }))
      )
        fail(422, "Select an active reporting manager");
      let ancestor = input.manager;
      const visited = new Set([req.params.id]);
      while (ancestor) {
        if (visited.has(String(ancestor)))
          fail(422, "Reporting relationships cannot contain cycles");
        visited.add(String(ancestor));
        const manager = await Employee.findById(ancestor).select("manager");
        ancestor = manager?.manager;
      }
      const record = await Employee.findByIdAndUpdate(
        req.params.id,
        {
          $set: {
            ...input,
            department: department.name,
            designation: designation.name,
            branch: branch.name,
          },
        },
        { new: true },
      );
      if (!record) fail(404, "Employee not found");
      await audit(req, "employee.organization.updated", record.id);
      res.json({ data: record });
    },
  );
  const reports = {
    attrition: {
      model: Exit,
      permission: "exit.manage",
      populate: {
        path: "employee",
        select: "firstName lastName code department",
      },
      filter: { status: "Completed" },
    },
    projects: { model: Project, permission: "projects.manage" },
    timesheets: {
      model: Timesheet,
      permission: "timesheets.approve",
      populate: { path: "employee", select: "firstName lastName code" },
    },
    training: {
      model: TrainingEnrollment,
      permission: "training.manage",
      populate: [
        { path: "training", select: "title course" },
        { path: "employee", select: "firstName lastName code" },
      ],
    },
    expenses: {
      model: Expense,
      permission: "expenses.approve",
      populate: { path: "employee", select: "firstName lastName code" },
    },
    travel: {
      model: Travel,
      permission: "travel.approve",
      populate: { path: "employee", select: "firstName lastName code" },
    },
    skills: {
      model: Skill,
      permission: "training.manage",
      populate: { path: "employee", select: "firstName lastName code" },
    },
    "leave-balances": {
      model: LeaveBalance,
      permission: "leave.read",
      populate: { path: "employee", select: "firstName lastName code" },
    },
    employees: {
      model: Employee,
      permission: "employee.read",
      select:
        "code firstName lastName department designation branch joiningDate status",
    },
    attendance: {
      model: Attendance,
      permission: "attendance.read",
      populate: { path: "employee", select: "firstName lastName code" },
    },
    leaves: {
      model: Leave,
      permission: "leave.read",
      populate: { path: "employee", select: "firstName lastName code" },
    },
    tasks: {
      model: Task,
      permission: "tasks.manage",
      populate: { path: "employee", select: "firstName lastName code" },
    },
    "daily-reports": {
      model: DailyReport,
      permission: "reports.review",
      populate: { path: "employee", select: "firstName lastName code" },
    },
    recruitment: {
      model: Candidate,
      permission: "recruitment.manage",
      select: "name job status createdAt",
    },
    onboarding: {
      model: Onboarding,
      permission: "onboarding.manage",
      populate: { path: "employee", select: "firstName lastName code" },
    },
    performance: {
      model: Performance,
      permission: "performance.manage",
      populate: { path: "employee", select: "firstName lastName code" },
    },
    assets: {
      model: Asset,
      permission: "assets.manage",
      populate: { path: "employee", select: "firstName lastName code" },
    },
    exits: {
      model: Exit,
      permission: "exit.manage",
      populate: { path: "employee", select: "firstName lastName code" },
    },
    payroll: {
      model: PayrollEntry,
      permission: "payroll.view",
      select: "employeeSnapshot period payableDays gross deductionsTotal net",
      populate: { path: "period", select: "month status" },
    },
  };
  router.get("/reports/:kind", permit("reports.export"), async (req, res) => {
    const report = reports[req.params.kind];
    if (!report) fail(404, "Report not found");
    if (!can(req.user, report.permission))
      fail(403, "You do not have access to this report");
    const filter = { ...(report.filter || {}) };
    if (
      req.params.kind === "attrition" &&
      req.query.status &&
      req.query.status !== "Completed"
    )
      fail(422, "Attrition reports contain completed exits only");
    if (req.query.employee && req.params.kind !== "employees")
      filter[req.params.kind === "projects" ? "employees" : "employee"] =
        id.parse(req.query.employee);
    if (req.query.status)
      filter.status = z.string().max(40).parse(req.query.status);
    if (req.query.from || req.query.to) {
      const range = {};
      if (req.query.from) range.$gte = z.iso.date().parse(req.query.from);
      if (req.query.to) range.$lte = z.iso.date().parse(req.query.to);
      const dateField =
        req.params.kind === "attendance"
          ? "date"
          : req.params.kind === "leaves"
            ? "startDate"
            : "createdAt";
      filter[dateField] =
        dateField === "createdAt"
          ? {
              ...(range.$gte ? { $gte: new Date(range.$gte) } : {}),
              ...(range.$lte
                ? { $lt: new Date(new Date(range.$lte).getTime() + 86400000) }
                : {}),
            }
          : range;
    }
    if (
      (req.query.department || req.query.branch) &&
      req.params.kind === "recruitment"
    )
      fail(
        422,
        "Recruitment reports do not support employee department or branch filters",
      );
    if (req.query.department || req.query.branch) {
      const people = await Employee.find({
        ...(req.query.department
          ? { department: z.string().max(100).parse(req.query.department) }
          : {}),
        ...(req.query.branch
          ? { branch: z.string().max(100).parse(req.query.branch) }
          : {}),
      }).select("_id");
      const employeeFilter = {
        _id: { $in: people.map((person) => person._id) },
      };
      if (req.params.kind === "employees")
        Object.assign(filter, employeeFilter);
      else if (req.params.kind === "projects") {
        if (req.query.department)
          filter.department = z.string().max(100).parse(req.query.department);
        if (req.query.branch)
          filter.employees = { $in: people.map((person) => person._id) };
      } else if (req.params.kind === "payroll")
        filter.employee = { $in: people.map((person) => person._id) };
      else filter.employee = { $in: people.map((person) => person._id) };
    }
    if (req.query.format) {
      const format = z.enum(["csv", "xlsx", "pdf"]).parse(req.query.format);
      const count = await report.model.countDocuments(filter);
      if (count > 5000)
        fail(
          422,
          "Limit this export to 5,000 records using date, branch or department filters",
        );
      let query = report.model.find(filter).sort({ createdAt: -1 }).limit(5000);
      if (report.select) query = query.select(report.select);
      if (report.populate) query = query.populate(report.populate);
      return exportReport(
        req,
        res,
        req.params.kind,
        await query.lean(),
        format,
      );
    }
    res.json(await list(report.model, filter, req, report));
  });
  return router;
}
