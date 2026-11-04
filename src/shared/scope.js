import { AsyncLocalStorage } from "node:async_hooks";
import mongoose from "mongoose";
const requestScope = new AsyncLocalStorage();
export function systemScope(callback) {
  return requestScope.run(undefined, async () => await callback());
}
export const scopedPermissions = [
  "shifts.approve",
  "employee.read",
  "attendance.read",
  "attendance.regularize",
  "leave.read",
  "leave.approve",
  "tasks.manage",
  "reports.review",
  "performance.manage",
];
export function scopedModel(name, schema) {
  const field =
    name === "Employee" ? "_id" : schema.path("employee") ? "employee" : null;
  if (field) {
    schema.pre(
      [
        "find",
        "findOne",
        "countDocuments",
        "updateOne",
        "updateMany",
        "findOneAndUpdate",
        "deleteOne",
        "deleteMany",
      ],
      function () {
        const scope = requestScope.getStore();
        if (!scope) return;
        const filter = this.getFilter(),
          value = filter[field],
          scalar =
            typeof value === "string" ||
            value instanceof mongoose.Types.ObjectId;
        if (scalar && scope.ids.some((id) => String(id) === String(value)))
          return;
        if (this.getOptions().upsert) {
          const error = new Error(
            "A scoped upsert must identify an authorized employee explicitly",
          );
          error.status = 403;
          throw error;
        }
        this.setQuery({
          ...filter,
          $and: [...(filter.$and || []), { [field]: { $in: scope.ids } }],
        });
      },
    );
    schema.pre("aggregate", function () {
      const scope = requestScope.getStore();
      if (scope)
        this.pipeline().unshift({ $match: { [field]: { $in: scope.ids } } });
    });
  }
  return mongoose.model(name, schema);
}
export async function scopedRequest(req, _res, next) {
  const scope = req.user.role?.scope || "Company";
  if (scope === "Company") return next();
  const Employee = mongoose.model("Employee");
  const own = await Employee.findById(req.user.employee).select(
    "department branch",
  );
  let filter = { _id: req.user.employee || null };
  if (own && scope === "Department") filter = { department: own.department };
  if (own && scope === "Branch") filter = { branch: own.branch };
  if (own && scope === "Direct reports")
    filter = { $or: [{ manager: own._id }, { _id: own._id }] };
  const people = await Employee.find(filter).select("_id");
  requestScope.run({ ids: people.map((person) => person._id) }, next);
}
