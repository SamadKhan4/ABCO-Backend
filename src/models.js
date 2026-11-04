import { scopedModel } from "./shared/scope.js";
import mongoose from "mongoose";
const { Schema } = mongoose;
const model = scopedModel;
const options = { timestamps: true, strict: "throw" };
export const Role = model(
  "Role",
  new Schema(
    {
      name: { type: String, unique: true, required: true },
      permissions: [String],
      scope: {
        type: String,
        enum: ["Company", "Department", "Branch", "Direct reports", "Own"],
        default: "Company",
      },
    },
    options,
  ),
);
export const User = model(
  "User",
  new Schema(
    {
      email: { type: String, unique: true, required: true },
      name: String,
      passwordHash: { type: String, select: false },
      role: { type: Schema.Types.ObjectId, ref: "Role" },
      employee: { type: Schema.Types.ObjectId, ref: "Employee" },
      active: { type: Boolean, default: true },
      authVersion: { type: Number, default: 0 },
      activationHash: { type: String, select: false },
      activationExpires: Date,
      resetHash: { type: String, select: false },
      resetExpires: Date,
      failedLogins: { type: Number, default: 0 },
      lockedUntil: Date,
      notificationPreferences: {
        inApp: { type: Boolean, default: true },
        email: { type: Boolean, default: false },
      },
      mfaEnabled: { type: Boolean, default: false },
      mfaSecret: { type: String, select: false },
      mfaPending: { type: String, select: false },
      mfaPendingExpires: Date,
      mfaCounter: { type: Number, default: -1 },
      recoveryCodes: { type: [String], select: false, default: [] },
    },
    options,
  ),
);
export const Employee = model(
  "Employee",
  new Schema(
    {
      code: { type: String, unique: true },
      firstName: String,
      lastName: String,
      email: { type: String, unique: true },
      department: String,
      designation: String,
      branch: { type: String, default: "Head office" },
      joiningDate: Date,
      lastWorkingDate: String,
      status: {
        type: String,
        enum: ["Active", "Probation", "Archived"],
        default: "Active",
      },
      employmentType: { type: String, default: "Full time" },
      phone: String,
      leaveVersion: { type: Number, default: 0 },
      departmentId: { type: Schema.Types.ObjectId, ref: "Organization" },
      designationId: { type: Schema.Types.ObjectId, ref: "Organization" },
      branchId: { type: Schema.Types.ObjectId, ref: "Organization" },
      manager: { type: Schema.Types.ObjectId, ref: "Employee" },
      dateOfBirth: String,
      address: String,
      emergencyContact: { name: String, phone: String, relationship: String },
    },
    options,
  ),
);
const attendanceSchema = new Schema(
  {
    employee: { type: Schema.Types.ObjectId, ref: "Employee", required: true },
    date: { type: String, required: true },
    mode: {
      type: String,
      enum: ["Office", "Work From Home"],
      default: "Office",
    },
    punchIn: Date,
    punchOut: Date,
    status: {
      type: String,
      default: "Present",
      enum: ["Present", "On Leave", "Absent", "Cancelled Leave"],
    },
    workingMinutes: { type: Number, default: 0 },
    leaveFraction: { type: Number, default: 0 },
    timezone: { type: String, default: "Asia/Kolkata" },
    scheduledStart: Date,
    scheduledEnd: Date,
    shiftSnapshot: {
      name: Schema.Types.ObjectId,
      startTime: String,
      endTime: String,
      timezone: String,
      fullDayMinutes: Number,
      halfDayMinutes: Number,
      graceMinutes: Number,
    },
    dayType: {
      type: String,
      enum: ["Working Day", "Holiday", "Weekly Off"],
      default: "Working Day",
    },
    lateMinutes: { type: Number, default: 0 },
    earlyMinutes: { type: Number, default: 0 },
    overtimeMinutes: { type: Number, default: 0 },
    breakMinutes: { type: Number, default: 0 },
    attendanceClass: { type: String, enum: ["Present", "Half Day", "Absent"] },
    breaks: [{ start: Date, end: Date }],
    corrections: [
      {
        request: Schema.Types.ObjectId,
        originalIn: Date,
        originalOut: Date,
        newIn: Date,
        newOut: Date,
        actor: Schema.Types.ObjectId,
        at: Date,
      },
    ],
  },
  { ...options, optimisticConcurrency: true },
);
attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });
export const Attendance = model("Attendance", attendanceSchema);
export const Leave = model(
  "Leave",
  new Schema(
    {
      employee: {
        type: Schema.Types.ObjectId,
        ref: "Employee",
        required: true,
      },
      type: String,
      policy: { type: Schema.Types.ObjectId, ref: "LeavePolicy" },
      startDate: String,
      endDate: String,
      halfDay: { type: Boolean, default: false },
      halfDayPeriod: String,
      cancellationRequested: { type: Boolean, default: false },
      cancellationReason: String,
      days: Number,
      dates: [String],
      year: Number,
      paid: { type: Boolean, default: true },
      reason: String,
      status: {
        type: String,
        default: "Pending",
        enum: ["Pending", "Approved", "Rejected", "Cancelled"],
      },
      approver: Schema.Types.ObjectId,
      decidedAt: Date,
      decisionReason: String,
    },
    options,
  ),
);
export const LeavePolicy = model(
  "LeavePolicy",
  new Schema(
    {
      name: { type: String, unique: true, required: true },
      annualDays: { type: Number, required: true, min: 0 },
      accrual: { type: String, enum: ["Annual", "Monthly"], default: "Annual" },
      carryForwardLimit: { type: Number, default: 0 },
      halfDayAllowed: { type: Boolean, default: false },
      encashmentAllowed: { type: Boolean, default: false },
      minimumNoticeDays: { type: Number, default: 0 },
      probationAllowed: { type: Boolean, default: true },
      paid: { type: Boolean, default: true },
      excludeWeekends: { type: Boolean, default: true },
      weekendDays: { type: [Number], default: [0, 6] },
      active: { type: Boolean, default: true },
    },
    options,
  ),
);
const balanceSchema = new Schema(
  {
    employee: { type: Schema.Types.ObjectId, required: true },
    policy: { type: Schema.Types.ObjectId, required: true },
    year: { type: Number, required: true },
    opening: { type: Number, required: true },
    annualSnapshot: Number,
    accrualSnapshot: String,
    accruedPosted: Number,
    carriedForward: { type: Number, default: 0 },
    used: { type: Number, default: 0 },
    reserved: { type: Number, default: 0 },
  },
  options,
);
balanceSchema.index({ employee: 1, policy: 1, year: 1 }, { unique: true });
export const LeaveBalance = model("LeaveBalance", balanceSchema);
const ledgerSchema = new Schema(
  {
    employee: Schema.Types.ObjectId,
    request: Schema.Types.ObjectId,
    action: { type: String, enum: ["Reserve", "Approve", "Release"] },
    days: Number,
  },
  { timestamps: true },
);
ledgerSchema.index({ request: 1, action: 1 }, { unique: true });
export const LeaveLedger = model("LeaveLedger", ledgerSchema);
export const SetupToken = model(
  "SetupToken",
  new Schema(
    {
      _id: { type: String, default: "initial-admin" },
      digest: { type: String, required: true, select: false },
      expiresAt: { type: Date, required: true },
      used: { type: Boolean, default: false },
    },
    options,
  ),
);
export const Audit = model(
  "Audit",
  new Schema(
    {
      actor: { type: Schema.Types.ObjectId, ref: "User" },
      action: String,
      resource: String,
      requestId: String,
    },
    { timestamps: true },
  ),
);
export const Organization = model(
  "Organization",
  new Schema(
    {
      kind: {
        type: String,
        enum: ["departments", "designations", "branches", "shifts"],
        required: true,
      },
      name: { type: String, required: true },
      code: { type: String, required: true },
      description: String,
      active: { type: Boolean, default: true },
      head: { type: Schema.Types.ObjectId, ref: "Employee" },
      parent: { type: Schema.Types.ObjectId, ref: "Organization" },
      level: Number,
      address: String,
      timezone: { type: String, default: "Asia/Kolkata" },
      startTime: String,
      endTime: String,
      graceMinutes: { type: Number, default: 0 },
    },
    options,
  ),
);
Organization.schema.index({ kind: 1, code: 1 }, { unique: true });
