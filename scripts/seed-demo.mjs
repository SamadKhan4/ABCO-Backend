import dotenv from "dotenv";
import mongoose from "mongoose";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import "../src/app.js";
import { storeDocument } from "../src/modules/documents/routes.js";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
dotenv.config({ path: resolve(root, ".env"), quiet: true });
const namespace = "abco-demo-v1";
const oid = (key) =>
  new mongoose.Types.ObjectId(
    createHash("sha256")
      .update(`${namespace}:${key}`)
      .digest("hex")
      .slice(0, 24),
  );
const day = (base, offset = 0) =>
  new Date(new Date(`${base}T12:00:00Z`).getTime() + offset * 86400000)
    .toISOString()
    .slice(0, 10);
const instant = (date, hour) => new Date(`${date}T${hour}:00+05:30`);
const label = (name, i) => `DEMO ${name} ${i + 1}`;
function pdfFile(title) {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: "A4", margin: 50 }),
      parts = [];
    pdf.on("data", (p) => parts.push(p));
    pdf.on("error", reject);
    pdf.on("end", () => {
      const buffer = Buffer.concat(parts);
      resolve({
        buffer,
        size: buffer.length,
        originalname: "demo.pdf",
        mimetype: "application/pdf",
      });
    });
    pdf
      .fontSize(21)
      .text("ABCO HRMS - SAMPLE DATA")
      .moveDown()
      .fontSize(15)
      .text(title)
      .moveDown()
      .fontSize(11)
      .text(
        "Fictional demonstration record. Not an identity document, employment commitment, invoice, payment or legal certificate.",
      )
      .moveDown()
      .text(
        "Use this PDF to check private upload, access and download workflows.",
      );
    pdf.end();
  });
}

