import { scopedModel } from "../../shared/scope.js";
import { Router } from "express";
import mongoose from "mongoose";
import multer from "multer";
import { z } from "zod";
import {
  randomBytes,
  randomUUID,
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { can } from "../../security.js";
import { Task, Ticket } from "../operations/models.js";
import { Candidate } from "../hr/models.js";
import { Expense } from "../extended/models.js";
import {
  fail,
  ownEmployee,
  activeEmployee,
  audit,
  list,
} from "../../shared/workflow.js";

const versionSchema = new mongoose.Schema(
  {
    key: String,
    mime: String,
    size: Number,
    checksum: String,
    at: Date,
    actor: mongoose.Schema.Types.ObjectId,
  },
  { _id: true },
);
export const Document = scopedModel(
  "Document",
  new mongoose.Schema(
    {
      employee: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
      candidate: { type: mongoose.Schema.Types.ObjectId, ref: "Candidate" },
      task: { type: mongoose.Schema.Types.ObjectId, ref: "Task" },
      ticket: { type: mongoose.Schema.Types.ObjectId, ref: "Ticket" },
      name: String,
      category: String,
      visibility: { type: String, enum: ["Employee", "HR Only"] },
      expiresAt: String,
      status: {
        type: String,
        enum: ["Pending", "Verified", "Rejected"],
        default: "Pending",
      },
      verificationNote: String,
      versions: [versionSchema],
    },
    { timestamps: true, strict: "throw", optimisticConcurrency: true },
  ),
);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 8 },
}).single("file");
function key() {
  if (!/^[a-f\d]{64}$/i.test(process.env.DOCUMENT_KEY || ""))
    fail(503, "Private document storage encryption key is not configured");
  return Buffer.from(process.env.DOCUMENT_KEY, "hex");
}
function root() {
  return path.resolve(process.env.DOCUMENT_STORAGE_PATH || "storage/documents");
}
function mime(buffer) {
  if (buffer.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  if (
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255)
    return "image/jpeg";
  fail(
    422,
    "Only PDF, PNG and JPEG files with valid file signatures are accepted",
  );
}
async function save(file, actor) {
  if (!file) fail(422, "Choose a file");
  const encryptionKey = key(),
    type = mime(file.buffer),
    iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(file.buffer), cipher.final()]);
  const storageKey = randomUUID();
  await mkdir(root(), { recursive: true });
  await writeFile(
    path.join(root(), storageKey),
    Buffer.concat([iv, cipher.getAuthTag(), encrypted]),
    { flag: "wx", mode: 0o600 },
  );
  return {
    key: storageKey,
    mime: type,
    size: file.size,
    checksum: createHash("sha256").update(file.buffer).digest("hex"),
    at: new Date(),
    actor,
  };
}
const manager = (req) => can(req.user, "documents.manage");
async function access(req, record) {
  if (!record) fail(404, "Document not found");
  if (
    record.visibility === "Employee" &&
    (can(req.user, "expenses.approve") || can(req.user, "expenses.pay")) &&
    (await Expense.exists({ receipt: record._id, status: { $ne: "Draft" } }))
  )
    return;
  if (record.candidate && can(req.user, "recruitment.manage")) return;
  if (
    record.visibility === "Employee" &&
    record.task &&
    can(req.user, "tasks.manage") &&
    (await Task.exists({ _id: record.task }))
  )
    return;
  if (
    record.visibility === "Employee" &&
    record.ticket &&
    can(req.user, "helpdesk.manage") &&
    (await Ticket.exists({
      _id: record.ticket,
      $or: [
        { assignedTo: req.user._id },
        { assignedTo: null },
        { employee: req.user.employee || null },
      ],
    }))
  )
    return;
  if (
    !manager(req) &&
    (String(record.employee) !== String(req.user.employee) ||
      record.visibility === "HR Only")
  )
    fail(403, "Document access denied");
}
const metadata = z.object({
  name: z.string().trim().min(1).max(150),
  category: z.enum([
    "Identity Documents",
    "Employment Letters",
    "Educational Certificates",
    "Experience Certificates",
    "HR Policies",
    "Other Records",
  ]),
  visibility: z.enum(["Employee", "HR Only"]).default("Employee"),
  expiresAt: z.union([z.iso.date(), z.literal("")]).default(""),
});
export async function storeDocument(req, metadata, file) {
  const version = await save(file, req.user._id);
  try {
    const record = await Document.create({ ...metadata, versions: [version] });
    await audit(req, "document.created", record.id);
    return record;
  } catch (error) {
    await unlink(path.join(root(), version.key));
    throw error;
  }
}
export async function grantDocumentLink(req, record) {
  await access(req, record);
  const version = record.versions.at(-1);
  if (!version) fail(404, "Document version not found");
  const expires = Date.now() + 5 * 60000,
    signature = createHmac("sha256", key())
      .update(
        `${record.id}:${version.id}:${req.user.id}:${req.sessionID}:${expires}`,
      )
      .digest("hex");
  await audit(req, "document.access.granted", record.id);
  return {
    url: `/api/v1/documents/${record.id}/download?version=${version.id}&expires=${expires}&signature=${signature}`,
  };
}
export function documentRoutes() {
  const router = Router();
  for (const context of ["tasks", "helpdesk"]) {
    const Model = context === "tasks" ? Task : Ticket,
      field = context === "tasks" ? "task" : "ticket",
      permission = context === "tasks" ? "tasks.manage" : "helpdesk.manage";
    async function parent(req) {
      const record = await Model.findById(req.params.id);
      if (!record) fail(404, "Parent record not found");
      const own = String(record.employee) === String(req.user.employee);
      if (!own && !can(req.user, permission))
        fail(403, "Attachment access denied");
      if (
        context === "helpdesk" &&
        !own &&
        record.assignedTo &&
        String(record.assignedTo) !== req.user.id
      )
        fail(403, "Ticket belongs to another support agent");
      return record;
    }
    router.get(`/${context}/:id/attachments`, async (req, res) => {
      await parent(req);
      res.json({
        data: await Document.find({ [field]: req.params.id })
          .select("-versions.key")
          .lean(),
      });
    });
    router.post(`/${context}/:id/attachments`, upload, async (req, res) => {
      const record = await parent(req);
      const name = z.string().trim().min(1).max(150).parse(req.body.name);
      const document = await storeDocument(
        req,
        {
          employee: record.employee,
          [field]: record._id,
          name,
          category:
            context === "tasks" ? "Task Attachments" : "Ticket Attachments",
          visibility: "Employee",
        },
        req.file,
      );
      res.status(201).json({ data: { id: document.id, name: document.name } });
    });
  }
  router.post(
    "/recruitment/candidates/:id/resume",
    upload,
    async (req, res) => {
      if (!can(req.user, "recruitment.manage"))
        fail(403, "Recruitment permission required");
      const candidate = await Candidate.findById(req.params.id);
      if (!candidate) fail(404, "Candidate not found");
      if (!req.file) fail(422, "Choose a resume file");
      let document = candidate.resume
        ? await Document.findById(candidate.resume)
        : null;
      if (document) {
        document.versions.push(await save(req.file, req.user._id));
        await document.save();
      } else {
        document = await storeDocument(
          req,
          {
            candidate: candidate._id,
            name: `Resume · ${candidate.name}`,
            category: "Candidate Resume",
            visibility: "HR Only",
          },
          req.file,
        );
        candidate.resume = document._id;
        await candidate.save();
      }
      await audit(req, "candidate.resume.uploaded", candidate.id);
      res.status(201).json({ data: { id: document.id } });
    },
  );
  router.post("/recruitment/candidates/:id/resume/access", async (req, res) => {
    if (!can(req.user, "recruitment.manage"))
      fail(403, "Recruitment permission required");
    const candidate = await Candidate.findById(req.params.id);
    if (!candidate?.resume) fail(404, "Resume not found");
    res.json({
      data: await grantDocumentLink(
        req,
        await Document.findById(candidate.resume),
      ),
    });
  });
  router.get("/documents", async (req, res) =>
    res.json(
      await list(
        Document,
        manager(req)
          ? {}
          : { employee: req.user.employee || null, visibility: "Employee" },
        req,
        {
          populate: { path: "employee", select: "firstName lastName code" },
          select: "-versions.key",
        },
      ),
    ),
  );
  router.post("/documents", upload, async (req, res) => {
    const input = metadata.parse(req.body);
    const employee = manager(req)
      ? z
          .string()
          .regex(/^[a-f\d]{24}$/i)
          .parse(req.body.employee)
      : ownEmployee(req);
    await activeEmployee(employee);
    if (!manager(req) && input.visibility === "HR Only")
      fail(403, "Employees can upload only their own visible documents");
    const version = await save(req.file, req.user._id);
    let record;
    try {
      record = await Document.create({
        ...input,
        employee,
        versions: [version],
      });
    } catch (error) {
      await unlink(path.join(root(), version.key));
      throw error;
    }
    await audit(req, "document.uploaded", record.id);
    const output = record.toObject();
    output.versions.forEach((v) => delete v.key);
    res.status(201).json({ data: output });
  });
  router.post("/documents/:id/versions", upload, async (req, res) => {
    const record = await Document.findById(req.params.id);
    await access(req, record);
    const version = await save(req.file, req.user._id);
    record.versions.push(version);
    record.status = "Pending";
    try {
      await record.save();
    } catch (error) {
      await unlink(path.join(root(), version.key));
      throw error;
    }
    await audit(req, "document.version.uploaded", record.id);
    res.status(201).json({ data: true });
  });
  router.post("/documents/:id/verify", async (req, res) => {
    if (!manager(req)) fail(403, "Document verification permission required");
    const input = z
      .object({
        status: z.enum(["Verified", "Rejected"]),
        note: z.string().trim().min(3).max(1000),
      })
      .parse(req.body);
    const record = await Document.findById(req.params.id);
    if (!record) fail(404, "Document not found");
    if (String(record.employee) === String(req.user.employee))
      fail(403, "Another authorized reviewer must verify your document");
    record.status = input.status;
    record.verificationNote = input.note;
    await record.save();
    await audit(req, "document." + input.status.toLowerCase(), record.id);
    res.json({ data: true });
  });
  router.post("/documents/:id/access", async (req, res) => {
    const record = await Document.findById(req.params.id);
    await access(req, record);
    const version = req.body?.version
      ? record.versions.id(req.body.version)
      : record.versions.at(-1);
    if (!version) fail(404, "Document version not found");
    const expires = Date.now() + 5 * 60000,
      payload = `${record.id}:${version.id}:${req.user.id}:${req.sessionID}:${expires}`;
    const signature = createHmac("sha256", key()).update(payload).digest("hex");
    await audit(req, "document.access.granted", record.id);
    res.json({
      data: {
        url: `/api/v1/documents/${record.id}/download?version=${version.id}&expires=${expires}&signature=${signature}`,
      },
    });
  });
  router.get("/documents/:id/download", async (req, res) => {
    const record = await Document.findById(req.params.id);
    await access(req, record);
    const expires = z.coerce.number().int().parse(req.query.expires),
      signature = z
        .string()
        .regex(/^[a-f\d]{64}$/)
        .parse(req.query.signature),
      version = record.versions.id(req.query.version);
    if (!version || expires < Date.now() || expires > Date.now() + 5 * 60000)
      fail(403, "Download link expired");
    const expected = createHmac("sha256", key())
      .update(
        `${record.id}:${version.id}:${req.user.id}:${req.sessionID}:${expires}`,
      )
      .digest("hex");
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature)))
      fail(403, "Invalid download signature");
    if (!/^[a-f\d-]{36}$/i.test(version.key))
      fail(500, "Invalid storage reference");
    const data = await readFile(path.join(root(), version.key));
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key(),
      data.subarray(0, 12),
    );
    decipher.setAuthTag(data.subarray(12, 28));
    const plain = Buffer.concat([
      decipher.update(data.subarray(28)),
      decipher.final(),
    ]);
    await audit(req, "document.downloaded", record.id);
    const extension = {
      "application/pdf": "pdf",
      "image/png": "png",
      "image/jpeg": "jpg",
    }[version.mime];
    res
      .set({
        "Content-Type": version.mime,
        "Content-Disposition": `attachment; filename="document-${record.id}.${extension}"`,
        "Cache-Control": "no-store",
        "Content-Security-Policy": "sandbox; default-src 'none'",
      })
      .send(plain);
  });
  return router;
}
