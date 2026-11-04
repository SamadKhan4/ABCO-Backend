import dotenv from "dotenv";
import "../src/app.js";
import mongoose from "mongoose";
import { randomBytes } from "node:crypto";
import { readFileSync, appendFileSync } from "node:fs";
import { Role, Audit } from "../src/models.js";
import {
  defaultRoles,
  hrPermissions,
} from "../src/shared/default-roles.js";
dotenv.config({ path: ".env", quiet: true });
if (!process.env.DOCUMENT_KEY) {
  appendFileSync(
    ".env",
    `\nDOCUMENT_KEY=${randomBytes(32).toString("hex")}\n`,
  );
  console.log(
    "Generated a private document encryption key in ignored .env.",
  );
}
if (!process.env.BACKUP_KEY) {
  appendFileSync(
    ".env",
    `\nBACKUP_KEY=${randomBytes(32).toString("hex")}\n`,
  );
  console.log(
    "Generated a separate private backup encryption key in ignored .env.",
  );
}
await mongoose.connect(process.env.MONGODB_URI);
try {
  const grants = hrPermissions;
  const result = await Role.updateOne(
    { name: "HR Manager" },
    { $addToSet: { permissions: { $each: grants } } },
  );
  await Role.updateOne(
    { name: "Payroll / Finance" },
    {
      $addToSet: {
        permissions: {
          $each: defaultRoles.find((r) => r.name === "Payroll / Finance")
            .permissions,
        },
      },
    },
    { upsert: true },
  );
  await Role.updateOne(
    { name: "Payroll Approver" },
    { $setOnInsert: { permissions: ["payroll.view", "payroll.approve"] } },
    { upsert: true },
  );
  for (const role of defaultRoles)
    await Role.updateOne(
      { name: role.name },
      { $setOnInsert: { permissions: role.permissions, scope: role.scope } },
      { upsert: true },
    );
  await Role.updateOne({ name: "Employee" }, { $set: { scope: "Own" } });
  for (const model of Object.values(mongoose.models))
    await model.createIndexes();
  if (result.modifiedCount)
    await Audit.create({
      action: "system.migration.hr-modules.enabled",
      resource: "HR Manager",
    });
  console.log(
    "HR module permissions and separate payroll roles are configured.",
  );
} finally {
  await mongoose.disconnect();
}
