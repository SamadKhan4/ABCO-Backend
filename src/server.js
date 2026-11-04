import { startReminderWorker } from "./modules/operations/reminders.js";
import "dotenv/config";
import mongoose from "mongoose";
import { createApp } from "./app.js";
import { startEmailWorker } from "./modules/auth/recovery.js";
if (!process.env.MONGODB_URI)
  throw new Error("Set MONGODB_URI in backend/.env");
await mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 10000,
});
const stopEmailWorker = startEmailWorker();
const stopReminders = startReminderWorker();
const server = createApp().listen(
  process.env.PORT || 4000,
  process.env.HOST || "127.0.0.1",
  () => console.log(`ABCO API listening on port ${process.env.PORT || 4000}`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    stopEmailWorker();
    stopReminders();
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  });
