import { FinalSettlement } from "../payroll/settlements.js";
import { CompanySettings } from "../operations/models.js";
import { Router } from "express";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import {
  Job,
  Candidate,
  Onboarding,
  Performance,
  Asset,
  AssetAssignment,
  Exit,
} from "./models.js";
import { Employee, User, Leave } from "../../models.js";
import { can } from "../../security.js";
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
  transition,
} from "../../shared/workflow.js";
import { notifyEmployee } from "../operations/routes.js";

const hiringTransitions = {
  Applied: ["Screening", "Rejected", "Withdrawn"],
  Screening: ["Interview", "Rejected", "Withdrawn"],
  Interview: ["Evaluation", "Rejected", "Withdrawn"],
  Evaluation: ["Selected", "Rejected", "Withdrawn"],
  Selected: ["Offered", "Rejected", "Withdrawn"],
  Offered: ["Accepted", "Rejected", "Withdrawn"],
  Accepted: ["Rejected", "Withdrawn"],
  Joined: [],
  Rejected: [],
  Withdrawn: [],
};
const exitTransitions = {
  Requested: ["Under Review", "Rejected"],
  "Under Review": ["Approved", "Rejected"],
  Approved: ["Notice Period"],
  "Notice Period": ["Clearance"],
  Clearance: ["Settlement"],
  Settlement: ["Completed"],
  Completed: [],
  Rejected: [],
};
export function hrRoutes() {
  const router = Router();
  router.get(
    "/recruitment/jobs",
    permit("recruitment.manage"),
    async (req, res) => res.json(await list(Job, {}, req)),
  );
  const jobInput = z.object({
    title: text,
    department: text,
    location: text,
    employmentType: z.enum([
      "Full time",
      "Part time",
      "Contract",
      "Internship",
    ]),
    vacancies: z.number().int().min(1).max(1000),
    description: longText,
    requirements: longText,
    openingDate: date,
    hiringManager: id.optional(),
  });
  router.post(
    "/recruitment/jobs",
    permit("recruitment.manage"),
    async (req, res) => {
      const input = jobInput.parse(req.body);
      if (input.hiringManager) await activeEmployee(input.hiringManager);
      const record = await Job.create(input);
      await audit(req, "job.created", record.id);
      res.status(201).json({ data: record });
    },
  );
  router.post(
    "/recruitment/jobs/:id/status",
    permit("recruitment.manage"),
    async (req, res) => {
      const status = z
        .enum(["Open", "On Hold", "Closed"])
        .parse(req.body.status);
      const record = await Job.findByIdAndUpdate(
        req.params.id,
        { $set: { status } },
        { new: true },
      );
      if (!record) fail(404, "Job not found");
      await audit(req, "job.status.updated", record.id);
      res.json({ data: record });
    },
  );
  router.get(
    "/recruitment/candidates",
    permit("recruitment.manage"),
    async (req, res) =>
      res.json(
        await list(
          Candidate,
          req.query.job ? { job: id.parse(req.query.job) } : {},
          req,
          { populate: { path: "job", select: "title department" } },
        ),
      ),
  );
  router.post(
    "/recruitment/candidates",
    permit("recruitment.manage"),
    async (req, res) => {
      const input = z
        .object({
          name: text,
          email: z.email().transform((v) => v.toLowerCase()),
          phone: z.string().max(30),
          job: id,
          source: text,
          experience: z.string().max(200),
          skills: z.string().max(1000),
          notes: z.string().max(3000).default(""),
        })
        .parse(req.body);
      if (!(await Job.exists({ _id: input.job, status: "Open" })))
        fail(422, "Choose an open position");
      const record = await Candidate.create(input);
      await audit(req, "candidate.created", record.id);
      res.status(201).json({ data: record });
    },
  );
  router.post(
    "/recruitment/candidates/:id/stage",
    permit("recruitment.manage"),
    async (req, res) => {
      const input = z
        .object({
          status: z.enum([
            "Applied",
            "Screening",
            "Interview",
            "Evaluation",
            "Selected",
            "Offered",
            "Accepted",
            "Rejected",
            "Withdrawn",
          ]),
          interviewAt: z.iso.datetime().optional(),
          feedback: z.string().max(3000).default(""),
        })
        .parse(req.body);
      const record = await Candidate.findById(req.params.id);
      if (!record) fail(404, "Candidate not found");
      if (
        input.status === "Interview" &&
        !input.interviewAt &&
        !record.interviewAt
      )
        fail(422, "Schedule an interview time");
      transition(record, input.status, hiringTransitions);
      if (input.interviewAt) record.interviewAt = input.interviewAt;
      record.feedback = input.feedback;
      await record.save();
      await audit(req, "candidate.stage.updated", record.id);
      res.json({ data: record });
    },
  );
  router.post(
    "/recruitment/candidates/:id/join",
    permit("recruitment.manage"),
    permit("employee.create"),
    async (req, res) => {
      const input = z
        .object({ joiningDate: date, designation: text, branch: text })
        .parse(req.body);
      const record = await transaction(async (session) => {
        const candidate = await Candidate.findById(req.params.id).session(
          session,
        );
        if (!candidate) fail(404, "Candidate not found");
        if (candidate.status === "Joined") return candidate;
        if (candidate.status !== "Accepted")
          fail(409, "An accepted offer is required");
        const job = await Job.findById(candidate.job).session(session);
        if (!job) fail(409, "Job is unavailable");
        const parts = candidate.name.split(" ");
        const [employee] = await Employee.create(
          [
            {
              code: "ABC-" + randomBytes(4).toString("hex").toUpperCase(),
              firstName: parts.shift(),
              lastName: parts.join(" "),
              email: candidate.email,
              phone: candidate.phone,
              department: job.department,
              designation: input.designation,
              branch: input.branch,
              joiningDate: input.joiningDate,
              employmentType: job.employmentType,
              status: "Probation",
            },
          ],
          { session },
        );
        candidate.employee = employee._id;
        candidate.status = "Joined";
        await candidate.save({ session });
        await Onboarding.create([{ employee: employee._id, checklist: [] }], {
          session,
        });
        await audit(req, "candidate.joined", candidate.id, session);
        return candidate;
      });
      res.json({ data: record });
    },
  );
  router.get("/onboarding", async (req, res) =>
    res.json(
      await list(
        Onboarding,
        can(req.user, "onboarding.manage")
          ? {}
          : { employee: req.user.employee || null },
        req,
        { populate: { path: "employee", select: "firstName lastName code" } },
      ),
    ),
  );
  const checklistItem = z.object({ title: text, owner: id, deadline: date });
  router.post("/onboarding", permit("onboarding.manage"), async (req, res) => {
    const input = z
      .object({
        employee: id,
        checklist: z.array(checklistItem).min(1).max(100),
      })
      .parse(req.body);
    await activeEmployee(input.employee);
    for (const item of input.checklist) await activeEmployee(item.owner);
    const record = await Onboarding.create(input);
    await notifyEmployee(
      input.employee,
      "Welcome aboard",
      "Your onboarding checklist is ready.",
      "/onboarding",
    );
    await audit(req, "onboarding.created", record.id);
    res.status(201).json({ data: record });
  });
  router.post(
    "/onboarding/:id/items",
    permit("onboarding.manage"),
    async (req, res) => {
      const input = checklistItem.parse(req.body);
      await activeEmployee(input.owner);
      const record = await Onboarding.findById(req.params.id);
      if (!record) fail(404, "Onboarding not found");
      if (record.status !== "In Progress")
        fail(409, "Completed onboarding is locked");
      record.checklist.push(input);
      await record.save();
      res.json({ data: record });
    },
  );
  router.post("/onboarding/:id/items/:itemId/complete", async (req, res) => {
    const record = await Onboarding.findById(req.params.id);
    if (!record) fail(404, "Onboarding not found");
    if (record.status === "Completed")
      fail(409, "Onboarding is already complete");
    const item = record.checklist.id(req.params.itemId);
    if (!item) fail(404, "Checklist item not found");
    if (
      !can(req.user, "onboarding.manage") &&
      String(item.owner) !== String(req.user.employee)
    )
      fail(403, "Only the item owner or HR can complete it");
    item.done = true;
    item.completedAt ||= new Date();
    await record.save();
    await audit(req, "onboarding.item.completed", record.id);
    res.json({ data: record });
  });
  router.post(
    "/onboarding/:id/approve",
    permit("onboarding.manage"),
    async (req, res) => {
      const record = await Onboarding.findById(req.params.id);
      if (!record) fail(404, "Onboarding not found");
      if (
        !record.checklist.length ||
        record.checklist.some((item) => !item.done)
      )
        fail(409, "Complete every checklist item first");
      record.status = "Completed";
      record.approvedBy = req.user._id;
      record.completedAt ||= new Date();
      await record.save();
      await audit(req, "onboarding.completed", record.id);
      res.json({ data: record });
    },
  );
  router.get("/performance", async (req, res) =>
    res.json(
      await list(
        Performance,
        can(req.user, "performance.manage")
          ? {}
          : { employee: req.user.employee || null },
        req,
        { populate: { path: "employee", select: "firstName lastName code" } },
      ),
    ),
  );
  router.post(
    "/performance",
    permit("performance.manage"),
    async (req, res) => {
      const input = z
        .object({
          employee: id,
          title: text,
          startDate: date,
          endDate: date,
          goals: z
            .array(
              z.object({
                title: text,
                weight: z.number().int().min(1).max(100),
              }),
            )
            .min(1)
            .max(20),
        })
        .refine((v) => v.endDate >= v.startDate, "Review end must follow start")
        .refine(
          (v) => v.goals.reduce((sum, g) => sum + g.weight, 0) === 100,
          "Goal weights must total 100",
        )
        .parse(req.body);
      await activeEmployee(input.employee);
      const record = await Performance.create(input);
      await audit(req, "performance.created", record.id);
      await notifyEmployee(
        input.employee,
        "Review cycle opened",
        record.title,
        "/performance",
      );
      res.status(201).json({ data: record });
    },
  );
  router.post("/performance/:id/self-review", async (req, res) => {
    const record = await Performance.findOne({
      _id: req.params.id,
      employee: ownEmployee(req),
    });
    if (!record) fail(404, "Review not found");
    if (record.status !== "Goals Assigned")
      fail(409, "Self-review has already been submitted");
    const input = z
      .object({
        scores: z.array(z.number().int().min(1).max(5)),
        comment: longText,
      })
      .parse(req.body);
    if (input.scores.length !== record.goals.length)
      fail(422, "Score every goal");
    record.goals.forEach((goal, i) => {
      goal.selfScore = input.scores[i];
    });
    record.selfComment = input.comment;
    record.status = "Self Review Submitted";
    await record.save();
    await audit(req, "performance.self-submitted", record.id);
    res.json({ data: record });
  });
  router.post(
    "/performance/:id/manager-review",
    permit("performance.manage"),
    async (req, res) => {
      const record = await Performance.findById(req.params.id);
      if (!record) fail(404, "Review not found");
      if (String(record.employee) === String(req.user.employee))
        fail(403, "You cannot review yourself");
      if (record.status !== "Self Review Submitted")
        fail(409, "Employee self-review is required");
      const input = z
        .object({
          scores: z.array(z.number().int().min(1).max(5)),
          comment: longText,
        })
        .parse(req.body);
      if (input.scores.length !== record.goals.length)
        fail(422, "Score every goal");
      record.goals.forEach((goal, i) => {
        goal.managerScore = input.scores[i];
      });
      record.weightedScore =
        record.goals.reduce((sum, g) => sum + g.weight * g.managerScore, 0) /
        100;
      record.managerComment = input.comment;
      record.reviewer = req.user._id;
      record.status = "Manager Reviewed";
      await record.save();
      await audit(req, "performance.manager-reviewed", record.id);
      res.json({ data: record });
    },
  );
  router.post(
    "/performance/:id/approve",
    permit("performance.approve"),
    async (req, res) => {
      const record = await Performance.findById(req.params.id);
      if (!record) fail(404, "Review not found");
      if (record.status !== "Manager Reviewed")
        fail(409, "Manager review required");
      if (String(record.employee) === String(req.user.employee))
        fail(403, "You cannot approve your own review");
      record.approver = req.user._id;
      record.status = "Approved";
      await record.save();
      await notifyEmployee(
        record.employee,
        "Review approved",
        record.title,
        "/performance",
      );
      await audit(req, "performance.approved", record.id);
      res.json({ data: record });
    },
  );
  router.post("/performance/:id/acknowledge", async (req, res) => {
    const record = await Performance.findOne({
      _id: req.params.id,
      employee: ownEmployee(req),
    });
    if (!record) fail(404, "Review not found");
    if (record.status !== "Approved") fail(409, "Approved review required");
    record.status = "Acknowledged";
    await record.save();
    res.json({ data: record });
  });
  router.get("/assets", async (req, res) =>
    res.json(
      await list(
        Asset,
        can(req.user, "assets.manage")
          ? {}
          : { employee: req.user.employee || null },
        req,
        { populate: { path: "employee", select: "firstName lastName code" } },
      ),
    ),
  );
  router.post("/assets", permit("assets.manage"), async (req, res) => {
    const input = z
      .object({
        name: text,
        category: text,
        serial: text,
        brand: z.string().max(100).default(""),
        model: z.string().max(100).default(""),
        purchaseDate: date,
        warrantyExpiry: date,
        condition: z.enum(["New", "Good", "Fair", "Damaged"]),
      })
      .refine(
        (v) => v.warrantyExpiry >= v.purchaseDate,
        "Warranty expiry must follow purchase",
      )
      .parse(req.body);
    const record = await Asset.create(input);
    await audit(req, "asset.created", record.id);
    res.status(201).json({ data: record });
  });
  router.get("/assets/:id/history", async (req, res) => {
    const asset = await Asset.findById(req.params.id);
    if (!asset) fail(404, "Asset not found");
    const manager = can(req.user, "assets.manage");
    if (!manager && String(asset.employee) !== String(req.user.employee))
      fail(403, "Asset access denied");
    res.json({
      data: await AssetAssignment.find({
        asset: asset._id,
        ...(manager ? {} : { employee: req.user.employee }),
      })
        .populate("employee", "firstName lastName")
        .sort({ assignedAt: -1 })
        .lean(),
    });
  });
  router.post(
    "/assets/:id/allocate",
    permit("assets.manage"),
    async (req, res) => {
      const employee = id.parse(req.body.employee);
      const record = await transaction(async (session) => {
        await activeEmployee(employee, session);
        const asset = await Asset.findOneAndUpdate(
          { _id: req.params.id, status: "Available", employee: null },
          { $set: { employee, status: "Assigned", assignedAt: new Date() } },
          { new: true, session },
        );
        if (!asset) fail(409, "Asset is unavailable or already assigned");
        await AssetAssignment.create(
          [
            {
              asset: asset._id,
              employee,
              assignedBy: req.user._id,
              assignedAt: asset.assignedAt,
            },
          ],
          { session },
        );
        await audit(req, "asset.allocated", asset.id, session);
        await notifyEmployee(
          employee,
          "Asset allocated",
          asset.name,
          "/assets",
          session,
        );
        return asset;
      });
      res.json({ data: record });
    },
  );
  router.post(
    "/assets/:id/return",
    permit("assets.manage"),
    async (req, res) => {
      const condition = z
        .enum(["New", "Good", "Fair", "Damaged"])
        .parse(req.body.condition);
      const record = await transaction(async (session) => {
        const asset = await Asset.findOneAndUpdate(
          { _id: req.params.id, status: "Assigned" },
          {
            $set: {
              employee: null,
              assignedAt: null,
              status: condition === "Damaged" ? "Under Repair" : "Available",
              condition,
            },
          },
          { session, new: true },
        );
        if (!asset) fail(409, "Asset has no active assignment");
        await AssetAssignment.updateOne(
          { asset: asset._id, active: true },
          {
            $set: {
              active: false,
              returnedAt: new Date(),
              returnCondition: condition,
            },
          },
          { session },
        );
        await audit(req, "asset.returned", asset.id, session);
        return asset;
      });
      res.json({ data: record });
    },
  );
  router.post(
    "/assets/:id/status",
    permit("assets.manage"),
    async (req, res) => {
      const status = z
        .enum(["Available", "Under Repair", "Retired"])
        .parse(req.body.status);
      const asset = await Asset.findOneAndUpdate(
        { _id: req.params.id, status: { $ne: "Assigned" } },
        { $set: { status } },
        { new: true },
      );
      if (!asset) fail(409, "Return the asset before changing its status");
      await audit(req, "asset.status.updated", asset.id);
      res.json({ data: asset });
    },
  );
  router.get("/exits", async (req, res) =>
    res.json(
      await list(
        Exit,
        can(req.user, "exit.manage")
          ? {}
          : { employee: req.user.employee || null },
        req,
        { populate: { path: "employee", select: "firstName lastName code" } },
      ),
    ),
  );
  router.post("/exits", async (req, res) => {
    const input = z
      .object({
        resignationDate: date,
        lastWorkingDate: date,
        reason: longText,
        separationType: z.enum(["Resignation", "Retirement", "Contract End"]),
        handover: longText,
      })
      .refine(
        (v) => v.lastWorkingDate >= v.resignationDate,
        "Last workday must follow resignation",
      )
      .parse(req.body);
    const record = await transaction(async (session) => {
      const employee = await Employee.findOneAndUpdate(
        { _id: ownEmployee(req), status: { $ne: "Archived" } },
        { $inc: { leaveVersion: 1 } },
        { session },
      );
      if (!employee) fail(409, "Active profile required");
      if (
        await Exit.exists({
          employee: employee._id,
          status: { $nin: ["Completed", "Rejected"] },
        }).session(session)
      )
        fail(409, "An active exit request already exists");
      const [exit] = await Exit.create(
        [
          {
            ...input,
            employee: employee._id,
            history: [
              { status: "Requested", actor: req.user._id, at: new Date() },
            ],
          },
        ],
        { session },
      );
      await audit(req, "exit.requested", exit.id, session);
      return exit;
    });
    res.status(201).json({ data: record });
  });
  router.post(
    "/exits/:id/transition",
    permit("exit.manage"),
    async (req, res) => {
      const input = z
        .object({
          status: z.enum([
            "Under Review",
            "Approved",
            "Notice Period",
            "Clearance",
            "Settlement",
            "Completed",
            "Rejected",
          ]),
          note: longText,
          handoverComplete: z.boolean().default(false),
          documentsComplete: z.boolean().default(false),
          settlementReviewed: z.boolean().default(false),
        })
        .parse(req.body);
      const record = await transaction(async (session) => {
        const exit = await Exit.findById(req.params.id).session(session);
        if (!exit) fail(404, "Exit request not found");
        if (String(exit.employee) === String(req.user.employee))
          fail(403, "Another administrator must review your exit");
        if (!transition(exit, input.status, exitTransitions)) return exit;
        if (input.status === "Settlement" || input.status === "Completed") {
          if (
            await Asset.exists({
              employee: exit.employee,
              status: "Assigned",
            }).session(session)
          )
            fail(409, "Return all assigned assets first");
          if (!input.handoverComplete || !input.documentsComplete)
            fail(409, "Complete handover and document clearance first");
        }
        if (input.status === "Completed") {
          const company =
              await CompanySettings.findById("company").session(session),
            settlement = await FinalSettlement.findOne({
              exit: exit._id,
            }).session(session);
          if (
            (company?.requireFinalSettlement || settlement) &&
            settlement?.status !== "Paid"
          )
            fail(
              409,
              "Finance must approve and record the final settlement first",
            );
          if (!input.settlementReviewed)
            fail(409, "Final settlement must be reviewed");
          if (
            await Leave.exists({
              employee: exit.employee,
              status: "Pending",
            }).session(session)
          )
            fail(409, "Resolve pending leave requests before closing the exit");
          await Employee.updateOne(
            { _id: exit.employee },
            {
              $set: {
                status: "Archived",
                lastWorkingDate: exit.lastWorkingDate,
              },
            },
            { session },
          );
          await User.updateMany(
            { employee: exit.employee },
            { $set: { active: false }, $inc: { authVersion: 1 } },
            { session },
          );
        }
        exit.clearance = {
          handoverComplete: input.handoverComplete,
          documentsComplete: input.documentsComplete,
          settlementReviewed: input.settlementReviewed,
        };
        exit.settlementNote = input.note;
        exit.history.push({
          status: input.status,
          actor: req.user._id,
          at: new Date(),
          note: input.note,
        });
        await exit.save({ session });
        await audit(
          req,
          "exit." + input.status.toLowerCase(),
          exit.id,
          session,
        );
        return exit;
      });
      res.json({ data: record });
    },
  );
  return router;
}
