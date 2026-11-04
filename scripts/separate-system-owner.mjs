import "dotenv/config";
import mongoose from "mongoose";
import { Role, User, Employee, Audit } from "../src/models.js";

// Detach the original bootstrap employee only; preserve all business history.
await mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 15000,
});
try {
  const role = await Role.findOne({ name: "Super Admin" });
  if (!role) throw new Error("Super Admin role not found");
  if (role.scope !== "Company" || !role.permissions.includes("*"))
    throw new Error("Owner must have company-wide wildcard permissions");
  const owners = await User.find({ role: role._id });
  for (const owner of owners) {
    if (!owner.employee) continue;
    await mongoose.connection.transaction(async (session) => {
      const employee = await Employee.findById(owner.employee).session(session);
      if (
        employee?.code === "ABC-0001" &&
        employee.designation === "Administrator"
      ) {
        employee.status = "Archived";
        await employee.save({ session });
      }
      await User.updateOne(
        { _id: owner._id },
        {
          $unset: { employee: 1 },
          $inc: { authVersion: 1 },
        },
        { session },
      );
      await Audit.create(
        [
          {
            actor: owner._id,
            action: "system.owner.employee-detached",
            resource: String(owner.employee),
          },
        ],
        { session },
      );
    });
  }
  console.log(
    "Super Admin is a standalone system owner. Existing passwords and employee history preserved.",
  );
} finally {
  await mongoose.disconnect();
}
