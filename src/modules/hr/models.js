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
export const Job = model(
  "Job",
  new Schema(
    {
      title: String,
      department: String,
      location: String,
      employmentType: String,
      vacancies: Number,
      description: String,
      requirements: String,
      openingDate: String,
      status: {
        type: String,
        enum: ["Open", "On Hold", "Closed"],
        default: "Open",
      },
      hiringManager: ref("Employee"),
    },
    options,
  ),
);
const candidateSchema = new Schema(
  {
    resume: ref("Document"),
    name: String,
    email: String,
    phone: String,
    job: ref("Job"),
    source: String,
    experience: String,
    skills: String,
    notes: String,
    status: {
      type: String,
      enum: [
        "Applied",
        "Screening",
        "Interview",
        "Evaluation",
        "Selected",
        "Offered",
        "Accepted",
        "Joined",
        "Rejected",
        "Withdrawn",
      ],
      default: "Applied",
    },
    interviewAt: Date,
    feedback: String,
    employee: ref("Employee"),
  },
  options,
);
candidateSchema.index({ email: 1, job: 1 }, { unique: true });
export const Candidate = model("Candidate", candidateSchema);
export const Onboarding = model(
  "Onboarding",
  new Schema(
    {
      employee: { ...ref("Employee"), unique: true },
      status: {
        type: String,
        enum: ["In Progress", "Completed"],
        default: "In Progress",
      },
      checklist: [
        {
          title: String,
          owner: ref("Employee"),
          deadline: String,
          done: { type: Boolean, default: false },
          completedAt: Date,
        },
      ],
      approvedBy: ref("User"),
      completedAt: Date,
    },
    options,
  ),
);
export const Performance = model(
  "Performance",
  new Schema(
    {
      employee: ref("Employee"),
      title: String,
      startDate: String,
      endDate: String,
      goals: [
        {
          title: String,
          weight: Number,
          selfScore: Number,
          managerScore: Number,
        },
      ],
      selfComment: String,
      managerComment: String,
      status: {
        type: String,
        enum: [
          "Goals Assigned",
          "Self Review Submitted",
          "Manager Reviewed",
          "Approved",
          "Acknowledged",
        ],
        default: "Goals Assigned",
      },
      reviewer: ref("User"),
      approver: ref("User"),
      weightedScore: Number,
    },
    options,
  ),
);
export const Asset = model(
  "Asset",
  new Schema(
    {
      name: String,
      category: String,
      serial: { type: String, unique: true },
      brand: String,
      model: String,
      purchaseDate: String,
      warrantyExpiry: String,
      condition: String,
      status: {
        type: String,
        enum: ["Available", "Assigned", "Under Repair", "Retired"],
        default: "Available",
      },
      employee: ref("Employee"),
      assignedAt: Date,
    },
    options,
  ),
);
const assignmentSchema = new Schema(
  {
    asset: ref("Asset"),
    employee: ref("Employee"),
    assignedBy: ref("User"),
    assignedAt: Date,
    returnedAt: Date,
    returnCondition: String,
    active: { type: Boolean, default: true },
  },
  options,
);
assignmentSchema.index(
  { asset: 1 },
  { unique: true, partialFilterExpression: { active: true } },
);
export const AssetAssignment = model("AssetAssignment", assignmentSchema);
export const Exit = model(
  "Exit",
  new Schema(
    {
      employee: ref("Employee"),
      resignationDate: String,
      lastWorkingDate: String,
      reason: String,
      separationType: String,
      handover: String,
      clearance: {
        handoverComplete: { type: Boolean, default: false },
        documentsComplete: { type: Boolean, default: false },
        settlementReviewed: { type: Boolean, default: false },
      },
      settlementNote: String,
      interview: {
        summary: String,
        improvements: String,
        wouldRehire: Boolean,
        actor: ref("User"),
        at: Date,
      },
      status: {
        type: String,
        enum: [
          "Requested",
          "Under Review",
          "Approved",
          "Notice Period",
          "Clearance",
          "Settlement",
          "Completed",
          "Rejected",
        ],
        default: "Requested",
      },
      history: [{ status: String, actor: ref("User"), at: Date, note: String }],
    },
    options,
  ),
);
