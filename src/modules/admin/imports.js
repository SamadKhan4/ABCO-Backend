import { Router } from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { randomBytes, randomUUID } from "node:crypto";
import { Employee, Audit, User } from "../../models.js";
import { employeeInput } from "../../shared/employee-input.js";
import {
  fail,
  permit,
  audit,
  transaction,
  list,
} from "../../shared/workflow.js";
import { can } from "../../security.js";
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: 1024 * 1024 },
}).single("file");
export function employeeImports() {
  const router = Router();
  router.get(
    "/employees/import-template",
    permit("employee.create"),
    (_req, res) =>
      res
        .set({
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition":
            'attachment; filename="ABCO-employee-import-template.csv"',
        })
        .send(
          "firstName,lastName,email,department,designation,branch,joiningDate,employmentType,phone,status\r\n",
        ),
  );
  router.post(
    "/employees/import",
    permit("employee.create"),
    upload,
    async (req, res) => {
      if (!req.file) fail(422, "Choose a UTF-8 CSV file");
      let rows;
      try {
        rows = parse(req.file.buffer, {
          columns: true,
          bom: true,
          skip_empty_lines: true,
          trim: true,
          max_record_size: 10000,
        });
      } catch {
        fail(422, "Invalid CSV. Use the provided template and UTF-8 encoding.");
      }
      if (!rows.length || rows.length > 1000)
        fail(422, "Import between 1 and 1000 employees per file");
      const errors = [],
        validated = [],
        emails = new Set();
      for (const [rowNumber, row] of rows.entries()) {
        const result = employeeInput.safeParse(
          Object.fromEntries(
            Object.entries(row).filter(([, value]) => value !== ""),
          ),
        );
        if (!result.success) {
          errors.push({
            row: rowNumber + 2,
            issues: result.error.issues.map(
              (issue) => `${issue.path.join(".")}: ${issue.message}`,
            ),
          });
          continue;
        }
        if (emails.has(result.data.email))
          errors.push({
            row: rowNumber + 2,
            issues: ["Duplicate email in the file"],
          });
        emails.add(result.data.email);
        validated.push(result.data);
      }
      const existing = await Employee.find({
        email: { $in: [...emails] },
      }).select("email");
      for (const record of existing)
        errors.push({
          email: record.email,
          issues: ["Email already belongs to an employee"],
        });
      if (errors.length)
        return res.status(422).json({
          error: {
            message: "Import validation failed. No records were written.",
            details: errors,
          },
        });
      if (req.query.preview === "true")
        return res.json({ data: { valid: true, rows: validated.length } });
      const batch = randomUUID();
      await transaction(async (session) => {
        await Employee.insertMany(
          validated.map((record) => ({
            ...record,
            code: "ABC-" + randomBytes(4).toString("hex").toUpperCase(),
          })),
          { session, ordered: true },
        );
        await audit(req, "employee.bulk-imported", batch, session);
      });
      res.status(201).json({ data: { imported: validated.length, batch } });
    },
  );
  router.get(
    "/employees/:id/history",
    permit("employee.read"),
    async (req, res) => {
      const employee = await Employee.findById(req.params.id);
      if (!employee) fail(404, "Employee not found");
      res.json(
        await list(
          Audit,
          { resource: employee.id, action: { $regex: "^employee\\." } },
          req,
          { populate: { path: "actor", select: "name" } },
        ),
      );
    },
  );
  router.post("/users/:id/status", permit("roles.manage"), async (req, res) => {
    const { recentAuthentication } = await import("./routes.js");
    recentAuthentication(req);
    if (typeof req.body.active !== "boolean")
      fail(422, "Choose active or inactive");
    const user = await User.findById(req.params.id).populate("role");
    if (!user) fail(404, "User not found");
    if (user.id === req.user.id || user.role?.name === "Super Admin")
      fail(
        409,
        "The current account and bootstrap administrator are protected",
      );
    if (
      req.body.active &&
      !(await Employee.exists({
        _id: user.employee,
        status: { $ne: "Archived" },
      }))
    )
      fail(
        409,
        "Restore an active employee profile before activating this account",
      );
    user.active = req.body.active;
    user.authVersion += 1;
    await user.save();
    await audit(req, "user.status.updated", user.id);
    res.json({ data: { id: user.id, active: user.active } });
  });
  return router;
}
