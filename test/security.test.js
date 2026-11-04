import test from "node:test";
import assert from "node:assert/strict";
import { can, workDate, durationMinutes } from "../src/security.js";
test("permissions deny absent grants and allow explicit permissions", () => {
  assert.equal(can(null, "employee.read"), false);
  assert.equal(
    can({ role: { permissions: ["employee.read"] } }, "payroll.view"),
    false,
  );
  assert.equal(can({ role: { permissions: ["*"] } }, "payroll.view"), true);
});
test("attendance measures overnight durations using UTC instants", () => {
  assert.equal(
    durationMinutes(
      new Date("2026-11-01T22:00Z"),
      new Date("2026-11-02T06:30Z"),
    ),
    510,
  );
  assert.throws(() =>
    durationMinutes(new Date("2026-11-02"), new Date("2026-11-01")),
  );
});
test("work date observes Indian midnight independently of UTC", () => {
  assert.equal(workDate(new Date("2026-11-01T19:00:00Z")), "2026-11-02");
  assert.equal(workDate(new Date("2026-11-01T18:00:00Z")), "2026-11-01");
});