export async function seedDemo() {
  if (process.env.NODE_ENV === "production")
    throw new Error("Demo data is restricted to development/test databases.");
  if (!/^[a-f\d]{64}$/i.test(process.env.DOCUMENT_KEY || ""))
    throw new Error(
      "Configure DOCUMENT_KEY before creating private sample files.",
    );
  const models = mongoose.models;
  const admin = await models.User.findOne({ active: true })
    .populate("role")
    .sort({ createdAt: 1 });
  const actor = admin?.role?.permissions?.includes("*")
    ? admin
    : await models.User.findOne({
        active: true,
        role: {
          $in: (await models.Role.find({ permissions: "*" })).map((r) => r._id),
        },
      }).populate("role");
  if (!actor)
    throw new Error(
      "Complete administrator setup before seeding demo records.",
    );
  const employeeRole = await models.Role.findOne({ name: "Employee" });
  if (!employeeRole) throw new Error("Run npm run migrate first.");
  const meta = mongoose.connection.db.collection("demo_seed_metadata");
  const stored = await meta.findOne({ _id: namespace }),
    today =
      stored?.today ||
      new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
        new Date(),
      ),
    month = today.slice(0, 7),
    year = Number(today.slice(0, 4));
  await meta.updateOne(
    { _id: namespace },
    { $setOnInsert: { today, createdAt: new Date() } },
    { upsert: true },
  );
  const dates = {
    start: month + "-01",
    past: day(today, -1),
    future: day(today, 14),
  };
  const counts = {},
    records = [];
  const session = await mongoose.startSession();
  async function add(model, key, values) {
    const id = oid(key),
      Model = models[model];
    let row = await Model.findById(id).session(session);
    if (!row) {
      [row] = await Model.create([{ _id: id, ...values }], { session });
    }
    records.push({ model, id: String(row._id) });
    counts[model] = (counts[model] || 0) + 1;
    return row;
  }
  const employees = [],
    projects = [],
    tasks = [],
    tickets = [],
    candidates = [],
    expenses = [],
    policies = [],
    reviews = [];
  const periods = [];
  try {
    await session.withTransaction(async () => {
      records.length = 0;
      for (const k of Object.keys(counts)) delete counts[k];
      for (let i = 0; i < 3; i++) {
        const branch = await add("Organization", `branch:${i}`, {
          kind: "branches",
          code: `DEMO-BR-${i + 1}`,
          name: label("Office", i),
          description: "Fictional sample branch",
          address: `Sample office ${i + 1}, demonstration address`,
          timezone: "Asia/Kolkata",
        });
        const department = await add("Organization", `department:${i}`, {
          kind: "departments",
          code: `DEMO-DEP-${i + 1}`,
          name: label(
            ["Engineering", "People Operations", "Customer Support"][i],
            i,
          ),
          description: "Sample department for workflow review",
        });
        const designation = await add("Organization", `designation:${i}`, {
          kind: "designations",
          code: `DEMO-DES-${i + 1}`,
          name: label(["Developer", "HR Executive", "Support Analyst"][i], i),
          level: i + 1,
        });
        const shift = await add("Organization", `shift:${i}`, {
          kind: "shifts",
          code: `DEMO-SH-${i + 1}`,
          name: label("Shift", i),
          startTime: ["09:00", "10:00", "11:00"][i],
          endTime: ["17:00", "18:00", "19:00"][i],
          graceMinutes: 10,
          timezone: "Asia/Kolkata",
        });
        const employee = await add("Employee", `employee:${i}`, {
          code: `DEMO-EMP-00${i + 1}`,
          firstName: ["Demo Asha", "Demo Rohan", "Demo Neha"][i],
          lastName: ["Kapoor", "Mehta", "Sharma"][i],
          email: `demo.employee${i + 1}@example.test`,
          department: department.name,
          departmentId: department._id,
          designation: designation.name,
          designationId: designation._id,
          branch: "DEMO Office 1",
          branchId: oid("branch:0"),
          joiningDate: new Date(dates.start + "T00:00:00Z"),
          status: i === 2 ? "Probation" : "Active",
          manager: i ? oid("employee:0") : undefined,
          dateOfBirth: `199${i}-11-0${i + 2}`,
          address: "Fictional demonstration address",
          employmentType: "Full time",
        });
        employees[i] = employee;
        await add("User", `user:${i}`, {
          name: `${employee.firstName} ${employee.lastName}`,
          email: employee.email,
          employee: employee._id,
          role: employeeRole._id,
          active: false,
        });
        await add("Role", `role:${i}`, {
          name: label("Read-only role", i),
          permissions: [],
          scope: ["Own", "Department", "Branch"][i],
        });
        await add("ShiftAssignment", `assignment:${i}`, {
          employee: employee._id,
          shift: shift._id,
          effectiveFrom: dates.start,
          timezone: "Asia/Kolkata",
          startTime: shift.startTime,
          endTime: shift.endTime,
          graceMinutes: 10,
          fullDayMinutes: 480,
          halfDayMinutes: 240,
          weeklyOffDays: [0],
          createdBy: actor._id,
        });
        await add("Attendance", `attendance:${i}`, {
          employee: employee._id,
          date: dates.past,
          punchIn: instant(dates.past, shift.startTime),
          punchOut: instant(dates.past, shift.endTime),
          status: "Present",
          workingMinutes: 480,
          attendanceClass: "Present",
          timezone: "Asia/Kolkata",
          scheduledStart: instant(dates.past, shift.startTime),
          scheduledEnd: instant(dates.past, shift.endTime),
          shiftSnapshot: {
            name: shift._id,
            startTime: shift.startTime,
            endTime: shift.endTime,
            timezone: "Asia/Kolkata",
            fullDayMinutes: 480,
            halfDayMinutes: 240,
            graceMinutes: 10,
          },
        });
        await add("Regularization", `regularization:${i}`, {
          employee: employee._id,
          date: day(today, -2),
          requestedIn: instant(day(today, -2), shift.startTime),
          requestedOut: instant(day(today, -2), shift.endTime),
          reason: "DEMO: review a fictional workday correction request",
          status: "Pending",
        });
        const policy = await add("LeavePolicy", `leave-policy:${i}`, {
          name: label(["Annual leave", "Personal leave", "Unpaid leave"][i], i),
          annualDays: 12,
          paid: i !== 2,
          accrual: "Annual",
          halfDayAllowed: true,
          encashmentAllowed: true,
          excludeWeekends: false,
          weekendDays: [0],
          carryForwardLimit: 0,
          minimumNoticeDays: 0,
          probationAllowed: true,
        });
        policies[i] = policy;
        const leaveDate = day(today, 7 + i),
          leave = await add("Leave", `leave:${i}`, {
            employee: employee._id,
            type: policy.name,
            policy: policy._id,
            startDate: leaveDate,
            endDate: leaveDate,
            dates: [leaveDate],
            days: 1,
            year: Number(leaveDate.slice(0, 4)),
            paid: policy.paid,
            reason:
              "DEMO: fictional one-day leave for approval workflow review",
            status: "Pending",
          });
        await add("LeaveBalance", `balance:${i}`, {
          employee: employee._id,
          policy: policy._id,
          year: Number(leaveDate.slice(0, 4)),
          opening: 12,
          annualSnapshot: 12,
          accrualSnapshot: "Annual",
          accruedPosted: 12,
          used: 0,
          reserved: 1,
        });
        await add("LeaveLedger", `ledger:${i}`, {
          employee: employee._id,
          request: leave._id,
          action: "Reserve",
          days: 1,
        });
        await add("LeaveAdjustment", `encashment:${i}`, {
          employee: employee._id,
          policy: policy._id,
          year,
          days: 0.5,
          kind: "Encashment",
          reason:
            "DEMO: fictional encashment request awaiting authorized review",
          status: "Pending",
          actor: oid(`user:${i}`),
        });
        const project = await add("Project", `project:${i}`, {
          name: label(
            ["Website refresh", "Employee portal", "Support improvement"][i],
            i,
          ),
          code: `DEMO-PRJ-00${i + 1}`,
          description:
            "Fictional sample project with linked tasks and timesheet records",
          department: department.name,
          employees: [employee._id],
          startDate: dates.start,
          endDate: day(today, 60),
          status: "Active",
        });
        projects[i] = project;
        const task = await add("Task", `task:${i}`, {
          employee: employee._id,
          project: project._id,
          title: label(
            [
              "Review requirements",
              "Prepare onboarding checklist",
              "Document support workflow",
            ][i],
            i,
          ),
          description:
            "DEMO task: review requirements, update progress and add an attachment.",
          createdBy: actor._id,
          priority: ["Normal", "High", "Low"][i],
          startDate: today,
          dueDate: day(today, 3 + i),
          estimatedMinutes: 120,
          actualMinutes: 0,
          status: "To Do",
          history: [
            {
              action: "Created",
              actor: actor._id,
              at: new Date(),
              note: "Explicitly requested sample data",
            },
          ],
        });
        tasks[i] = task;
        await add("DailyReport", `report:${i}`, {
          employee: employee._id,
          project: project._id,
          task: task._id,
          date: dates.past,
          title: label("Daily work summary", i),
          description:
            "DEMO: reviewed project requirements and documented next steps.",
          minutes: 120,
          workStatus: "In Progress",
          status: "Submitted",
          submittedAt: new Date(),
        });
        await add("Timesheet", `timesheet:${i}`, {
          employee: employee._id,
          project: project._id,
          date: dates.past,
          minutes: 120,
          billable: i !== 1,
          description: "DEMO: project requirement review and documentation",
          status: "Submitted",
        });
        const training = await add("Training", `training:${i}`, {
          title: label(
            [
              "Information security",
              "Customer communication",
              "Project planning",
            ][i],
            i,
          ),
          course: label("Sample course", i),
          description:
            "Demonstration training with learning progress and skills.",
          skills: [["Security awareness", "Communication", "Planning"][i]],
          trainer: "Demo Training Coordinator",
          startDate: today,
          endDate: day(today, 10),
          status: "Active",
        });
        await add("TrainingEnrollment", `enrollment:${i}`, {
          training: training._id,
          employee: employee._id,
          progress: 25,
          attendance: [today],
          status: "In Progress",
        });
        await add("Skill", `skill:${i}`, {
          employee: employee._id,
          name: label(
            ["Security awareness", "Communication", "Planning"][i],
            i,
          ),
          level: 2,
          targetLevel: 4,
        });
        const expensePolicy = await add(
          "ExpensePolicy",
          `expense-policy:${i}`,
          {
            name: label("Sample expense policy", i),
            maximumAmount: 500000,
            receiptRequired: true,
            effectiveFrom: dates.start,
          },
        );
        const travel = await add("Travel", `travel:${i}`, {
          employee: employee._id,
          destination: label(["Pune", "Mumbai", "Bengaluru"][i], i),
          purpose: "DEMO: fictional client coordination visit",
          startDate: day(today, 10 + i),
          endDate: day(today, 11 + i),
          itinerary:
            "Sample office visit and return journey; no booking has been made.",
          advanceRequested: 100000,
          status: "Requested",
        });
        expenses[i] = await add("Expense", `expense:${i}`, {
          employee: employee._id,
          policy: expensePolicy._id,
          policySnapshot: {
            name: expensePolicy.name,
            maximumAmount: expensePolicy.maximumAmount,
            receiptRequired: true,
          },
          title: label("Sample travel claim", i),
          date: dates.past,
          amount: 75000 + i * 10000,
          description:
            "DEMO: fictional receipt for reimbursement workflow review",
          status: "Draft",
        });
        const survey = await add("Survey", `survey:${i}`, {
          title: label(
            ["Workplace feedback", "Learning feedback", "Team communication"][
              i
            ],
            i,
          ),
          description: "Fictional survey for demonstration responses only.",
          department: "",
          anonymous: true,
          opensAt: instant(day(today, -1), "00:00"),
          closesAt: instant(day(today, 30), "23:00"),
          status: "Published",
          questions: [
            {
              title: "How would you rate this sample experience?",
              type: "Rating",
            },
            { title: "What could be improved?", type: "Text" },
          ],
          createdBy: actor._id,
        });
        await add("SurveyResponse", `response:${i}`, {
          survey: survey._id,
          employee: employee._id,
          answers: [
            { question: 0, rating: 4 },
            {
              question: 1,
              text: "DEMO: clearer documentation and shared checklists.",
            },
          ],
        });
        await add("Recognition", `recognition:${i}`, {
          employee: employee._id,
          title: label("Team contribution", i),
          message:
            "DEMO: thanks for helping document and improve the sample workflow.",
          reward: "Sample appreciation badge; no cash award",
          from: actor._id,
        });
        await add("Suggestion", `suggestion:${i}`, {
          employee: employee._id,
          title: label("Process improvement", i),
          body: "DEMO: maintain a shared checklist and review progress each week.",
          category: "Process",
          status: "Submitted",
        });
        const job = await add("Job", `job:${i}`, {
          title: label(
            ["Frontend Developer", "HR Executive", "Support Analyst"][i],
            i,
          ),
          department: department.name,
          location: "Demo office",
          employmentType: "Full time",
          vacancies: 1,
          description:
            "Fictional vacancy for testing the recruitment pipeline.",
          requirements:
            "Communication, teamwork and role-specific demonstration skills.",
          openingDate: today,
          status: "Open",
          hiringManager: oid("employee:0"),
        });
        candidates[i] = await add("Candidate", `candidate:${i}`, {
          name: label(["Arjun Verma", "Priya Shah", "Kabir Rao"][i], i),
          email: `demo.candidate${i + 1}@example.test`,
          job: job._id,
          source: "DEMO sample dataset",
          experience: "2 years (fictional)",
          skills: "Communication, planning and sample technical skills",
          notes: "Fictional applicant; no real interview or offer.",
          status: "Applied",
        });
        await add("Onboarding", `onboarding:${i}`, {
          employee: employee._id,
          status: "In Progress",
          checklist: [
            {
              title: "DEMO: review sample policy and upload documents",
              owner: employee._id,
              deadline: day(today, 7),
              done: false,
            },
          ],
        });
        const review = await add("Performance", `performance:${i}`, {
          employee: employee._id,
          title: label("Development review", i),
          startDate: dates.start,
          endDate: day(today, 60),
          goals: [
            {
              title: "Complete the agreed demonstration milestone",
              weight: 60,
            },
            { title: "Document the sample process clearly", weight: 40 },
          ],
          status: "Goals Assigned",
        });
        reviews[i] = review;
        await add("PeerFeedback", `peer:${i}`, {
          review: review._id,
          employee: employee._id,
          reviewer: oid(`employee:${(i + 1) % 3}`),
          status: "Requested",
        });
        await add("ImprovementPlan", `improvement:${i}`, {
          employee: employee._id,
          title: label("Development support plan", i),
          reason: "DEMO: fictional coaching plan for workflow testing",
          goals: "Complete reviewed milestones and document progress weekly.",
          startDate: today,
          endDate: day(today, 30),
          status: "Active",
          createdBy: actor._id,
        });
        await add("AppraisalRecommendation", `recommendation:${i}`, {
          employee: employee._id,
          kind: i === 1 ? "Promotion" : "Increment",
          incrementBasisPoints: i === 1 ? undefined : 500,
          proposedDesignation: i === 1 ? "Demo Senior Analyst" : undefined,
          reason: "DEMO: fictional recommendation awaiting independent review",
          createdBy: actor._id,
          status: "Pending",
        });
        const asset = await add("Asset", `asset:${i}`, {
          name: label(["Laptop", "Monitor", "Printer"][i], i),
          category: ["Laptop", "Monitor", "Printer"][i],
          serial: `DEMO-ASSET-00${i + 1}`,
          brand: "Demo Brand",
          model: "Sample Model",
          purchaseDate: day(today, -30),
          warrantyExpiry: day(today, 365),
          condition: "Damaged",
          status: "Under Repair",
        });
        await add("AssetAssignment", `asset-history:${i}`, {
          asset: asset._id,
          employee: employee._id,
          assignedBy: actor._id,
          assignedAt: instant(day(today, -5), "09:00"),
          returnedAt: instant(day(today, -1), "17:00"),
          returnCondition: "Damaged",
          active: false,
        });
        await add("AssetMaintenance", `maintenance:${i}`, {
          asset: asset._id,
          description:
            "DEMO: inspect the returned sample asset and record the repair.",
          startDate: today,
          status: "Open",
          createdBy: actor._id,
        });
        const exit = await add("Exit", `exit:${i}`, {
          employee: employee._id,
          resignationDate: today,
          lastWorkingDate: day(today, 45),
          reason:
            "DEMO: fictional exit used to review the offboarding lifecycle",
          separationType: "Resignation",
          handover:
            "Prepare the sample project handover and return allocated equipment.",
          status: "Requested",
          history: [
            {
              status: "Requested",
              actor: actor._id,
              at: new Date(),
              note: "Fictional demonstration request",
            },
          ],
        });
        await add("FinalSettlement", `settlement:${i}`, {
          exit: exit._id,
          employee: employee._id,
          employeeSnapshot: {
            name: `${employee.firstName} ${employee.lastName}`,
            code: employee.code,
            lastWorkingDate: exit.lastWorkingDate,
          },
          earnings: [{ name: "DEMO draft final wages", amount: 100000 }],
          manualEarnings: [{ name: "DEMO draft final wages", amount: 100000 }],
          deductions: [],
          manualDeductions: [],
          gross: 100000,
          deductionsTotal: 0,
          net: 100000,
          loanSnapshots: [],
          encashmentSnapshots: [],
          reason:
            "DEMO preview only. Complete exit approvals and recalculate before finance review.",
          status: "Draft",
          createdBy: actor._id,
        });
        const nextMonth = new Date(
          Date.UTC(year, Number(month.slice(5)) + i, 1),
        )
          .toISOString()
          .slice(0, 7);
        periods[i] = nextMonth;
        // Avoid occupying a genuine payroll month. Existing months are reused without changing them.
        const existingPeriod = await models.PayrollPeriod.findOne({
          month: nextMonth,
        }).session(session);
        if (!existingPeriod)
          await add("PayrollPeriod", `payroll-period:${i}`, {
            month: nextMonth,
            startDate: nextMonth + "-01",
            endDate: new Date(
              Date.UTC(
                Number(nextMonth.slice(0, 4)),
                Number(nextMonth.slice(5)),
                0,
              ),
            )
              .toISOString()
              .slice(0, 10),
            payBasis: "Calendar days",
            status: "Draft",
            history: [{ status: "Draft", actor: actor._id, at: new Date() }],
          });
        await add("SalaryStructure", `salary:${i}`, {
          employee: employee._id,
          effectiveDate: nextMonth + "-01",
          currency: "INR",
          overtimeRate: 0,
          earnings: [
            {
              name: "DEMO Basic salary",
              amount: 2500000 + i * 500000,
              prorate: true,
            },
          ],
          deductions: [],
          employerContributions: [],
          createdBy: actor._id,
        });
        await add("PayrollAdjustment", `payroll-adjustment:${i}`, {
          employee: employee._id,
          month: nextMonth,
          category: "Bonus",
          name: label("Sample bonus proposal", i),
          type: "Earning",
          amount: 100000,
          reason: "DEMO: pending fictional payroll adjustment, no payment",
          status: "Pending",
          createdBy: actor._id,
        });
        const loanPolicy = await add("LoanPolicy", `loan-policy:${i}`, {
          name: label("Sample loan policy", i),
          type: i === 1 ? "Salary Advance" : "Loan",
          maximumAmount: 1000000,
          maximumInstallments: 12,
          flatInterestBasisPoints: 0,
        });
        await add("Loan", `loan:${i}`, {
          employee: employee._id,
          policy: loanPolicy._id,
          policySnapshot: {
            name: loanPolicy.name,
            type: loanPolicy.type,
            flatInterestBasisPoints: 0,
          },
          amount: 300000,
          interest: 0,
          total: 300000,
          installments: 3,
          installmentAmount: 100000,
          startMonth: nextMonth,
          reason: "DEMO: fictional request awaiting review; no disbursement",
          repaid: 0,
          reserved: 0,
          status: "Requested",
        });
        tickets[i] = await add("Ticket", `ticket:${i}`, {
          number: `DEMO-TKT-00${i + 1}`,
          employee: employee._id,
          subject: label(
            [
              "Document clarification",
              "Attendance assistance",
              "Onboarding question",
            ][i],
            i,
          ),
          description:
            "DEMO: fictional request for HR support and workflow review.",
          category: ["Documents", "Attendance", "HR Policy"][i],
          priority: ["Normal", "High", "Low"][i],
          status: "Open",
          messages: [],
        });
        await add("Announcement", `announcement:${i}`, {
          title: label(
            [
              "Welcome to the demo workspace",
              "Sample learning session",
              "Sample document reminder",
            ][i],
            i,
          ),
          body: "This is fictional sample content added at your request for checking the HRMS.",
          department: "",
          branch: "",
          important: i === 0,
          publishAt: instant(day(today, -1), "09:00"),
          expiresAt: instant(day(today, 90), "23:00"),
          author: actor._id,
          acknowledgedBy: [],
        });
        await add("Holiday", `holiday:${i}`, {
          name: label("Sample holiday", i),
          date: day(today, 20 + i),
          branch: "DEMO Office 1",
          category: "Optional",
          optional: true,
          active: true,
        });
        const workflow = await add("ApprovalWorkflow", `workflow:${i}`, {
          name: label("Sample approval workflow", i),
          module: "Leave",
          active: false,
          steps: [{ type: "Role", role: actor.role._id, escalationHours: 24 }],
        });
        await add("ApprovalCase", `approval:${i}`, {
          workflow: workflow._id,
          module: "Leave",
          resource: leave._id,
          employee: employee._id,
          title: label("Leave approval", i),
          status: "Pending",
          currentStep: 0,
          steps: [{ type: "Role", role: actor.role._id, escalationHours: 24 }],
          history: [],
        });
        await add("ApprovalDelegation", `delegation:${i}`, {
          module: ["Leave", "Expense", "Travel"][i],
          from: actor._id,
          delegate: oid(`user:${(i + 1) % 3}`),
          startsAt: instant(today, "00:00"),
          endsAt: instant(day(today, 7), "23:00"),
          active: false,
        });
        await models.ApprovalDelegation.updateOne(
          {
            _id: oid(`delegation:${i}`),
            from: oid(`user:${i}`),
            active: false,
          },
          { $set: { from: actor._id } },
          { session },
        );
        await models.ApprovalWorkflow.updateOne(
          { _id: oid(`workflow:${i}`), active: false },
          { $set: { module: "Leave" } },
          { session },
        );
        await add("DocumentTemplate", `template:${i}`, {
          name: label("Sample letter template", i),
          kind: ["Offer", "Appointment", "Experience"][i],
          body: "DEMONSTRATION ONLY. This sample template for {{employeeName}} contains no legal commitment. Replace it with approved company text before issuing an official letter.",
          active: false,
          createdBy: actor._id,
        });
        await add("ShiftSwap", `swap:${i}`, {
          employee: employee._id,
          otherEmployee: oid(`employee:${(i + 1) % 3}`),
          date: day(today, 4 + i),
          reason: "DEMO: fictional colleague shift-exchange request",
          status: "Requested",
        });
        const recipients = await models.User.find({ active: true })
          .populate("role")
          .session(session);
        for (const recipient of recipients.filter((u) =>
          u.role?.permissions?.some((p) => p === "*" || p === "employee.read"),
        ))
          await add("Notification", `notification:${recipient.id}:${i}`, {
            user: recipient._id,
            title: label("Sample workspace update", i),
            body: "Fictional linked sample records are available for workflow review.",
            path: ["/employees", "/tasks", "/documents"][i],
          });
        await add("Audit", `audit:${i}`, {
          actor: actor._id,
          action: "demo.records.created",
          resource: `DEMO sample group ${i + 1}`,
          requestId: namespace,
        });
      }
    });
  } finally {
    await session.endSession();
  }
  // Private files use the existing encrypted document writer. Retry finds the labelled record.
  const previousStorage = process.env.DOCUMENT_STORAGE_PATH;
  process.env.DOCUMENT_STORAGE_PATH = previousStorage
    ? resolve(root, previousStorage)
    : resolve(root, "storage/documents");
  try {
    for (let i = 0; i < 3; i++)
      for (const [kind, metadata] of Object.entries({
        document: {
          employee: employees[i]._id,
          category: "Other Records",
          visibility: "Employee",
        },
        letter: {
          employee: employees[i]._id,
          category: "Appointment Letter",
          visibility: "Employee",
        },
        resume: {
          candidate: candidates[i]._id,
          category: "Resume",
          visibility: "HR Only",
        },
        receipt: {
          employee: employees[i]._id,
          category: "Other Records",
          visibility: "Employee",
        },
        task: {
          employee: employees[i]._id,
          task: tasks[i]._id,
          category: "Task Attachments",
          visibility: "Employee",
        },
        ticket: {
          employee: employees[i]._id,
          ticket: tickets[i]._id,
          category: "Ticket Attachments",
          visibility: "Employee",
        },
      })) {
        const name = label(`sample ${kind}`, i);
        let document = await models.Document.findOne({ name });
        if (!document)
          document = await storeDocument(
            { user: actor, id: namespace },
            { ...metadata, name },
            await pdfFile(name),
          );
        if (kind === "resume")
          await models.Candidate.updateOne(
            { _id: candidates[i]._id, resume: { $exists: false } },
            { $set: { resume: document._id } },
          );
        if (kind === "receipt") {
          await models.Expense.updateOne(
            { _id: expenses[i]._id, receipt: { $exists: false } },
            { $set: { receipt: document._id } },
          );
          await models.Expense.updateOne(
            { _id: expenses[i]._id, status: "Draft", receipt: document._id },
            { $set: { status: "Submitted" }, $unset: { travel: 1 } },
          );
        }
        counts.Document = (counts.Document || 0) + 1;
        records.push({ model: "Document", id: document.id });
      }
  } finally {
    if (previousStorage === undefined) delete process.env.DOCUMENT_STORAGE_PATH;
    else process.env.DOCUMENT_STORAGE_PATH = previousStorage;
  }
  const checks = [];
  for (const [name, count] of Object.entries(counts)) {
    const ids = records.filter((r) => r.model === name).map((r) => r.id),
      found = await models[name].countDocuments({ _id: { $in: ids } });
    if (found !== count)
      throw new Error(`Seed verification failed for ${name}`);
    checks.push({ model: name, sampleRecords: found });
  }
  const report = {
    dataset: namespace,
    createdFor: "Explicitly requested fictional sample data",
    anchorDate: today,
    verified: true,
    checks,
    notes: [
      "Existing records, accounts and company settings preserved.",
      "Sample employee accounts are inactive and have no assigned passwords.",
      "Financial records are draft/requested; no payroll release, payment or email was performed.",
      "Approval workflows/delegations and legal letter templates are inactive until explicitly configured.",
      "Payslip, recovery and finalized payroll ledgers require their real approval lifecycle; they are not fabricated.",
    ],
  };
  await meta.updateOne(
    { _id: namespace },
    { $set: { verifiedAt: new Date(), checks } },
  );
  return report;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
    const report = await seedDemo();
    writeFileSync(
      resolve(root, "docs/demo-data-report.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
