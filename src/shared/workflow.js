import mongoose from "mongoose";
import { z } from "zod";
import { Employee, Audit } from "../models.js";
import { can } from "../security.js";

export const id = z.string().regex(/^[a-f\d]{24}$/i, "Select a valid record");
export const text = z.string().trim().min(1).max(500);
export const longText = z.string().trim().min(3).max(5000);
export const date = z.iso.date();
export function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}
export function permit(permission) {
  return (req, _res, next) => {
    if (!can(req.user, permission))
      fail(403, "Permission required: " + permission);
    next();
  };
}
export function ownEmployee(req) {
  if (req.user.role?.name === "Super Admin")
    fail(
      403,
      "Super Admin is a system owner and cannot submit employee requests",
    );
  if (!req.user.employee) fail(409, "Link an employee profile first");
  return String(req.user.employee);
}
export async function activeEmployee(employee, session) {
  const record = await Employee.findOne({
    _id: employee,
    status: { $ne: "Archived" },
  }).session(session || null);
  if (!record) fail(422, "Select an active employee");
  return record;
}
export async function transaction(callback) {
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(() => callback(session));
  } finally {
    await session.endSession();
  }
}
export async function audit(req, action, resource, session) {
  await Audit.create(
    [
      {
        actor: req.user._id,
        action,
        resource: String(resource),
        requestId: req.id,
      },
    ],
    { session, ordered: true },
  );
}
export function pagination(req) {
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(100000)
    .default(1)
    .parse(req.query.page);
  const limit = z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .parse(req.query.limit);
  return { page, limit, skip: (page - 1) * limit };
}
export async function list(Model, filter, req, { populate, select } = {}) {
  const { page, limit, skip } = pagination(req);
  let query = Model.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
  if (populate) query = query.populate(populate);
  if (select) query = query.select(select);
  const [data, total] = await Promise.all([
    query.lean(),
    Model.countDocuments(filter),
  ]);
  return {
    data,
    meta: { page, limit, total, pages: Math.ceil(total / limit) },
  };
}
export function transition(record, next, transitions) {
  if (record.status === next) return false;
  if (!transitions[record.status]?.includes(next))
    fail(409, `Cannot change ${record.status} to ${next}`);
  record.status = next;
  return true;
}
