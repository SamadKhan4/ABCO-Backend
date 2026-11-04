import { scopedModel } from "../../shared/scope.js";
import mongoose from "mongoose";
const { Schema } = mongoose;
const model = scopedModel;
const ref = (name) => ({ type: Schema.Types.ObjectId, ref: name });
const options = {
  timestamps: true,
  strict: "throw",
  optimisticConcurrency: true,
};
export const Task = model(
  "Task",
  new Schema(
    {
      title: String,
      description: String,
      project: ref("Project"),
      employee: ref("Employee"),
      createdBy: ref("User"),
      priority: {
        type: String,
        enum: ["Low", "Normal", "High", "Urgent"],
        default: "Normal",
      },
      startDate: String,
      dueDate: String,
      estimatedMinutes: Number,
      actualMinutes: { type: Number, default: 0 },
      archived: { type: Boolean, default: false },
      history: [{ action: String, actor: ref("User"), at: Date, note: String }],
      status: {
        type: String,
        enum: ["To Do", "In Progress", "On Hold", "Completed", "Cancelled"],
        default: "To Do",
      },
      comments: [{ author: ref("User"), body: String, at: Date }],
    },
    options,
  ),
);
const reportSchema = new Schema(
  {
    employee: ref("Employee"),
    date: String,
    title: String,
    description: String,
    project: ref("Project"),
    task: ref("Task"),
    minutes: Number,
    blockers: String,
    notes: String,
    workStatus: {
      type: String,
      enum: ["In Progress", "Completed", "Blocked"],
      default: "In Progress",
    },
    reviewHistory: [
      { status: String, comment: String, actor: ref("User"), at: Date },
    ],
    status: {
      type: String,
      enum: ["Draft", "Submitted", "Reviewed", "Approved", "Rejected"],
      default: "Draft",
    },
    reviewComment: String,
    reviewer: ref("User"),
    submittedAt: Date,
  },
  options,
);
reportSchema.index({ employee: 1, date: 1 });
export const DailyReport = model("DailyReport", reportSchema);
export const Announcement = model(
  "Announcement",
  new Schema(
    {
      title: String,
      body: String,
      department: String,
      branch: String,
      important: Boolean,
      publishAt: Date,
      expiresAt: Date,
      author: ref("User"),
      archived: { type: Boolean, default: false },
      acknowledgedBy: [ref("Employee")],
    },
    options,
  ),
);
export const Notification = model(
  "Notification",
  new Schema(
    {
      user: ref("User"),
      title: String,
      body: String,
      path: String,
      readAt: Date,
    },
    options,
  ),
);
export const Ticket = model(
  "Ticket",
  new Schema(
    {
      number: { type: String, unique: true },
      employee: ref("Employee"),
      subject: String,
      description: String,
      category: {
        type: String,
        enum: [
          "Payroll",
          "Attendance",
          "Leave",
          "Documents",
          "HR Policy",
          "IT Support",
          "Other",
        ],
      },
      priority: {
        type: String,
        enum: ["Low", "Normal", "High", "Urgent"],
        default: "Normal",
      },
      assignedTo: ref("User"),
      status: {
        type: String,
        enum: [
          "Open",
          "In Progress",
          "Awaiting Response",
          "Resolved",
          "Closed",
        ],
        default: "Open",
      },
      messages: [{ author: ref("User"), body: String, at: Date }],
      escalations: [{ actor: ref("User"), reason: String, at: Date }],
    },
    options,
  ),
);
export const Holiday = model(
  "Holiday",
  new Schema(
    {
      name: String,
      date: String,
      branch: String,
      optional: { type: Boolean, default: false },
      category: {
        type: String,
        enum: ["National", "Company", "Optional"],
        default: "Company",
      },
      active: { type: Boolean, default: true },
    },
    options,
  ),
);
export const CompanySettings = model(
  "CompanySettings",
  new Schema(
    {
      _id: { type: String, default: "company" },
      name: { type: String, default: "ABCO Computers" },
      timezone: { type: String, default: "Asia/Kolkata" },
      address: String,
      logo: String,
      financialYearStartMonth: { type: Number, min: 1, max: 12 },
      requireDailyReport: { type: Boolean, default: false },
      dailyReportDepartments: [String],
      requireFinalSettlement: { type: Boolean, default: false },
      allowWorkFromHome: { type: Boolean, default: false },
      allowShiftSwaps: { type: Boolean, default: false },
      remindersEnabled: { type: Boolean, default: false },
      reminderLeadDays: Number,
      sessionHours: { type: Number, default: 8 },
    },
    options,
  ),
);
