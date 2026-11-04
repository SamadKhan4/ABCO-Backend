export function toPaise(value) {
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(String(value)))
    throw new Error("Use a positive amount with up to two decimal places");
  const [whole, fraction = ""] = String(value).split(".");
  return Number(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0")));
}
export function prorate(amount, days, total) {
  if (
    !Number.isSafeInteger(amount) ||
    amount < 0 ||
    !Number.isInteger(days * 2) ||
    days < 0 ||
    !Number.isInteger(total) ||
    total < 1 ||
    days > total
  )
    throw new Error("Invalid payroll inputs");
  return Number(
    (BigInt(amount) * BigInt(Math.round(days * 2)) + BigInt(total)) /
      (BigInt(total) * 2n),
  );
}
export function calculateSalary(salary, payableDays, periodDays) {
  const components = (items) =>
    items.map((item) => ({
      name: item.name,
      prorate: item.prorate,
      amount:
        item.prorate === false
          ? item.amount
          : prorate(item.amount, payableDays, periodDays),
    }));
  const earnings = components(salary.earnings),
    deductions = components(salary.deductions),
    employerContributions = components(salary.employerContributions || []);
  const sum = (items) => items.reduce((total, item) => total + item.amount, 0);
  const gross = sum(earnings),
    deductionsTotal = sum(deductions),
    employerTotal = sum(employerContributions);
  if (deductionsTotal > gross)
    throw new Error("Deductions exceed gross salary");
  return {
    earnings,
    deductions,
    employerContributions,
    gross,
    deductionsTotal,
    employerTotal,
    net: gross - deductionsTotal,
  };
}
