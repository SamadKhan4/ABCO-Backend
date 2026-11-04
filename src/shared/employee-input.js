import { z } from "zod";
export const employeeInput = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.email().transform((value) => value.toLowerCase()),
  department: z.string().trim().min(1).max(100),
  designation: z.string().trim().min(1).max(100),
  branch: z.string().trim().min(1).max(100).default("Head office"),
  joiningDate: z.iso.date(),
  employmentType: z
    .enum(["Full time", "Part time", "Contract", "Internship"])
    .default("Full time"),
  phone: z.string().max(30).default(""),
  status: z.enum(["Active", "Probation"]).default("Active"),
});
