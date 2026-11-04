import { scopedModel } from "../../shared/scope.js";
import mongoose from "mongoose";
const { Schema } = mongoose;
const model = scopedModel;
const options = {
  timestamps: true,
  strict: "throw",
  optimisticConcurrency: true,
};
const component = new Schema(
  {
    name: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    prorate: { type: Boolean, default: true },
  },
  { _id: false },
);
const salarySchema = new Schema(
  {
    employee: { type: Schema.Types.ObjectId, ref: "Employee", required: true },
    effectiveDate: { type: String, required: true },
    currency: { type: String, default: "INR" },
    overtimeRate: { type: Number, default: 0 },
    earnings: [component],
    deductions: [component],
    employerContributions: [component],
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  options,
);
salarySchema.index({ employee: 1, effectiveDate: 1 }, { unique: true });
export const SalaryStructure = model("SalaryStructure", salarySchema);
export const PayrollPeriod = model(
  "PayrollPeriod",
  new Schema(
    {
      month: { type: String, unique: true, required: true },
      startDate: String,
      endDate: String,
      companySnapshot: { name: String, address: String, logo: String },
      payBasis: {
        type: String,
        enum: ["Calendar days", "Recorded attendance"],
      },
      status: {
        type: String,
        enum: [
          "Draft",
          "Calculated",
          "Under Review",
          "Approved",
          "Finalized",
          "Paid",
          "Closed",
        ],
        default: "Draft",
      },
      version: { type: Number, default: 0 },
      processor: { type: Schema.Types.ObjectId, ref: "User" },
      approver: { type: Schema.Types.ObjectId, ref: "User" },
      paymentReference: String,
      paidAt: Date,
      history: [
        {
          status: String,
          actor: { type: Schema.Types.ObjectId, ref: "User" },
          at: Date,
        },
      ],
    },
    options,
  ),
);
const entrySchema = new Schema(
  {
    period: {
      type: Schema.Types.ObjectId,
      ref: "PayrollPeriod",
      required: true,
    },
    employee: { type: Schema.Types.ObjectId, ref: "Employee", required: true },
    version: Number,
    bankSnapshot: { bankName: String, maskedAccount: String },
    overtimeMinutes: Number,
    adjustmentIds: [Schema.Types.ObjectId],
    employeeSnapshot: {
      name: String,
      code: String,
      department: String,
      designation: String,
    },
    salarySnapshot: {
      effectiveDate: String,
      currency: String,
      overtimeRate: Number,
      earnings: [component],
      deductions: [component],
      employerContributions: [component],
    },
    periodDays: Number,
    payableDays: Number,
    unpaidDays: Number,
    gross: Number,
    deductionsTotal: Number,
    employerTotal: Number,
    net: Number,
    earnings: [component],
    deductions: [component],
    employerContributions: [component],
  },
  options,
);
entrySchema.index({ period: 1, employee: 1 }, { unique: true });
export const PayrollEntry = model("PayrollEntry", entrySchema);
