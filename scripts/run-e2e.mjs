import mongoose from "mongoose";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import { createServer as viteServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import argon2 from "argon2";
import { createApp } from "../src/app.js";
import { createInitialAdmin } from "../src/setup.js";
import { Employee, User, Role } from "../src/models.js";
import session from "express-session";
import { rm } from "node:fs/promises";
const dbName = `abco_test_${randomUUID().replaceAll("-", "")}`,
  password = randomBytes(20).toString("hex");
const storage = path.resolve("storage", dbName);
process.env.SESSION_SECRET = randomBytes(32).toString("hex");
process.env.DOCUMENT_KEY = randomBytes(32).toString("hex");
process.env.DOCUMENT_STORAGE_PATH = storage;
process.env.FRONTEND_ORIGIN = "http://127.0.0.1:5190";
process.env.NODE_ENV = "test";
await mongoose.connect("mongodb://127.0.0.1:27017", {
  dbName,
  serverSelectionTimeoutMS: 5000,
});
let api, web;
try {
  await Promise.all(
    Object.values(mongoose.models).map((model) => model.init()),
  );
  await createInitialAdmin({
    name: "Workspace Admin",
    email: "admin@example.test",
    password,
  });
  const employee = await Employee.create({
    code: "E2E-001",
    firstName: "Alice",
    lastName: "Tester",
    email: "alice@example.test",
    department: "Engineering",
    designation: "Developer",
    joiningDate: new Date("2025-01-01"),
  });
  const role = await Role.findOne({ name: "Employee" });
  await User.create({
    name: "Alice Tester",
    email: employee.email,
    passwordHash: await argon2.hash(password),
    role: role._id,
    employee: employee._id,
  });
  api = createApp({ sessionStore: new session.MemoryStore() }).listen(
    0,
    "127.0.0.1",
  );
  await new Promise((resolve) => api.once("listening", resolve));
  web = await viteServer({
    configFile: false,
    root: path.resolve("../frontend"),
    plugins: [react(), tailwind()],
    server: {
      host: "127.0.0.1",
      port: 5190,
      strictPort: true,
      proxy: { "/api": `http://127.0.0.1:${api.address().port}` },
    },
  });
  await web.listen();
  const child = spawn(
    process.execPath,
    ["node_modules/@playwright/test/cli.js", "test"],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        E2E_BASE_URL: "http://127.0.0.1:5190",
        E2E_PASSWORD: password,
        E2E_ADMIN_EMAIL: "admin@example.test",
        E2E_EMPLOYEE_EMAIL: "alice@example.test",
      },
    },
  );
  const code = await new Promise((resolve, reject) => {
    child.on("exit", resolve);
    child.on("error", reject);
  });
  process.exitCode = code || 0;
} finally {
  await web?.close();
  if (api) await new Promise((resolve) => api.close(resolve));
  if (mongoose.connection.readyState) {
    if (
      mongoose.connection.name !== dbName ||
      !/^abco_test_[a-f\d]{32}$/.test(dbName)
    ) {
      console.error("Unsafe test database cleanup refused");
      process.exitCode = 1;
    } else await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
  if (
    path.dirname(storage) !== path.resolve("storage") ||
    !path.basename(storage).startsWith("abco_test_")
  ) {
    console.error("Unsafe test storage cleanup refused");
    process.exitCode = 1;
  } else await rm(storage, { recursive: true, force: true });
}
