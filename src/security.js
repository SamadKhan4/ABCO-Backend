export function can(user, permission) {
  return Boolean(
    user?.role?.permissions?.some((p) => p === "*" || p === permission),
  );
}
export function workDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function durationMinutes(start, end) {
  if (end < start) throw new Error("End must follow start");
  return Math.floor((end - start) / 60000);
}
