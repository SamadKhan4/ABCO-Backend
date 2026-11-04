import { Router } from "express";
import { z } from "zod";
import { Survey, SurveyResponse, Recognition, Suggestion } from "./models.js";
import { Employee } from "../../models.js";
import { can } from "../../security.js";
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
} from "../../shared/workflow.js";
import { notifyEmployee } from "../operations/routes.js";
export function engagementRoutes() {
  const router = Router();
  router.get("/surveys", async (req, res) => {
    const employee = await Employee.findById(req.user.employee);
    const filter = can(req.user, "engagement.manage")
      ? {}
      : {
          status: "Published",
          opensAt: { $lte: new Date() },
          closesAt: { $gte: new Date() },
          $or: [
            { department: "" },
            { department: employee?.department || "__none__" },
          ],
        };
    res.json(await list(Survey, filter, req));
  });
  router.post("/surveys", permit("engagement.manage"), async (req, res) => {
    const input = z
      .object({
        title: text,
        description: longText,
        department: z.string().max(100).default(""),
        anonymous: z.boolean(),
        opensAt: z.iso.datetime(),
        closesAt: z.iso.datetime(),
        questions: z
          .array(z.object({ title: text, type: z.enum(["Rating", "Text"]) }))
          .min(1)
          .max(30),
      })
      .refine((v) => v.closesAt > v.opensAt, "Survey close must follow opening")
      .parse(req.body);
    const record = await Survey.create({ ...input, createdBy: req.user._id });
    await audit(req, "survey.created", record.id);
    res.status(201).json({ data: record });
  });
  router.post(
    "/surveys/:id/status",
    permit("engagement.manage"),
    async (req, res) => {
      const status = z.enum(["Published", "Closed"]).parse(req.body.status);
      const record = await Survey.findById(req.params.id);
      if (!record) fail(404, "Survey not found");
      if (record.status === "Closed")
        fail(409, "Closed surveys cannot be reopened");
      record.status = status;
      await record.save();
      await audit(req, "survey.status.updated", record.id);
      res.json({ data: record });
    },
  );
  router.post("/surveys/:id/respond", async (req, res) => {
    const employee = await activeEmployee(ownEmployee(req));
    const survey = await Survey.findOne({
      _id: req.params.id,
      status: "Published",
      opensAt: { $lte: new Date() },
      closesAt: { $gte: new Date() },
      $or: [{ department: "" }, { department: employee.department }],
    });
    if (!survey) fail(404, "Survey is not available");
    const answers = z
      .array(
        z.object({
          question: z.number().int().min(0),
          rating: z.number().int().min(1).max(5).optional(),
          text: z.string().max(3000).optional(),
        }),
      )
      .parse(req.body.answers);
    if (
      answers.length !== survey.questions.length ||
      new Set(answers.map((a) => a.question)).size !== answers.length
    )
      fail(422, "Answer every question once");
    for (const answer of answers) {
      const question = survey.questions[answer.question];
      if (
        !question ||
        (question.type === "Rating" && answer.rating == null) ||
        (question.type === "Text" && !answer.text?.trim())
      )
        fail(422, "Complete each question using the requested format");
    }
    await SurveyResponse.create({
      survey: survey._id,
      employee: employee._id,
      answers,
    });
    await audit(req, "survey.responded", survey.id);
    res.status(201).json({ data: true });
  });
  router.get(
    "/surveys/:id/results",
    permit("engagement.manage"),
    async (req, res) => {
      const survey = await Survey.findById(req.params.id);
      if (!survey) fail(404, "Survey not found");
      const responses = await SurveyResponse.find({ survey: survey._id })
        .select(
          survey.anonymous ? "answers createdAt" : "answers employee createdAt",
        )
        .lean();
      res.json({
        data: {
          survey,
          count: responses.length,
          responses: responses.map(({ _id, ...response }) => response),
          ratings: survey.questions.map((question, index) => ({
            question: question.title,
            average:
              question.type === "Rating" && responses.length
                ? responses.reduce(
                    (sum, response) =>
                      sum +
                      (response.answers.find(
                        (answer) => answer.question === index,
                      )?.rating || 0),
                    0,
                  ) / responses.length
                : null,
          })),
        },
      });
    },
  );
  router.get("/recognitions", async (req, res) =>
    res.json(
      await list(Recognition, {}, req, {
        populate: [
          { path: "employee", select: "firstName lastName" },
          { path: "from", select: "name" },
        ],
      }),
    ),
  );
  router.post(
    "/recognitions",
    permit("engagement.manage"),
    async (req, res) => {
      const data = z
        .object({
          employee: id,
          title: text,
          message: longText,
          reward: z.string().max(500).default(""),
        })
        .parse(req.body);
      await activeEmployee(data.employee);
      const record = await Recognition.create({ ...data, from: req.user._id });
      await notifyEmployee(
        data.employee,
        "You’ve been recognized",
        data.title,
        "/recognitions",
      );
      await audit(req, "recognition.created", record.id);
      res.status(201).json({ data: record });
    },
  );
  router.get("/suggestions", async (req, res) =>
    res.json(
      await list(
        Suggestion,
        can(req.user, "engagement.manage")
          ? {}
          : { employee: req.user.employee || null },
        req,
        { populate: { path: "employee", select: "firstName lastName" } },
      ),
    ),
  );
  router.post("/suggestions", async (req, res) => {
    const input = z
      .object({ title: text, body: longText, category: text })
      .parse(req.body);
    const record = await Suggestion.create({
      ...input,
      employee: ownEmployee(req),
    });
    res.status(201).json({ data: record });
  });
  router.post(
    "/suggestions/:id/review",
    permit("engagement.manage"),
    async (req, res) => {
      const input = z
        .object({
          status: z.enum(["Reviewed", "Accepted", "Declined"]),
          note: longText,
        })
        .parse(req.body);
      const record = await Suggestion.findById(req.params.id);
      if (!record) fail(404, "Suggestion not found");
      if (String(record.employee) === String(req.user.employee))
        fail(403, "Another reviewer must review your suggestion");
      if (["Accepted", "Declined"].includes(record.status))
        fail(409, "Suggestion is already decided");
      record.status = input.status;
      record.reviewNote = input.note;
      record.reviewer = req.user._id;
      await record.save();
      await audit(req, "suggestion.reviewed", record.id);
      res.json({ data: record });
    },
  );
  return router;
}
