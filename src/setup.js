import { defaultRoles } from "./shared/default-roles.js";
import mongoose from "mongoose";
import argon2 from "argon2";
import { createHash } from "node:crypto";
import { Role, User, Employee, SetupToken, Audit } from "./models.js";
export async function createInitialAdmin({ name, email, password, token }) {
  await Promise.all([
    Role.init(),
    User.init(),
    Employee.init(),
    SetupToken.init(),
    Audit.init(),
  ]);
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(async () => {
      if (token) {
        const claim = await SetupToken.findOneAndUpdate(
          {
            _id: "initial-admin",
            digest: createHash("sha256").update(token).digest("hex"),
            expiresAt: { $gt: new Date() },
            used: false,
          },
          { $set: { used: true } },
          { session, new: true },
        );
        if (!claim) {
          const error = new Error(
            "Setup link is invalid, expired, or already used",
          );
          error.status = 403;
          throw error;
        }
      }
      if (await Role.exists({ name: "Super Admin" }).session(session)) {
        const error = new Error("Initial setup is already complete");
        error.status = 409;
        throw error;
      }
      const [role] = await Role.create(
        [{ name: "Super Admin", permissions: ["*"] }],
        { session },
      );
      const [employee] = await Employee.create(
        [
          {
            code: "ABC-0001",
            firstName: name,
            lastName: "",
            email,
            department: "Administration",
            designation: "Administrator",
            joiningDate: new Date(),
          },
        ],
        { session },
      );
      const [user] = await User.create(
        [{ name, email, passwordHash, role: role._id, employee: employee._id }],
        { session },
      );
      await Role.create(defaultRoles, { session, ordered: true });
      await Audit.create(
        [{ actor: user._id, action: "system.bootstrap", resource: user.id }],
        { session },
      );
      return user.id;
    });
  } finally {
    await session.endSession();
  }
}
