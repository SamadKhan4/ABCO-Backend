import mongoose from "mongoose";
import { scopedModel } from "../../shared/scope.js";
const { Schema } = mongoose,
  model = scopedModel;
const ref = (name) => ({ type: Schema.Types.ObjectId, ref: name });
const options = {
  timestamps: true,
  strict: "throw",
  optimisticConcurrency: true,
};
export const Project = model(
  "Project",
  new Schema(
    {
      name: String,
      code: { type: String, unique: true },
      description: String,
      department: String,
      employees: [ref("Employee")],
      startDate: String,
      endDate: String,
      status: {
        type: String,
        enum: ["Planned", "Active", "On Hold", "Completed", "Archived"],
        default: "Planned",
      },
    },
    options,
  ),
);
export const Timesheet = model(
  "Timesheet",
  new Schema(
    {
      employee: ref("Employee"),
      project: ref("Project"),
      date: String,
      minutes: Number,
      billable: Boolean,
      description: String,
      status: {
        type: String,
        enum: ["Draft", "Submitted", "Approved", "Rejected"],
        default: "Draft",
      },
      approver: ref("User"),
      reviewNote: String,
    },
    options,
  ),
);
export const Training = model(
  "Training",
  new Schema(
    {
      title: String,
      course: String,
      description: String,
      skills: [String],
      trainer: String,
      startDate: String,
      endDate: String,
      status: {
        type: String,
        enum: ["Planned", "Active", "Completed", "Cancelled"],
        default: "Planned",
      },
    },
    options,
  ),
);
const enrollmentSchema = new Schema(
  {
    training: ref("Training"),
    employee: ref("Employee"),
    progress: { type: Number, default: 0 },
    attendance: [String],
    assessmentScore: Number,
    certificate: ref("Document"),
    feedback: String,
    status: {
      type: String,
      enum: ["Assigned", "In Progress", "Completed"],
      default: "Assigned",
    },
    completedBy: ref("User"),
  },
  options,
);
enrollmentSchema.index({ training: 1, employee: 1 }, { unique: true });
export const TrainingEnrollment = model("TrainingEnrollment", enrollmentSchema);
const skillSchema = new Schema(
  {
    employee: ref("Employee"),
    name: String,
    level: Number,
    targetLevel: Number,
  },
  options,
);
skillSchema.index({ employee: 1, name: 1 }, { unique: true });
export const Skill = model("Skill", skillSchema);
export const ExpensePolicy = model(
  "ExpensePolicy",
  new Schema(
    {
      name: { type: String, unique: true },
      maximumAmount: Number,
      receiptRequired: Boolean,
      effectiveFrom: String,
      active: { type: Boolean, default: true },
    },
    options,
  ),
);
export const Expense = model(
  "Expense",
  new Schema(
    {
      employee: ref("Employee"),
      policy: ref("ExpensePolicy"),
      policySnapshot: {
        name: String,
        maximumAmount: Number,
        receiptRequired: Boolean,
      },
      title: String,
      date: String,
      amount: Number,
      description: String,
      receipt: ref("Document"),
      travel: ref("Travel"),
      status: {
        type: String,
        enum: ["Draft", "Submitted", "Approved", "Rejected", "Paid"],
        default: "Draft",
      },
      approver: ref("User"),
      reviewNote: String,
      paymentReference: String,
      paidAt: Date,
    },
    options,
  ),
);
export const Travel = model(
  "Travel",
  new Schema(
    {
      employee: ref("Employee"),
      destination: String,
      purpose: String,
      startDate: String,
      endDate: String,
      itinerary: String,
      advanceRequested: Number,
      advancePaid: { type: Number, default: 0 },
      advanceReference: String,
      status: {
        type: String,
        enum: [
          "Requested",
          "Approved",
          "Rejected",
          "In Progress",
          "Settlement Submitted",
          "Settled",
          "Cancelled",
        ],
        default: "Requested",
      },
      approver: ref("User"),
      reviewNote: String,
      actualExpenses: Number,
      balance: Number,
      settlementReference: String,
    },
    options,
  ),
);
export const Survey = model(
  "Survey",
  new Schema(
    {
      title: String,
      description: String,
      department: String,
      anonymous: Boolean,
      opensAt: Date,
      closesAt: Date,
      status: {
        type: String,
        enum: ["Draft", "Published", "Closed"],
        default: "Draft",
      },
      questions: [
        { title: String, type: { type: String, enum: ["Rating", "Text"] } },
      ],
      createdBy: ref("User"),
    },
    options,
  ),
);
const responseSchema = new Schema(
  {
    survey: ref("Survey"),
    employee: { ...ref("Employee"), select: false },
    answers: [{ question: Number, rating: Number, text: String }],
  },
  options,
);
responseSchema.index({ survey: 1, employee: 1 }, { unique: true });
export const SurveyResponse = model("SurveyResponse", responseSchema);
export const Recognition = model(
  "Recognition",
  new Schema(
    {
      employee: ref("Employee"),
      title: String,
      message: String,
      reward: String,
      from: ref("User"),
    },
    options,
  ),
);
export const Suggestion = model(
  "Suggestion",
  new Schema(
    {
      employee: ref("Employee"),
      title: String,
      body: String,
      category: String,
      status: {
        type: String,
        enum: ["Submitted", "Reviewed", "Accepted", "Declined"],
        default: "Submitted",
      },
      reviewNote: String,
      reviewer: ref("User"),
    },
    options,
  ),
);
