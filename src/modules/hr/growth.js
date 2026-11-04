import mongoose from "mongoose";
import { Router } from "express";
import { z } from "zod";
import { scopedModel, systemScope } from "../../shared/scope.js";
import { Performance } from "./models.js";
import { Employee } from "../../models.js";
import { can, workDate } from "../../security.js";
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
  transition,
} from "../../shared/workflow.js";
import { notifyEmployee } from "../operations/routes.js";
const { Schema } = mongoose,
  ref = (name) => ({ type: Schema.Types.ObjectId, ref: name }),
  options = { timestamps: true, strict: "throw", optimisticConcurrency: true };
export const PeerFeedback = mongoose.model(
  "PeerFeedback",
  new Schema(
    {
      review: ref("Performance"),
      employee: ref("Employee"),
      reviewer: ref("Employee"),
      status: {
        type: String,
        enum: ["Requested", "Submitted"],
        default: "Requested",
      },
      rating: Number,
      feedback: String,
    },
    options,
  ),
);
PeerFeedback.schema.index({ review: 1, reviewer: 1 }, { unique: true });
export const ImprovementPlan = scopedModel(
  "ImprovementPlan",
  new Schema(
    {
      employee: ref("Employee"),
      title: String,
      reason: String,
      goals: String,
      startDate: String,
      endDate: String,
      status: {
        type: String,
        enum: ["Active", "Completed", "Cancelled"],
        default: "Active",
      },
      checkIns: [
        { date: String, notes: String, progress: Number, actor: ref("User") },
      ],
      reviewNote: String,
      createdBy: ref("User"),
    },
    options,
  ),
);
export const AppraisalRecommendation = scopedModel(
  "AppraisalRecommendation",
  new Schema(
    {
      employee: ref("Employee"),
      kind: { type: String, enum: ["Increment", "Promotion"] },
      reason: String,
      incrementBasisPoints: Number,
      proposedDesignation: String,
      status: {
        type: String,
        enum: ["Pending", "Approved", "Rejected"],
        default: "Pending",
      },
      createdBy: ref("User"),
      approver: ref("User"),
      reviewNote: String,
    },
    options,
  ),
);
export function growthRoutes() {
  const router = Router();
  router.get("/peer-feedback", async (req, res) => {
    let filter;
    if (can(req.user, "performance.manage")) {
      const people = await Employee.find().select("_id");
      filter = { employee: { $in: people.map((p) => p._id) } };
    } else filter = { reviewer: req.user.employee || null };
    res.json(
      await systemScope(() =>
        list(PeerFeedback, filter, req, {
          populate: [
            { path: "review", select: "title" },
            { path: "employee", select: "firstName lastName" },
            { path: "reviewer", select: "firstName lastName" },
          ],
        }),
      ),
    );
  });
  router.post(
    "/peer-feedback",
    permit("performance.manage"),
    async (req, res) => {
      const input = z.object({ review: id, reviewer: id }).parse(req.body);
      const review = await Performance.findById(input.review);
      if (!review) fail(404, "Performance review not found");
      await activeEmployee(input.reviewer);
      if (String(review.employee) === input.reviewer)
        fail(422, "Choose a colleague other than the person being reviewed");
      if (["Approved", "Acknowledged"].includes(review.status))
        fail(409, "The review is already closed");
      if (
        await PeerFeedback.exists({
          review: review._id,
          reviewer: input.reviewer,
        })
      )
        fail(409, "Feedback has already been requested from this colleague");
      const record = await PeerFeedback.create({
        review: review._id,
        employee: review.employee,
        reviewer: input.reviewer,
      });
      await notifyEmployee(
        input.reviewer,
        "Peer feedback requested",
        "A colleague’s review is ready for your input.",
        "/peer-feedback",
      );
      await audit(req, "performance.peer-feedback.requested", record.id);
      res.status(201).json({ data: record });
    },
  );
  router.post("/peer-feedback/:id/respond", async (req, res) => {
    const input = z
      .object({ rating: z.number().int().min(1).max(5), feedback: longText })
      .parse(req.body);
    const record = await PeerFeedback.findOne({
      _id: req.params.id,
      reviewer: ownEmployee(req),
    });
    if (!record) fail(404, "Feedback request not found");
    if (record.status === "Submitted")
      fail(409, "Feedback has already been submitted");
    record.rating = input.rating;
    record.feedback = input.feedback;
    record.status = "Submitted";
    await record.save();
    await audit(req, "performance.peer-feedback.submitted", record.id);
    res.json({ data: record });
  });
  router.get("/improvement-plans", async (req, res) =>
    res.json(
      await list(
        ImprovementPlan,
        can(req.user, "performance.manage")
          ? {}
          : { employee: req.user.employee || null },
        req,
        { populate: { path: "employee", select: "firstName lastName code" } },
      ),
    ),
  );
  router.post(
    "/improvement-plans",
    permit("performance.manage"),
    async (req, res) => {
      const input = z
        .object({
          employee: id,
          title: text,
          reason: longText,
          goals: longText,
          startDate: date,
          endDate: date,
        })
        .refine((v) => v.endDate >= v.startDate, "Plan end must follow start")
        .parse(req.body);
      await activeEmployee(input.employee);
      const record = await ImprovementPlan.create({
        ...input,
        createdBy: req.user._id,
      });
      await audit(req, "performance.improvement-plan.created", record.id);
      res.status(201).json({ data: record });
    },
  );
  router.post("/improvement-plans/:id/check-in", async (req, res) => {
    const record = await ImprovementPlan.findById(req.params.id);
    if (!record) fail(404, "Improvement plan not found");
    if (
      !can(req.user, "performance.manage") &&
      String(record.employee) !== String(req.user.employee)
    )
      fail(403, "Plan access denied");
    if (record.status !== "Active") fail(409, "The plan is already closed");
    const input = z
      .object({ notes: longText, progress: z.number().int().min(0).max(100) })
      .parse(req.body);
    record.checkIns.push({ ...input, date: workDate(), actor: req.user._id });
    await record.save();
    await audit(req, "performance.improvement-plan.check-in", record.id);
    res.json({ data: record });
  });
  router.post(
    "/improvement-plans/:id/close",
    permit("performance.manage"),
    async (req, res) => {
      const input = z
        .object({ status: z.enum(["Completed", "Cancelled"]), note: longText })
        .parse(req.body);
      const record = await ImprovementPlan.findById(req.params.id);
      if (!record) fail(404, "Plan not found");
      if (record.status !== "Active") fail(409, "The plan is already closed");
      if (String(record.employee) === String(req.user.employee))
        fail(403, "Another reviewer must close your plan");
      record.status = input.status;
      record.reviewNote = input.note;
      await record.save();
      await audit(req, "performance.improvement-plan.closed", record.id);
      res.json({ data: record });
    },
  );
  router.get("/appraisal-recommendations", async (req, res) =>
    res.json(
      await list(
        AppraisalRecommendation,
        can(req.user, "performance.manage")
          ? {}
          : can(req.user, "payroll.approve")
            ? { kind: "Increment" }
            : { employee: req.user.employee || null, status: "Approved" },
        req,
        { populate: { path: "employee", select: "firstName lastName code" } },
      ),
    ),
  );
  router.post(
    "/appraisal-recommendations",
    permit("performance.manage"),
    async (req, res) => {
      const input = z
        .object({
          employee: id,
          kind: z.enum(["Increment", "Promotion"]),
          reason: longText,
          incrementBasisPoints: z.number().int().min(0).max(10000).optional(),
          proposedDesignation: z.string().max(100).optional(),
        })
        .refine(
          (v) =>
            v.kind === "Increment"
              ? v.incrementBasisPoints > 0
              : Boolean(v.proposedDesignation?.trim()),
          "Specify the proposed increment percentage or promotion designation",
        )
        .parse(req.body);
      await activeEmployee(input.employee);
      const record = await AppraisalRecommendation.create({
        ...input,
        createdBy: req.user._id,
      });
      await audit(req, "appraisal.recommendation.created", record.id);
      res.status(201).json({ data: record });
    },
  );
  router.post("/appraisal-recommendations/:id/review", async (req, res) => {
    const input = z
      .object({ status: z.enum(["Approved", "Rejected"]), note: longText })
      .parse(req.body);
    const record = await AppraisalRecommendation.findById(req.params.id);
    if (!record) fail(404, "Recommendation not found");
    const permission =
      record.kind === "Increment" ? "payroll.approve" : "performance.approve";
    if (!can(req.user, permission))
      fail(403, "Authorized finance or HR approval is required");
    if (
      String(record.createdBy) === req.user.id ||
      String(record.employee) === String(req.user.employee)
    )
      fail(403, "Another authorized reviewer must decide this recommendation");
    if (record.status !== "Pending")
      fail(409, "Recommendation already decided");
    record.status = input.status;
    record.reviewNote = input.note;
    record.approver = req.user._id;
    await record.save();
    await audit(req, "appraisal.recommendation.reviewed", record.id);
    res.json({ data: record });
  });
  return router;
}
