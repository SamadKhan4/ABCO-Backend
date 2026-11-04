import mongoose from "mongoose";
import { scopedModel } from "../../shared/scope.js";
import { LeaveBalance } from "../../models.js";
import { workDate } from "../../security.js";
const { Schema } = mongoose;
const changeSchema = new Schema(
  {
    employee: { type: Schema.Types.ObjectId, ref: "Employee" },
    policy: { type: Schema.Types.ObjectId, ref: "LeavePolicy" },
    year: Number,
    days: Number,
    reason: String,
    kind: { type: String, enum: ["Adjustment", "Encashment"] },
    amount: Number,
    status: {
      type: String,
      enum: ["Posted", "Pending", "Approved", "Rejected", "Paid"],
    },
    actor: { type: Schema.Types.ObjectId, ref: "User" },
    approver: { type: Schema.Types.ObjectId, ref: "User" },
    paymentReference: String,
  },
  { timestamps: true, strict: "throw", optimisticConcurrency: true },
);
export const LeaveAdjustment = scopedModel("LeaveAdjustment", changeSchema);
export function accruedDays(annualDays, accrual, year, asOf = workDate()) {
  if (accrual !== "Monthly") return annualDays;
  const currentYear = Number(asOf.slice(0, 4));
  if (year > currentYear) return 0;
  if (year < currentYear) return annualDays;
  return Math.floor((annualDays * Number(asOf.slice(5, 7)) * 2) / 12) / 2;
}
export async function balanceFor(employee, policy, year, session) {
  let balance = await LeaveBalance.findOne({
    employee,
    policy: policy._id,
    year,
  }).session(session || null);
  if (!balance) {
    const previous = await LeaveBalance.findOne({
      employee,
      policy: policy._id,
      year: year - 1,
    }).session(session || null);
    const carryForward = previous
      ? Math.min(
          policy.carryForwardLimit || 0,
          Math.max(0, previous.opening - previous.used - previous.reserved),
        )
      : 0;
    const accrued = accruedDays(policy.annualDays, policy.accrual, year);
    [balance] = await LeaveBalance.create(
      [
        {
          employee,
          policy: policy._id,
          year,
          opening: accrued + carryForward,
          annualSnapshot: policy.annualDays,
          accrualSnapshot: policy.accrual,
          accruedPosted: accrued,
          carriedForward: carryForward,
        },
      ],
      { session, ordered: true },
    );
  } else if (balance.accrualSnapshot === "Monthly") {
    const accrued = accruedDays(balance.annualSnapshot, "Monthly", year),
      difference = accrued - (balance.accruedPosted || 0);
    if (difference > 0) {
      balance.opening += difference;
      balance.accruedPosted = accrued;
      await balance.save({ session });
    }
  }
  return balance;
}
