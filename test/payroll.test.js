import test from "node:test";
import assert from "node:assert/strict";
import {
  toPaise,
  prorate,
  calculateSalary,
} from "../src/modules/payroll/calculator.js";
test("money parsing does not introduce floating point rounding", () => {
  assert.equal(toPaise("0.10"), 10);
  assert.equal(toPaise("1000.01"), 100001);
  assert.equal(toPaise("20"), 2000);
  assert.throws(() => toPaise("1.001"));
  assert.throws(() => toPaise("-10"));
});
test("payroll prorates using integer arithmetic and explicit rounding", () => {
  assert.equal(prorate(100001, 15, 30), 50001);
  assert.equal(prorate(100000, 31, 31), 100000);
  assert.equal(prorate(100001, 0, 31), 0);
  assert.throws(() => prorate(100, 32, 31));
});
test("net excludes employer contributions and respects fixed deductions", () => {
  const result = calculateSalary(
    {
      earnings: [{ name: "Basic", amount: 3000000, prorate: true }],
      deductions: [
        { name: "Configured deduction", amount: 100000, prorate: false },
      ],
      employerContributions: [
        { name: "Employer", amount: 50000, prorate: false },
      ],
    },
    15,
    30,
  );
  assert.equal(result.gross, 1500000);
  assert.equal(result.deductionsTotal, 100000);
  assert.equal(result.employerTotal, 50000);
  assert.equal(result.net, 1400000);
});
test("negative net pay is rejected", () =>
  assert.throws(
    () =>
      calculateSalary(
        {
          earnings: [{ name: "Pay", amount: 100 }],
          deductions: [{ name: "Recovery", amount: 200 }],
        },
        30,
        30,
      ),
    /Deductions exceed/,
  ));
