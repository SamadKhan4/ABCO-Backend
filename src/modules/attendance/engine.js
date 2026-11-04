export function localDate(instant, timezone = "Asia/Kolkata") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}
export function addDays(date, days) {
  const value = new Date(date + "T12:00:00Z");
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function localInstant(date, time, timezone) {
  const target = new Date(`${date}T${time}:00Z`).getTime();
  let guess = target;
  for (let i = 0; i < 4; i++) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(guess));
    const values = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    const rendered = Date.UTC(
      +values.year,
      +values.month - 1,
      +values.day,
      +values.hour,
      +values.minute,
      +values.second,
    );
    const delta = target - rendered;
    if (!delta) return new Date(guess);
    guess += delta;
  }
  throw new Error(
    "Local shift time is ambiguous or does not exist in this timezone",
  );
}
export function shiftOccurrence(now, shift) {
  const timezone = shift.timezone || "Asia/Kolkata";
  let date = localDate(now, timezone);
  const clock = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
  const overnight = shift.endTime <= shift.startTime;
  if (overnight && clock < shift.endTime) date = addDays(date, -1);
  const start = localInstant(date, shift.startTime, timezone),
    end = localInstant(
      overnight ? addDays(date, 1) : date,
      shift.endTime,
      timezone,
    );
  return { date, start, end, timezone, overnight };
}
export function summarize(record, punchOut) {
  const breakMinutes = record.breaks.reduce(
    (sum, b) => sum + (b.end ? Math.floor((b.end - b.start) / 60000) : 0),
    0,
  );
  const workingMinutes = Math.max(
    0,
    Math.floor((punchOut - record.punchIn) / 60000) - breakMinutes,
  );
  const target = record.shiftSnapshot?.fullDayMinutes || 480,
    half = record.shiftSnapshot?.halfDayMinutes || 240;
  return {
    workingMinutes,
    breakMinutes,
    overtimeMinutes: Math.max(0, workingMinutes - target),
    earlyMinutes: record.scheduledEnd
      ? Math.max(0, Math.floor((record.scheduledEnd - punchOut) / 60000))
      : 0,
    attendanceClass:
      workingMinutes >= target
        ? "Present"
        : workingMinutes >= half
          ? "Half Day"
          : "Absent",
  };
}
