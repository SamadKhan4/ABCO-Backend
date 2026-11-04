import test from "node:test";
import assert from "node:assert/strict";
import { leaveDates } from "../src/leaves.js";
test("leave counts configured working days across a weekend", () => {
  assert.deepEqual(
    leaveDates("2026-11-06", "2026-11-09", {
      excludeWeekends: true,
      weekendDays: [0, 6],
    }),
    ["2026-11-06", "2026-11-09"],
  );
  assert.equal(
    leaveDates("2026-11-06", "2026-11-09", {
      excludeWeekends: false,
      weekendDays: [],
    }).length,
    4,
  );
});
test("custom weekend configuration is respected", () => {
  assert.deepEqual(
    leaveDates("2026-11-06", "2026-11-08", {
      excludeWeekends: true,
      weekendDays: [5],
    }),
    ["2026-11-07", "2026-11-08"],
  );
});
