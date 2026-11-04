import { Router } from "express";
import { z } from "zod";
import { Training, TrainingEnrollment, Skill } from "./models.js";
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
  activeEmployee,
  audit,
  list,
} from "../../shared/workflow.js";
import { notifyEmployee } from "../operations/routes.js";
export function trainingRoutes() {
  const router = Router();
  router.get("/training", async (req, res) => {
    const assignments = can(req.user, "training.manage")
      ? null
      : await TrainingEnrollment.find({
          employee: req.user.employee || null,
        }).select("training");
    res.json(
      await list(
        Training,
        assignments ? { _id: { $in: assignments.map((a) => a.training) } } : {},
        req,
      ),
    );
  });
  router.post("/training", permit("training.manage"), async (req, res) => {
    const data = z
      .object({
        title: text,
        course: text,
        description: longText,
        skills: z.array(text).min(1).max(30),
        trainer: text,
        startDate: date,
        endDate: date,
      })
      .refine((v) => v.endDate >= v.startDate, "Training end must follow start")
      .parse(req.body);
    const record = await Training.create(data);
    await audit(req, "training.created", record.id);
    res.status(201).json({ data: record });
  });
  router.post(
    "/training/:id/status",
    permit("training.manage"),
    async (req, res) => {
      const status = z
        .enum(["Planned", "Active", "Completed", "Cancelled"])
        .parse(req.body.status);
      const record = await Training.findById(req.params.id);
      if (!record) fail(404, "Training not found");
      if (["Completed", "Cancelled"].includes(record.status))
        fail(409, "Training is already closed");
      record.status = status;
      await record.save();
      await audit(req, "training.status.updated", record.id);
      res.json({ data: record });
    },
  );
  router.post(
    "/training/:id/assign",
    permit("training.manage"),
    async (req, res) => {
      const employee = id.parse(req.body.employee);
      await activeEmployee(employee);
      const training = await Training.findOne({
        _id: req.params.id,
        status: { $in: ["Planned", "Active"] },
      });
      if (!training) fail(409, "Training is unavailable");
      const record = await TrainingEnrollment.create({
        employee,
        training: training._id,
      });
      await notifyEmployee(
        employee,
        "Training assigned",
        training.title,
        "/training-enrollments",
      );
      await audit(req, "training.assigned", record.id);
      res.status(201).json({ data: record });
    },
  );
  router.get("/training-enrollments", async (req, res) =>
    res.json(
      await list(
        TrainingEnrollment,
        can(req.user, "training.manage")
          ? {}
          : { employee: req.user.employee || null },
        req,
        {
          populate: [
            { path: "employee", select: "firstName lastName code" },
            {
              path: "training",
              select: "title course startDate endDate skills",
            },
          ],
        },
      ),
    ),
  );
  router.post("/training-enrollments/:id/progress", async (req, res) => {
    const data = z
      .object({
        progress: z.number().int().min(0).max(99),
        feedback: z.string().max(3000).default(""),
      })
      .parse(req.body);
    const record = await TrainingEnrollment.findOne({
      _id: req.params.id,
      employee: ownEmployee(req),
    });
    if (!record) fail(404, "Enrollment not found");
    if (record.status === "Completed")
      fail(409, "Completed training is locked");
    if (data.progress < record.progress)
      fail(422, "Progress cannot move backwards");
    record.progress = data.progress;
    record.feedback = data.feedback;
    record.status = "In Progress";
    await record.save();
    res.json({ data: record });
  });
  router.post("/training-enrollments/:id/attendance", async (req, res) => {
    const record = await TrainingEnrollment.findOne({
      _id: req.params.id,
      employee: ownEmployee(req),
    }).populate("training");
    if (!record) fail(404, "Enrollment not found");
    const today = workDate();
    if (
      record.training.status !== "Active" ||
      today < record.training.startDate ||
      today > record.training.endDate
    )
      fail(409, "Attendance is available only during an active program");
    record.attendance.addToSet(today);
    await record.save();
    res.json({ data: record });
  });
  router.post(
    "/training-enrollments/:id/complete",
    permit("training.manage"),
    async (req, res) => {
      const data = z
        .object({
          assessmentScore: z.number().min(0).max(100),
          certificate: id.optional(),
        })
        .parse(req.body);
      const record = await TrainingEnrollment.findById(req.params.id);
      if (!record) fail(404, "Enrollment not found");
      if (String(record.employee) === String(req.user.employee))
        fail(403, "Another reviewer must certify your training");
      if (
        data.certificate &&
        !(await Document.exists({
          _id: data.certificate,
          employee: record.employee,
          status: "Verified",
        }))
      )
        fail(422, "Choose a verified certificate owned by this employee");
      record.progress = 100;
      record.status = "Completed";
      record.assessmentScore = data.assessmentScore;
      record.certificate = data.certificate;
      record.completedBy = req.user._id;
      await record.save();
      await audit(req, "training.completed", record.id);
      res.json({ data: record });
    },
  );
  router.get("/skills", async (req, res) =>
    res.json(
      await list(
        Skill,
        can(req.user, "training.manage")
          ? {}
          : { employee: req.user.employee || null },
        req,
        { populate: { path: "employee", select: "firstName lastName code" } },
      ),
    ),
  );
  router.post("/skills", permit("training.manage"), async (req, res) => {
    const data = z
      .object({
        employee: id,
        name: text,
        level: z.number().int().min(0).max(5),
        targetLevel: z.number().int().min(0).max(5),
      })
      .parse(req.body);
    await activeEmployee(data.employee);
    const record = await Skill.findOneAndUpdate(
      { employee: data.employee, name: data.name },
      { $set: data },
      { new: true, upsert: true, runValidators: true },
    );
    await audit(req, "skill.assessed", record.id);
    res.status(201).json({ data: record });
  });
  return router;
}
