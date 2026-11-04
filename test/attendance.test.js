import test from "node:test";
import assert from "node:assert/strict";
import {
  shiftOccurrence,
  localInstant,
  summarize,
} from "../src/modules/attendance/engine.js";
test("night shift belongs to prior workday after midnight", () => {
  const shift = shiftOccurrence(new Date("2026-11-02T20:30:00Z"), {
    timezone: "Asia/Kolkata",
    startTime: "22:00",
    endTime: "06:00",
  });
  assert.equal(shift.date, "2026-11-02");
  assert.equal(shift.start.toISOString(), "2026-11-02T16:30:00.000Z");
  assert.equal(shift.end.toISOString(), "2026-11-03T00:30:00.000Z");
});
test("branch timezone correctly resolves daylight-saving offset", () => {
  assert.equal(
    localInstant("2026-07-01", "09:00", "America/New_York").toISOString(),
    "2026-07-01T13:00:00.000Z",
  );
  assert.equal(
    localInstant("2026-12-01", "09:00", "America/New_York").toISOString(),
    "2026-12-01T14:00:00.000Z",
  );
});
test("work duration excludes completed breaks", () => {
  const record = {
    punchIn: new Date("2026-11-02T03:30Z"),
    breaks: [
      {
        start: new Date("2026-11-02T07:30Z"),
        end: new Date("2026-11-02T08:00Z"),
      },
    ],
    shiftSnapshot: { fullDayMinutes: 480, halfDayMinutes: 240 },
    scheduledEnd: new Date("2026-11-02T12:00Z"),
  };
  const result = summarize(record, new Date("2026-11-02T12:30Z"));
  assert.equal(result.workingMinutes, 510);
  assert.equal(result.breakMinutes, 30);
  assert.equal(result.overtimeMinutes, 30);
  assert.equal(result.attendanceClass, "Present");
});
