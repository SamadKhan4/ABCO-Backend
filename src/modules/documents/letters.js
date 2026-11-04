import mongoose from "mongoose";
import { Router } from "express";
import { z } from "zod";
import PDFDocument from "pdfkit";
import { Employee } from "../../models.js";
import { Candidate, Job } from "../hr/models.js";
import { CompanySettings } from "../operations/models.js";
import { Document, storeDocument, grantDocumentLink } from "./routes.js";
import {
  id,
  text,
  longText,
  fail,
  permit,
  audit,
  list,
} from "../../shared/workflow.js";
import { can, workDate } from "../../security.js";
export const DocumentTemplate = mongoose.model(
  "DocumentTemplate",
  new mongoose.Schema(
    {
      name: String,
      kind: {
        type: String,
        enum: ["Offer", "Appointment", "Experience", "Relieving"],
      },
      body: String,
      active: { type: Boolean, default: true },
      createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true, strict: "throw" },
  ),
);
function pdfBuffer(company, title, body) {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ margin: 55, size: "A4" }),
      parts = [];
    pdf.on("data", (chunk) => parts.push(chunk));
    pdf.on("end", () => resolve(Buffer.concat(parts)));
    pdf.on("error", reject);
    pdf
      .fillColor("#0B1F3A")
      .fontSize(23)
      .text(company.name || "ABCO Computers");
    if (company.address)
      pdf.fillColor("#64748B").fontSize(9).text(company.address);
    pdf.moveDown(2).fillColor("#0B1F3A").fontSize(17).text(title);
    pdf.moveDown().fillColor("#101828").fontSize(11).text(body, { lineGap: 5 });
    pdf.end();
  });
}
export function letterRoutes() {
  const router = Router();
  router.get(
    "/document-templates",
    permit("documents.manage"),
    async (req, res) => res.json(await list(DocumentTemplate, {}, req)),
  );
  router.post(
    "/document-templates",
    permit("documents.manage"),
    async (req, res) => {
      const input = z
        .object({
          name: text,
          kind: z.enum(["Offer", "Appointment", "Experience", "Relieving"]),
          body: z.string().trim().min(20).max(20000),
        })
        .parse(req.body);
      const record = await DocumentTemplate.create({
        ...input,
        createdBy: req.user._id,
      });
      await audit(req, "document.template.created", record.id);
      res.status(201).json({ data: record });
    },
  );
  router.post(
    "/document-templates/:id/deactivate",
    permit("documents.manage"),
    async (req, res) => {
      const record = await DocumentTemplate.findByIdAndUpdate(
        req.params.id,
        { $set: { active: false } },
        { new: true },
      );
      if (!record) fail(404, "Template not found");
      await audit(req, "document.template.deactivated", record.id);
      res.json({ data: record });
    },
  );
  router.get(
    "/generated-letters",
    permit("documents.manage"),
    async (req, res) =>
      res.json(
        await list(
          Document,
          {
            category: {
              $in: [
                "Offer Letter",
                "Appointment Letter",
                "Experience Letter",
                "Relieving Letter",
              ],
            },
          },
          req,
          {
            populate: [
              { path: "employee", select: "firstName lastName code" },
              { path: "candidate", select: "name" },
            ],
            select: "-versions.key",
          },
        ),
      ),
  );
  router.post(
    "/generated-letters",
    permit("documents.manage"),
    async (req, res) => {
      const input = z
        .object({
          template: id,
          employee: id.optional(),
          candidate: id.optional(),
          custom: z
            .record(z.string().min(1).max(80), z.string().max(1000))
            .default({}),
        })
        .refine(
          (value) => Boolean(value.employee) !== Boolean(value.candidate),
          "Choose either an employee or a candidate",
        )
        .parse(req.body);
      const template = await DocumentTemplate.findOne({
        _id: input.template,
        active: true,
      });
      if (!template)
        fail(422, "Choose an active, approved company document template");
      const company = (await CompanySettings.findById("company")) || {
        name: "ABCO Computers",
        address: "",
      };
      let owner, canonical;
      if (input.employee) {
        owner = await Employee.findById(input.employee);
        if (!owner) fail(404, "Employee not found");
        if (
          ["Experience", "Relieving"].includes(template.kind) &&
          owner.status !== "Archived"
        )
          fail(409, "Complete the employee exit before issuing this letter");
        canonical = {
          employeeName: `${owner.firstName} ${owner.lastName}`.trim(),
          employeeCode: owner.code,
          department: owner.department,
          designation: owner.designation,
          joiningDate: owner.joiningDate.toISOString().slice(0, 10),
          lastWorkingDate: owner.lastWorkingDate || "",
        };
      } else {
        if (template.kind !== "Offer" || !can(req.user, "recruitment.manage"))
          fail(
            403,
            "Candidate offer generation requires recruitment access and an offer template",
          );
        owner = await Candidate.findById(input.candidate);
        if (!owner) fail(404, "Candidate not found");
        if (!["Selected", "Offered", "Accepted"].includes(owner.status))
          fail(409, "Select the candidate before generating an offer");
        const job = await Job.findById(owner.job);
        canonical = {
          candidateName: owner.name,
          candidateEmail: owner.email,
          jobTitle: job?.title || "",
          department: job?.department || "",
        };
      }
      const values = {
        ...input.custom,
        ...canonical,
        companyName: company.name,
        companyAddress: company.address || "",
        date: workDate(),
      };
      const body = template.body.replace(
        /{{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*}}/g,
        (_match, key) => {
          if (values[key] == null || values[key] === "")
            fail(422, `Template requires a configured value for ${key}`);
          return values[key];
        },
      );
      const buffer = await pdfBuffer(company, template.kind + " letter", body),
        document = await storeDocument(
          req,
          {
            ...(input.employee
              ? { employee: owner._id }
              : { candidate: owner._id }),
            name: `${template.kind} letter · ${input.employee ? canonical.employeeName : owner.name}`,
            category: template.kind + " Letter",
            visibility: input.employee ? "Employee" : "HR Only",
          },
          { buffer, size: buffer.length },
        );
      await audit(req, "document.letter.generated", document.id);
      res.status(201).json({ data: { id: document.id, name: document.name } });
    },
  );
  return router;
}
