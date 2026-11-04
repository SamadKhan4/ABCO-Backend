import { shiftSwapRoutes } from "./modules/attendance/swaps.js";
import {
  completionRoutes,
  validateOrganization,
} from "./modules/admin/completion.js";
import { loanRoutes } from "./modules/payroll/loans.js";
import { settlementRoutes } from "./modules/payroll/settlements.js";
import { growthRoutes } from "./modules/hr/growth.js";
import { letterRoutes } from "./modules/documents/letters.js";
import { assetMaintenanceRoutes } from "./modules/hr/assets.js";
import { calendarRoutes } from "./modules/operations/calendar.js";
import { notificationSettings } from "./modules/operations/reminders.js";
import { financeRoutes } from "./modules/payroll/finance.js";
import { leaveManagement } from "./modules/leave/management.js";
import { employeeInput } from "./shared/employee-input.js";
import { employeeImports } from "./modules/admin/imports.js";
import { mfaRoutes, verifySecondFactor } from "./modules/auth/mfa.js";
import { dashboardInsights } from "./modules/dashboard/insights.js";
import { projectRoutes } from "./modules/extended/projects.js";
import { trainingRoutes } from "./modules/extended/training.js";
import { expenseRoutes } from "./modules/extended/expenses.js";
import { engagementRoutes } from "./modules/extended/engagement.js";
import { approvalRoutes } from "./modules/approvals/index.js";
import { scopedRequest } from "./shared/scope.js";
import express from "express";
import session from "express-session";
import MongoStore from "connect-mongo";
import cors from "cors";
import helmet from "helmet";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import pino from "pino-http";
import argon2 from "argon2";
import {
  randomBytes,
  randomUUID,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import mongoose from "mongoose";
import { z } from "zod";
import {
  User,
  Employee,
  Attendance,
  Leave,
  Audit,
  Organization,
  Role,
} from "./models.js";
import { can, workDate, durationMinutes } from "./security.js";
import { leaveRoutes } from "./leaves.js";
import { createInitialAdmin } from "./setup.js";
import { operationsRoutes } from "./modules/operations/routes.js";
import { hrRoutes } from "./modules/hr/routes.js";
import { payrollRoutes } from "./modules/payroll/routes.js";
import { documentRoutes } from "./modules/documents/routes.js";
import { adminRoutes } from "./modules/admin/routes.js";
import { recoveryRoutes } from "./modules/auth/recovery.js";
import { attendanceRoutes } from "./modules/attendance/routes.js";

export function createApp({ sessionStore, logLevel } = {}) {
  const app = express();
  const dummyHash = argon2.hash(randomBytes(32).toString("hex"), {
    type: argon2.argon2id,
  });
  const production = process.env.NODE_ENV === "production";
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)
    throw new Error("SESSION_SECRET must contain at least 32 characters");
  if (production) app.set("trust proxy", 1);
  app.use(helmet());
  app.use(
    pino({
      level: logLevel || (process.env.NODE_ENV === "test" ? "silent" : "info"),
      genReqId: () => randomUUID(),
      serializers: {
        req: (r) => ({ id: r.id, method: r.method, url: r.url?.split("?")[0] }),
        res: (r) => ({ statusCode: r.statusCode }),
      },
    }),
  );
  app.use(
    cors({
      origin: process.env.FRONTEND_ORIGIN || "http://127.0.0.1:5180",
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "100kb" }));
  app.use((req, _res, next) => {
    req.body ??= {};
    next();
  });

  app.use(
    session({
      name: "abco.sid",
      secret: process.env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      store:
        sessionStore ||
        MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
      cookie: {
        httpOnly: true,
        secure: production,
        sameSite: "strict",
        maxAge: 8 * 60 * 60 * 1000,
      },
    }),
  );
  app.use(
    rateLimit({
      windowMs: 60000,
      limit: (req) => (req.session.userId ? 600 : 120),
      keyGenerator: (req) => req.session.userId || ipKeyGenerator(req.ip),
      message: {
        error: {
          message: "Request limit reached. Wait a minute and try again.",
        },
      },
    }),
  );
  const api = express.Router();
  app.use("/api/v1", api);
  api.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  const csrf = (req) => (req.session.csrf ||= randomBytes(32).toString("hex"));
  api.get("/health", (_req, res) =>
    res.status(mongoose.connection.readyState === 1 ? 200 : 503).json({
      data: {
        database:
          mongoose.connection.readyState === 1 ? "connected" : "unavailable",
      },
    }),
  );
  api.get("/auth/csrf", (req, res) => res.json({ data: { token: csrf(req) } }));
  api.use((req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const token = req.get("x-csrf-token") || "";
    const expected = req.session.csrf || "";
    if (
      !expected ||
      !/^[a-f0-9]{64}$/.test(token) ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(expected))
    )
      return res.status(403).json({
        error: {
          message: "Session verification failed. Refresh and try again.",
        },
      });
    next();
  });
  const loginSchema = z.object({
    email: z.email(),
    password: z.string().min(1).max(128),
    totp: z.string().max(64).optional(),
  });
  api.post(
    "/auth/setup",
    rateLimit({ windowMs: 15 * 60000, limit: 5 }),
    async (req, res) => {
      const input = z
        .object({
          token: z.string().regex(/^[a-f0-9]{64}$/),
          name: z.string().trim().min(1).max(80),
          email: z.email().transform((v) => v.toLowerCase()),
          password: z.string().min(12).max(128),
        })
        .parse(req.body);
      await createInitialAdmin(input);
      res.status(201).json({ data: true });
    },
  );
  api.post(
    "/auth/login",
    rateLimit({ windowMs: 15 * 60000, limit: 10 }),
    async (req, res) => {
      const input = loginSchema.parse(req.body);
      const user = await User.findOne({
        email: input.email.toLowerCase(),
        active: true,
      })
        .select("+passwordHash")
        .populate("role");
      if (user?.lockedUntil > new Date())
        return res.status(401).json({
          error: {
            message:
              "Email or password is incorrect, or the account is temporarily locked",
          },
        });
      const passwordValid = await argon2.verify(
        user?.passwordHash || (await dummyHash),
        input.password,
      );
      if (!user || !passwordValid) {
        if (user) {
          const failures = (user.failedLogins || 0) + 1;
          await User.updateOne(
            { _id: user._id },
            {
              $set: {
                failedLogins: failures,
                ...(failures >= 5
                  ? { lockedUntil: new Date(Date.now() + 15 * 60000) }
                  : {}),
              },
            },
          );
          await Audit.create({
            actor: user._id,
            action: "auth.login.failed",
            requestId: req.id,
          });
        }
        return res
          .status(401)
          .json({ error: { message: "Email or password is incorrect" } });
      }
      if (user.mfaEnabled && !(await verifySecondFactor(user.id, input.totp)))
        return res.status(401).json({
          error: {
            code: "MFA_REQUIRED",
            message:
              "Enter a fresh authenticator code or an unused recovery code",
          },
        });
      await User.updateOne(
        { _id: user._id },
        { $set: { failedLogins: 0 }, $unset: { lockedUntil: 1 } },
      );
      await new Promise((resolve, reject) =>
        req.session.regenerate((e) => (e ? reject(e) : resolve())),
      );
      req.session.userId = user.id;
      req.session.authVersion = user.authVersion;
      req.session.reauthenticatedAt = Date.now();
      csrf(req);
      await Audit.create({
        actor: user._id,
        action: "auth.login",
        requestId: req.id,
      });
      res.json({ data: { csrfToken: req.session.csrf } });
    },
  );
  api.post(
    "/auth/activate",
    rateLimit({ windowMs: 15 * 60000, limit: 10 }),
    async (req, res) => {
      const input = z
        .object({
          token: z.string().regex(/^[a-f0-9]{64}$/),
          password: z.string().min(12).max(128),
        })
        .parse(req.body);
      const hash = createHash("sha256").update(input.token).digest("hex");
      const candidate = await User.findOne({
        activationHash: hash,
        activationExpires: { $gt: new Date() },
        active: false,
      });
      if (!candidate)
        return res.status(400).json({
          error: { message: "Activation link is invalid or expired" },
        });
      const employee = await Employee.findById(candidate.employee);
      if (!employee || employee.status === "Archived")
        return res
          .status(400)
          .json({ error: { message: "Employee profile is inactive" } });
      const passwordHash = await argon2.hash(input.password, {
        type: argon2.argon2id,
      });
      const user = await User.findOneAndUpdate(
        {
          _id: candidate._id,
          activationHash: hash,
          activationExpires: { $gt: new Date() },
          active: false,
        },
        {
          $set: { active: true, passwordHash },
          $unset: { activationHash: 1, activationExpires: 1 },
        },
        { new: true },
      );
      if (!user)
        return res.status(409).json({
          error: { message: "Activation link has already been used" },
        });
      await Audit.create({
        actor: user._id,
        action: "auth.activated",
        requestId: req.id,
      });
      res.json({ data: true });
    },
  );
  api.use(recoveryRoutes());
  api.use(async (req, res, next) => {
    if (!req.session.userId)
      return res.status(401).json({ error: { message: "Please sign in" } });
    const user = await User.findOne({
      _id: req.session.userId,
      active: true,
    }).populate("role");
    if (!user || user.authVersion !== req.session.authVersion)
      return res
        .status(401)
        .json({ error: { message: "Account or session unavailable" } });
    req.user = user;
    next();
  });
  api.use(scopedRequest);
  const permit = (permission) => (req, res, next) =>
    can(req.user, permission)
      ? next()
      : res.status(403).json({
          error: { message: "You do not have permission for this action" },
        });
  const audit = async (req, action, resource) =>
    Audit.create({
      actor: req.user._id,
      action,
      resource: String(resource),
      requestId: req.id,
    });
  api.get("/auth/me", (req, res) =>
    res.json({
      data: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        employee: req.user.employee,
        isSuperAdmin: req.user.role?.name === "Super Admin",
        role: req.user.role?.name,
        scope: req.user.role?.scope || "Company",
        permissions: req.user.role?.permissions || [],
        csrfToken: csrf(req),
      },
    }),
  );
  api.post("/auth/logout", async (req, res) => {
    await new Promise((resolve, reject) =>
      req.session.destroy((e) => (e ? reject(e) : resolve())),
    );
    res
      .clearCookie("abco.sid", {
        httpOnly: true,
        secure: production,
        sameSite: "strict",
      })
      .json({ data: true });
  });
  api.post("/auth/change-password", async (req, res) => {
    const input = z
      .object({
        currentPassword: z.string(),
        password: z.string().min(12).max(128),
      })
      .parse(req.body);
    const user = await User.findById(req.user.id).select("+passwordHash");
    if (!(await argon2.verify(user.passwordHash, input.currentPassword)))
      return res
        .status(400)
        .json({ error: { message: "Current password is incorrect" } });
    user.passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
    });
    user.authVersion += 1;
    await user.save();
    await audit(req, "auth.password.changed", user.id);
    await new Promise((resolve, reject) =>
      req.session.destroy((e) => (e ? reject(e) : resolve())),
    );
    res.json({ data: true });
  });
  const employeeSchema = employeeInput;
  api.get("/employees/me", async (req, res) =>
    res.json({
      data: req.user.employee
        ? await Employee.findById(req.user.employee).lean()
        : null,
    }),
  );
  api.get("/employees", permit("employee.read"), async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1),
      limit = 12;
    const query = {};
    if (req.query.search) {
      const escaped = String(req.query.search)
        .slice(0, 100)
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = ["firstName", "lastName", "email", "code", "department"].map(
        (key) => ({ [key]: new RegExp(escaped, "i") }),
      );
    }
    if (req.query.status)
      query.status = z
        .enum(["Active", "Probation", "Archived"])
        .parse(req.query.status);
    const [data, total] = await Promise.all([
      Employee.find(query)
        .select(
          "code firstName lastName email department designation branch joiningDate status employmentType phone",
        )
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Employee.countDocuments(query),
    ]);
    res.json({
      data,
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  });
  api.post("/employees", permit("employee.create"), async (req, res) => {
    const input = employeeSchema.parse(req.body);
    const employee = await Employee.create({
      ...input,
      code: `ABC-${randomBytes(4).toString("hex").toUpperCase()}`,
    });
    await audit(req, "employee.created", employee.id);
    res.status(201).json({ data: employee });
  });
  api.post(
    "/employees/:id/invite",
    permit("employee.create"),
    async (req, res) => {
      const employee = await Employee.findById(req.params.id);
      if (!employee || employee.status === "Archived")
        return res.status(409).json({
          error: { message: "An active employee profile is required" },
        });
      const role = await Role.findOne({ name: "Employee" });
      if (!role)
        return res
          .status(409)
          .json({ error: { message: "Employee role is not configured" } });
      const existing = await User.findOne({
        $or: [{ employee: employee._id }, { email: employee.email }],
      });
      if (
        existing?.active ||
        (existing && String(existing.employee) !== employee.id)
      )
        return res.status(409).json({
          error: { message: "An account already exists for these details" },
        });
      const token = randomBytes(32).toString("hex");
      const activationHash = createHash("sha256").update(token).digest("hex");
      await User.findOneAndUpdate(
        { email: employee.email, employee: employee._id },
        {
          $set: {
            name: `${employee.firstName} ${employee.lastName}`.trim(),
            role: role._id,
            active: false,
            activationHash,
            activationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
          $inc: { authVersion: 1 },
        },
        { upsert: true, runValidators: true },
      );
      await audit(req, "employee.invited", employee.id);
      res.status(201).json({
        data: {
          activationPath: `/activate?token=${token}`,
          expiresInHours: 24,
        },
      });
    },
  );
  api.patch("/employees/:id", permit("employee.update"), async (req, res) => {
    const input = employeeSchema.partial().parse(req.body);
    if (input.email) {
      const linked = await User.findOne({ employee: req.params.id });
      if (linked && linked.email !== input.email)
        return res.status(409).json({
          error: {
            message:
              "Account email changes require a separate verified account update",
          },
        });
    }
    const employee = await Employee.findByIdAndUpdate(
      req.params.id,
      { $set: input },
      { new: true, runValidators: true },
    );
    if (!employee)
      return res.status(404).json({ error: { message: "Employee not found" } });
    await audit(req, "employee.updated", employee.id);
    res.json({ data: employee });
  });
  api.post(
    "/employees/:id/archive",
    permit("employee.archive"),
    async (req, res) => {
      const employee = await Employee.findByIdAndUpdate(
        req.params.id,
        { $set: { status: "Archived" } },
        { new: true },
      );
      if (!employee)
        return res
          .status(404)
          .json({ error: { message: "Employee not found" } });
      await User.updateMany(
        { employee: employee._id },
        { $set: { active: false } },
      );
      await audit(req, "employee.archived", employee.id);
      res.json({ data: employee });
    },
  );
  api.get("/dashboard", async (req, res) => {
    const broad = can(req.user, "employee.read");
    const filter = broad ? {} : { _id: req.user.employee || null };
    const today = workDate();
    const attendanceFilter = broad
      ? { date: today }
      : { date: today, employee: req.user.employee || null };
    const [total, active, probation, present, departments, recent, pending] =
      await Promise.all([
        Employee.countDocuments(filter),
        Employee.countDocuments({ ...filter, status: "Active" }),
        Employee.countDocuments({ ...filter, status: "Probation" }),
        Attendance.countDocuments({
          ...attendanceFilter,
          punchIn: { $exists: true },
        }),
        Employee.aggregate([
          { $match: filter },
          { $group: { _id: "$department", value: { $sum: 1 } } },
        ]),
        Employee.find(filter)
          .select(
            "code firstName lastName email department designation branch joiningDate status employmentType phone",
          )
          .sort({ createdAt: -1 })
          .limit(5)
          .lean(),
        Leave.countDocuments(
          broad
            ? { status: "Pending" }
            : { status: "Pending", employee: req.user.employee || null },
        ),
      ]);
    res.json({
      data: {
        total,
        active,
        probation,
        present,
        pending,
        departments,
        recent,
        date: today,
        broad,
      },
    });
  });
  api.use(attendanceRoutes());
  api.use(shiftSwapRoutes());
  api.use(leaveRoutes());
  api.use(leaveManagement());
  const organizationKind = z.enum([
    "departments",
    "designations",
    "branches",
    "shifts",
  ]);
  const organizationSchema = z.object({
    head: z
      .union([z.string().regex(/^[a-f\d]{24}$/i), z.literal("")])
      .transform((v) => v || null)
      .optional(),
    parent: z
      .union([z.string().regex(/^[a-f\d]{24}$/i), z.literal("")])
      .transform((v) => v || null)
      .optional(),
    level: z.number().int().min(1).max(100).optional(),
    address: z.string().max(1000).optional(),
    name: z.string().trim().min(1).max(100),
    code: z
      .string()
      .trim()
      .min(1)
      .max(30)
      .transform((s) => s.toUpperCase()),
    description: z.string().max(500).default(""),
    timezone: z
      .string()
      .refine((value) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }, "Invalid timezone")
      .default("Asia/Kolkata"),
    startTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .optional(),
    endTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .optional(),
    graceMinutes: z.number().int().min(0).max(120).default(0),
  });
  api.get(
    "/organization/:kind",
    permit("organization.manage"),
    async (req, res) => {
      const kind = organizationKind.parse(req.params.kind);
      res.json({
        data: await Organization.find({ kind })
          .sort({ active: -1, name: 1 })
          .limit(200)
          .lean(),
      });
    },
  );
  api.post(
    "/organization/:kind",
    permit("organization.manage"),
    async (req, res) => {
      const kind = organizationKind.parse(req.params.kind),
        input = organizationSchema.parse(req.body);
      if (kind === "shifts" && (!input.startTime || !input.endTime))
        return res.status(422).json({
          error: { message: "Shift start and end times are required" },
        });
      await validateOrganization(input, kind);
      const record = await Organization.create({ ...input, kind });
      await audit(req, "organization.created", record.id);
      res.status(201).json({ data: record });
    },
  );
  api.patch(
    "/organization/:kind/:id",
    permit("organization.manage"),
    async (req, res) => {
      const kind = organizationKind.parse(req.params.kind),
        input = organizationSchema.partial().parse(req.body);
      await validateOrganization(input, kind, req.params.id);
      const record = await Organization.findOneAndUpdate(
        { _id: req.params.id, kind },
        { $set: input },
        { new: true, runValidators: true },
      );
      if (!record)
        return res
          .status(404)
          .json({ error: { message: "Organization record not found" } });
      await audit(req, "organization.updated", record.id);
      res.json({ data: record });
    },
  );
  api.post(
    "/organization/:kind/:id/deactivate",
    permit("organization.manage"),
    async (req, res) => {
      const kind = organizationKind.parse(req.params.kind);
      const record = await Organization.findOneAndUpdate(
        { _id: req.params.id, kind },
        { $set: { active: false } },
        { new: true },
      );
      if (!record)
        return res
          .status(404)
          .json({ error: { message: "Organization record not found" } });
      await audit(req, "organization.deactivated", record.id);
      res.json({ data: record });
    },
  );
  api.use(operationsRoutes());
  api.use(completionRoutes());
  api.use(calendarRoutes());
  api.use(notificationSettings());
  api.use(hrRoutes());
  api.use(growthRoutes());
  api.use(letterRoutes());
  api.use(assetMaintenanceRoutes());
  api.use(payrollRoutes());
  api.use(financeRoutes());
  api.use(loanRoutes());
  api.use(settlementRoutes());
  api.use(documentRoutes());
  api.use(adminRoutes());
  api.use(employeeImports());
  api.use(mfaRoutes());
  api.use(dashboardInsights());
  api.use(projectRoutes());
  api.use(trainingRoutes());
  api.use(expenseRoutes());
  api.use(engagementRoutes());
  api.use(approvalRoutes());
  api.use((_req, res) =>
    res.status(404).json({ error: { message: "API endpoint not found" } }),
  );
  app.use((err, req, res, _next) => {
    if (err instanceof z.ZodError)
      return res.status(422).json({
        error: { message: err.issues.map((i) => i.message).join("; ") },
      });
    if (err.status && err.status >= 400 && err.status < 500)
      return res.status(err.status).json({ error: { message: err.message } });
    if (err.name === "VersionError")
      return res.status(409).json({
        error: { message: "This record changed. Refresh and try again." },
      });
    if (err.name === "MulterError")
      return res.status(422).json({
        error: {
          message:
            err.code === "LIMIT_FILE_SIZE"
              ? "File must be no larger than 8 MB"
              : "Invalid upload request",
        },
      });
    if (err.code === 11000)
      return res.status(409).json({
        error: {
          message: "A record with these unique details already exists",
        },
      });
    if (err.name === "CastError")
      return res
        .status(400)
        .json({ error: { message: "Invalid record identifier" } });
    req.log.error(
      { err: { name: err.name, message: err.message } },
      "Request failed",
    );
    res.status(500).json({
      error: { message: "Unable to complete request", requestId: req.id },
    });
  });
  return app;
}
