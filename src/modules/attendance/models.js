import { scopedModel } from "../../shared/scope.js";
import mongoose from "mongoose";
const { Schema } = mongoose;
const model = scopedModel;
const assignmentSchema = new Schema(
  {
    employee: { type: Schema.Types.ObjectId, ref: "Employee" },
    shift: { type: Schema.Types.ObjectId, ref: "Organization" },
    effectiveFrom: String,
    timezone: String,
    startTime: String,
    endTime: String,
    graceMinutes: Number,
    fullDayMinutes: Number,
    halfDayMinutes: Number,
    weeklyOffDays: [Number],
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true, strict: "throw" },
);
assignmentSchema.index({ employee: 1, effectiveFrom: 1 }, { unique: true });
export const ShiftAssignment = model("ShiftAssignment", assignmentSchema);
const correctionSchema = new Schema(
  {
    employee: { type: Schema.Types.ObjectId, ref: "Employee" },
    date: String,
    requestedIn: Date,
    requestedOut: Date,
    originalIn: Date,
    originalOut: Date,
    reason: String,
    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending",
    },
    approver: { type: Schema.Types.ObjectId, ref: "User" },
    decisionReason: String,
  },
  { timestamps: true, strict: "throw", optimisticConcurrency: true },
);
correctionSchema.index(
  { employee: 1, date: 1 },
  { unique: true, partialFilterExpression: { status: "Pending" } },
);
export const Regularization = model("Regularization", correctionSchema);
