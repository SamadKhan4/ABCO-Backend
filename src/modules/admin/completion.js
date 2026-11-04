import { Router } from "express";
import { z } from "zod";
import { Employee, Organization } from "../../models.js";
import { CompanySettings, Ticket } from "../operations/models.js";
import { Exit } from "../hr/models.js";
import { id, longText, fail, permit, audit } from "../../shared/workflow.js";
import { can } from "../../security.js";
import multer from "multer";

export async function validateOrganization(input, kind, current) {
  if (input.head) {
    const employee = await Employee.findOne({
      _id: input.head,
      status: { $ne: "Archived" },
    });
    if (kind !== "departments" || !employee)
      fail(422, "Choose an active employee for a department head");
  }
  if (input.parent) {
    if (!["departments", "branches"].includes(kind))
      fail(422, "Only departments and branches support parent records");
    let next = input.parent,
      seen = new Set();
    while (next) {
      if (String(next) === String(current) || seen.has(String(next)))
        fail(422, "Organization hierarchy cannot contain a cycle");
      seen.add(String(next));
      const parent = await Organization.findOne({
        _id: next,
        kind,
        active: true,
      });
      if (!parent)
        fail(422, "Choose an active parent in the same organization category");
      next = parent.parent;
    }
  }
}
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 256 * 1024, files: 1 },
}).single("file");
export function completionRoutes() {
  const router = Router();
  router.get(
    "/organization/:kind/:id/employees",
    permit("organization.manage"),
    async (req, res) => {
      const record = await Organization.findOne({
        _id: id.parse(req.params.id),
        kind: req.params.kind,
      });
      if (!record) fail(404, "Organization record not found");
      const field = {
          departments: "departmentId",
          branches: "branchId",
          designations: "designationId",
        }[record.kind],
        nameField = {
          departments: "department",
          branches: "branch",
          designations: "designation",
        }[record.kind];
      if (!field)
        fail(422, "Employee list requires a department, branch or designation");
      res.json({
        data: await Employee.find({
          $or: [{ [field]: record._id }, { [nameField]: record.name }],
        })
          .select("firstName lastName code department designation status")
          .limit(1000)
          .lean(),
      });
    },
  );
  router.get("/company-brand", async (_req, res) => {
    const company = await CompanySettings.findById("company").select(
      "name logo financialYearStartMonth",
    );
    res.json({ data: company || { name: "ABCO Computers" } });
  });
  router.post(
    "/company-logo",
    permit("settings.manage"),
    upload,
    async (req, res) => {
      const bytes = req.file?.buffer;
      if (
        !bytes ||
        !bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      )
        fail(422, "Choose a PNG logo up to 256 KB");
      if (
        bytes.length < 24 ||
        bytes.readUInt32BE(16) > 4096 ||
        bytes.readUInt32BE(20) > 4096
      )
        fail(422, "PNG dimensions must be at most 4096 by 4096");
      const logo = "data:image/png;base64," + bytes.toString("base64");
      await CompanySettings.findByIdAndUpdate(
        "company",
        { $set: { logo } },
        { upsert: true },
      );
      await audit(req, "company.logo.updated", "company");
      res.json({ data: { logo } });
    },
  );
  router.post("/helpdesk/:id/escalate", async (req, res) => {
    const reason = longText.parse(req.body.reason);
    const record = await Ticket.findById(req.params.id);
    if (!record) fail(404, "Ticket not found");
    if (
      !can(req.user, "helpdesk.manage") &&
      String(record.employee) !== String(req.user.employee)
    )
      fail(403, "Ticket access denied");
    if (["Resolved", "Closed"].includes(record.status))
      fail(409, "Resolved tickets must be reopened before escalation");
    record.priority = "Urgent";
    record.escalations.push({ actor: req.user._id, reason, at: new Date() });
    await record.save();
    await audit(req, "helpdesk.escalated", record.id);
    res.json({ data: record });
  });
  router.post(
    "/exits/:id/interview",
    permit("exit.manage"),
    async (req, res) => {
      const input = z
        .object({
          summary: longText,
          improvements: longText,
          wouldRehire: z.boolean(),
        })
        .parse(req.body);
      const record = await Exit.findById(req.params.id);
      if (!record) fail(404, "Exit not found");
      if (["Completed", "Rejected"].includes(record.status))
        fail(409, "Closed exits retain their final interview");
      if (String(record.employee) === String(req.user.employee))
        fail(403, "A different HR reviewer must record your exit interview");
      record.interview = { ...input, actor: req.user._id, at: new Date() };
      await record.save();
      await audit(req, "exit.interview.recorded", record.id);
      res.json({ data: record });
    },
  );
  return router;
}
