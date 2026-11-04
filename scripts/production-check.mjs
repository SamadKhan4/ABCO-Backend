import dotenv from "dotenv";
import mongoose from "mongoose";
import { existsSync } from "node:fs";
dotenv.config({ path: ".env", quiet: true });
const results = [];
const check = (name, ok, detail) =>
  results.push({ name, status: ok ? "PASS" : "BLOCKED", detail });
check(
  "Production mode",
  process.env.NODE_ENV === "production",
  "NODE_ENV=production",
);
check(
  "HTTPS origin",
  /^https:\/\/[^/]+\/?$/.test(process.env.FRONTEND_ORIGIN || ""),
  "Set FRONTEND_ORIGIN to the dedicated HTTPS domain",
);
check(
  "Session secret",
  Boolean(
    process.env.SESSION_SECRET?.length >= 32 &&
    !process.env.SESSION_SECRET.includes("replace-with"),
  ),
  "Private random secret with at least 32 characters",
);
check(
  "Document encryption key",
  /^[a-f\d]{64}$/i.test(process.env.DOCUMENT_KEY || ""),
  "Preserve DOCUMENT_KEY across deployments and backup it separately",
);
check(
  "Backup encryption key",
  /^[a-f\d]{64}$/i.test(process.env.BACKUP_KEY || "") &&
    process.env.BACKUP_KEY !== process.env.DOCUMENT_KEY,
  "Separate 32-byte hex BACKUP_KEY stored off-server",
);
check(
  "SMTP configuration",
  Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM),
  "SMTP_HOST and SMTP_FROM; verify actual mailbox delivery before launch",
);
check(
  "Frontend build",
  existsSync("../frontend/dist/index.html"),
  "npm run build",
);
check(
  "Business policy approval",
  process.env.BUSINESS_POLICY_APPROVED === "YES",
  "Owner/finance must validate configured leave, payroll components and statutory treatment",
);
check(
  "External HTTPS and recovery drill",
  process.env.DEPLOYMENT_VERIFIED === "YES",
  "Operator must verify certificate, dedicated proxy, real backup restore and off-server retention",
);
try {
  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
  });
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  check(
    "MongoDB transactions",
    Boolean(hello.setName || hello.msg === "isdbgrid"),
    "A replica set or mongos is required",
  );
  const enabled = await mongoose.connection.db
    .collection("users")
    .countDocuments({ active: true });
  check(
    "Active accounts",
    enabled > 0,
    "Complete one-time setup and review account permissions",
  );
} catch {
  check(
    "Database connectivity",
    false,
    "MongoDB unavailable or configuration invalid",
  );
} finally {
  await mongoose.disconnect();
}
for (const row of results)
  console.log(`${row.status} | ${row.name} | ${row.detail}`);
console.log(
  "Read docs/function-audit.md for feature gaps. Passing this check does not certify statutory compliance or complete the feature audit.",
);
if (results.some((row) => row.status === "BLOCKED")) process.exitCode = 1;
