import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const prompt = readFileSync("docs/audit-scope.md", "utf8");
const sources = {
  1: [
    "src/app.js",
    "src/modules/auth/recovery.js",
    "../frontend/src/features/recovery.jsx",
    "integration/setup.test.js",
  ],
  2: [
    "../frontend/src/main.jsx",
    "src/app.js",
    "integration/workflows.test.js",
  ],
  3: [
    "../frontend/src/main.jsx",
    "../frontend/src/features/profile.jsx",
    "src/modules/admin/routes.js",
    "integration/workflows.test.js",
  ],
  4: [
    "../frontend/src/organization.jsx",
    "src/models.js",
    "src/app.js",
  ],
  5: [
    "../frontend/src/features/attendance.jsx",
    "src/modules/attendance/routes.js",
    "test/attendance.test.js",
  ],
  6: [
    "../frontend/src/features/attendance.jsx",
    "src/modules/attendance/models.js",
    "src/modules/attendance/engine.js",
  ],
  7: [
    "../frontend/src/leaves.jsx",
    "src/leaves.js",
    "test/leave.test.js",
    "integration/workflows.test.js",
  ],
  8: [
    "../frontend/src/features/operations.jsx",
    "src/modules/operations/routes.js",
  ],
  9: [
    "../frontend/src/features/payroll.jsx",
    "src/modules/payroll/routes.js",
    "test/payroll.test.js",
    "integration/full-workflows.test.js",
  ],
  10: [
    "../frontend/src/features/payroll.jsx",
    "src/modules/payroll/routes.js",
    "integration/full-workflows.test.js",
  ],
  11: [
    "../frontend/src/features/profile.jsx",
    "../frontend/src/features/attendance.jsx",
    "../frontend/src/features/operations.jsx",
    "integration/full-workflows.test.js",
  ],
  12: [
    "../frontend/src/features/operations.jsx",
    "src/modules/operations/routes.js",
    "integration/full-workflows.test.js",
  ],
  13: [
    "../frontend/src/features/operations.jsx",
    "src/modules/operations/routes.js",
    "integration/full-workflows.test.js",
  ],
  15: [
    "../frontend/src/features/operations.jsx",
    "src/modules/hr/routes.js",
    "integration/full-workflows.test.js",
  ],
  16: [
    "../frontend/src/features/operations.jsx",
    "src/modules/hr/routes.js",
    "integration/full-workflows.test.js",
  ],
  17: [
    "../frontend/src/features/operations.jsx",
    "src/modules/hr/routes.js",
    "integration/full-workflows.test.js",
  ],
  19: [
    "../frontend/src/features/operations.jsx",
    "src/modules/documents/routes.js",
    "integration/full-workflows.test.js",
  ],
  20: [
    "../frontend/src/features/operations.jsx",
    "src/modules/hr/routes.js",
    "integration/full-workflows.test.js",
  ],
  23: [
    "../frontend/src/features/operations.jsx",
    "src/modules/operations/routes.js",
    "integration/full-workflows.test.js",
  ],
  24: [
    "../frontend/src/features/operations.jsx",
    "src/modules/operations/routes.js",
    "integration/full-workflows.test.js",
  ],
  26: [
    "../frontend/src/features/operations.jsx",
    "src/modules/hr/routes.js",
    "integration/full-workflows.test.js",
  ],
  27: [
    "../frontend/src/features/admin.jsx",
    "src/modules/admin/routes.js",
    "integration/full-workflows.test.js",
  ],
  29: [
    "../frontend/src/components/NotificationCenter.jsx",
    "src/modules/operations/routes.js",
    "src/modules/auth/recovery.js",
  ],
  30: [
    "../frontend/src/features/admin.jsx",
    "src/modules/admin/routes.js",
    "src/shared/scope.js",
  ],
  31: [
    "../frontend/src/features/admin.jsx",
    "../frontend/src/organization.jsx",
    "src/modules/operations/routes.js",
  ],
  32: [
    "src/app.js",
    "src/modules/documents/routes.js",
    "src/shared/scope.js",
    "integration/full-workflows.test.js",
  ],
};
const working = {
  1: "Login|Logout|Change Password|Account Activation|Account Deactivation|Session Management|Role-Based Login|User Profile|Login Activity Logs|Password Security|User Permissions",
  2: "Total Employees|Present Employees|Pending Approvals|Employee Statistics|Recent Activities|Dashboard Notifications",
  3: "Add Employee|Edit Employee|View Employee|Deactivate Employee|Employee Directory|Employee ID Generation|Employee Profile|Personal Information|Professional Information|Contact Information|Emergency Contact|Employment Details|Reporting Manager Assignment|Department Assignment|Designation Assignment|Branch Assignment|Employee Status|Employee Search|Employee Filters|Employee Export|Employee Documents",
  4: "Add Department|Edit Department|Deactivate Department|Add Designation|Edit Designation|Employee Designation Assignment|Branch Management",
  5: "Employee Punch In|Employee Punch Out|Live Attendance Status|Daily Attendance|Monthly Attendance|Working Hours Calculation|Break Time Tracking|Late Arrival Tracking|Early Departure Tracking|Half-Day Attendance|Overtime Calculation|Missing Punch Detection|Attendance Regularization|Attendance Approval|Manual Attendance Correction|Holiday Attendance|Weekly Off Attendance|Night Shift Attendance|Attendance Reports|Department Attendance|Employee Attendance History|Attendance Export",
  6: "Add Shift|Edit Shift|Delete / Deactivate Shift|Shift Assignment|Shift Scheduling|Night Shifts|Grace Period Settings|Weekly Off Settings|Shift History",
  7: "Leave Type Management|Casual Leave|Sick Leave|Earned Leave|Unpaid Leave|Compensatory Off|Maternity / Paternity Leave|Leave Application|Leave Approval|Leave Rejection|Leave Cancellation|Leave Balance|Leave History|Leave Policy Configuration|Leave Reports|Leave Notifications",
  8: "Add Holiday|Edit Holiday|Company Holidays|Optional Holidays|Branch-Wise Holidays",
  9: "Salary Structure Creation|Employee Salary Assignment|Basic Salary|HRA|Allowances|Salary Deductions|Loss of Pay|Monthly Payroll Processing|Payroll Preview|Payroll Approval|Payroll Locking|Payroll History|Payroll Reports|Salary Register|Payment Status Tracking",
  10: "Generate Payslip|Download Payslip PDF|Monthly Payslip History|Employee Payslip Access|Salary Breakdown|Earnings Summary|Deduction Summary|Net Salary|Payslip Template|Company Branding|Bulk Payslip Generation",
  11: "Employee Dashboard|View Profile|Update Permitted Profile Details|Punch In / Out|Attendance History|Attendance Regularization|Apply Leave|Leave Balance|Leave History|Download Payslip|View Holiday Calendar|Upload Documents|View Tasks|Submit Daily Report|Raise HR Ticket|View Announcements|Personal Notifications|Change Password",
  12: "Create Daily Report|Save Draft|Submit Daily Report|Daily Task Description|Work Hours|Daily Work Summary|Manager Review|Report History|Department Reports|Mandatory Report Before Punch Out (Configurable)",
  13: "Create Task|Assign Task|Task Priority|Task Deadline|Task Status|Task Comments|Employee Task List|Manager Task Overview|Completed Tasks|Task Notifications",
  15: "Job Opening Creation|Job Vacancy Management|Candidate Database|Candidate Application|Candidate Screening|Interview Scheduling|Interview Feedback|Candidate Status|Hiring Pipeline|Candidate Selection|Candidate Rejection|Candidate-to-Employee Conversion|Recruitment Reports",
  16: "New Joiner Registration|Onboarding Checklist|Document Collection|Document Verification|Employee Account Creation|Department Allocation|Manager Allocation|Shift Allocation|Salary Assignment|Asset Allocation|Onboarding Status",
  17: "KPI Management|Employee Goal Setting|Performance Review Cycle|Self-Appraisal|Manager Appraisal|Performance Rating|Performance Feedback|Appraisal History|Performance Reports",
  19: "Upload Employee Documents|View Documents|Download Documents|Document Categories|Document Verification|Document Approval|Document Version History|Secure Document Access",
  20: "Add Asset|Asset Categories|Asset Inventory|Asset Assignment|Asset Return|Asset Reassignment|Asset Condition|Asset Warranty Tracking|Asset History|Employee Asset List|Asset Clearance During Exit",
  23: "Create HR Ticket|Ticket Categories|Ticket Priority|Ticket Assignment|Ticket Status|Ticket Comments|Ticket Resolution|Ticket History",
  24: "Create Announcement|Department Announcements|Company-Wide Announcements|Scheduled Announcements|Important Notices|Policy Announcements|Employee Acknowledgement|Announcement History",
  26: "Resignation Request|Resignation Approval|Notice Period Tracking|Last Working Day|Asset Clearance|Employee Deactivation|Exit History|Exit Reports",
  27: "Employee Master Report|Department Report|Headcount Report|Daily Attendance Report|Monthly Attendance Report|Leave Report|Payroll Report|Salary Register|Recruitment Report|Performance Report|Task Report|Daily Work Report|Asset Report|Custom Date Filters|CSV Export",
  29: "In-App Notifications|Leave Notifications|Payroll Notifications|Payslip Notifications|Read / Unread Notifications",
  30: "Super Admin|HR Manager|Finance / Payroll|Department Manager|Team Leader|Employee|Custom Role Creation|Permission Assignment|Module Access Control|API Permission Control|Department-Level Access|Branch-Level Access|Employee Data Privacy|Payroll Data Privacy|Document Access Restrictions|Permission Audit Logs",
  31: "Company Profile|Company Address|Branch Settings|Department Settings|Designation Settings|Shift Policies|Attendance Policies|Leave Policies|Holiday Settings|Timezone Configuration",
  32: "Authentication Security|Session Security|Role-Based Authorization|API Security|Input Validation|Sensitive Data Encryption|Audit Logs|Login Logs|Activity Logs|Error Logs|Data Export|File Upload Security|Rate Limiting|Environment Configuration|Production Build Verification",
};
const partial = {
  2: "Super Admin Dashboard|Admin Dashboard|HR Dashboard|Manager Dashboard|Team Leader Dashboard|Finance Dashboard|Employee Dashboard|Payroll Summary|Upcoming Holidays|Birthdays & Anniversaries|Attendance Charts",
  3: "Employee History",
  4: "Office Location Management|Organizational Hierarchy",
  5: "Attendance Calendar|Absent Marking",
  6: "Break Policy|Overtime Policy",
  7: "Leave Calendar|Leave Cancellation",
  8: "Holiday Calendar|National Holidays|Weekly Off Configuration",
  9: "Incentives|Bonuses|Salary Arrears|Loan Deductions|Full & Final Settlement",
  12: "Edit Draft Report|Work Status|Report Approval",
  13: "Task Progress|Overdue Tasks|Task History",
  16: "Policy Acknowledgement|Probation Period Tracking",
  19: "Document Expiry Tracking",
  20: "Asset Maintenance|Warranty Tracking",
  23: "HR Support Dashboard",
  24: "Edit Announcement",
  26: "Handover Checklist|No-Dues Clearance|Full & Final Settlement",
  27: "Leave Balance Report|Late Attendance Report|Overtime Report|Department Filters|Branch Filters",
  29: "Email Notifications",
  30: "Page Access Control",
  31: "Payroll Settings|Email Configuration|Document Templates",
  32: "Data Import / Export|Data Archival|System Health Monitoring|Database Optimization",
};
const blocked = {
  1: "Forgot Password|Reset Password",
  5: "Optional Biometric Integration",
  9: "PF Calculation|ESI Calculation|Professional Tax|TDS",
  10: "Payslip Email Notification",
  31: "Tax Configuration|Email Configuration",
  32: "HTTPS Configuration",
};
// Explicit updates tied to integrated workflows; no automatic status inference from a UI label.
const implemented = {
  1: "Multi-Factor Authentication",
  4: "Department Head Assignment|Department Employee List|Department Hierarchy|Designation Levels",
  3: "Employee Bulk Import",
  5: "Attendance Calendar|Work From Home Attendance",
  6: "Shift Swap Requests|Shift Calendar",
  7: "Leave Cancellation|Leave Accrual|Leave Encashment|Half-Day Leave|Leave Calendar|Multi-Level Leave Approval",
  8: "Remove Holiday|Holiday Calendar|National Holidays|Weekly Off Configuration|Holiday Notifications",
  9: "Overtime Payment|Incentives|Bonuses|Salary Arrears|Salary Advances|Loan Deductions|Bank Payment Statement|Full & Final Settlement",
  10: "Bulk Payslip Generation|Company Branding",
  12: "Edit Draft Report|Work Status|Project Linking|Report Approval|Report Rejection|Missing Report Tracking",
  13: "Edit Task|Delete / Archive Task|Task Attachments|Task History",
  14: "Project Creation|Project Assignment|Department Allocation|Employee Allocation|Project Status|Project Start / End Dates|Project Tasks|Timesheet Entry|Timesheet Approval|Billable Hours|Non-Billable Hours|Project Work Reports",
  15: "Resume Upload|Offer Letter",
  16: "Offer Letter|Appointment Letter",
  17: "360-Degree Feedback|Performance Improvement Plan|Increment Recommendation|Promotion Recommendation",
  18: "Training Program Creation|Training Calendar|Employee Training Assignment|Training Attendance|Course Management|Skill Management|Skill Gap Analysis|Training Progress|Training Assessment|Certifications|Training Feedback|Training Reports",
  19: "Document Expiry Tracking|Offer Letter Generation|Appointment Letter Generation|Experience Letter Generation|Relieving Letter Generation",
  20: "Edit Asset|Asset Maintenance",
  21: "Expense Claim Creation|Expense Categories|Receipt Upload|Expense Approval|Expense Rejection|Expense Policy|Travel Reimbursement|Medical Reimbursement|Payment Tracking|Expense History|Expense Reports",
  22: "Travel Request|Travel Approval|Travel Planning|Travel Advances|Travel Expenses|Travel Settlement|Employee Visit Tracking|Travel History|Travel Reports",
  23: "Ticket Attachments|Ticket Escalation",
  24: "Edit Announcement|Delete / Archive Announcement",
  25: "Employee Surveys|Feedback Forms|Employee Recognition|Employee Rewards|Employee Suggestions|Satisfaction Surveys|Engagement Reports",
  26: "Leave Adjustment|Full & Final Settlement|Relieving Letter|Experience Letter|Exit Interview",
  27: "Expense Report|Leave Balance Report|Excel Export|PDF Export",
  28: "Approval Workflow Configuration|Multi-Level Approvals|Reporting Manager Approval|HR Approval|Finance Approval|Approval Delegation|Pending Approval Dashboard|Approval Rejection|Approval History|Escalation Rules",
  29: "Missing Punch Alerts|Daily Report Reminders|Birthday Reminders|Work Anniversary Reminders|Document Expiry Alerts|Task Deadline Alerts|Notification Preferences",
  30: "Admin",
  31: "Notification Settings|Document Templates|Company Logo|Financial Year",
  32: "Data Import / Export",
};
const verifiedPartial = {
  2: "Absent Employees|On Leave Employees|Late Employees|Attendance Charts|Payroll Summary|Upcoming Holidays|Birthdays & Anniversaries",
  6: "Rotational Shifts",
  7: "Leave Carry Forward",
  14: "Employee Utilization",
  17: "KRA Management",
  27: "Employee Attrition Report",
  28: "Approval Notifications",
  29: "Attendance Reminders",
  32: "Backup & Restore",
};
// These features exist only in part or need separate delivery adapters; do not call them Working.
partial[10] = "";
blocked[10] = "Payslip Email Notification";
blocked[29] = "Email Notifications";
for (const [number, names] of Object.entries(implemented)) {
  const selected = names.split("|");
  working[number] = [working[number], names].filter(Boolean).join("|");
  partial[number] = (partial[number] || "")
    .split("|")
    .filter((name) => !selected.includes(name))
    .join("|");
}
for (const [number, names] of Object.entries(verifiedPartial))
  partial[number] = [partial[number], names].filter(Boolean).join("|");
const extraEvidence = {
  4: [
    "src/modules/admin/completion.js",
    "../frontend/src/organization.jsx",
    "integration/final-lifecycle.test.js",
  ],
  8: [
    "src/modules/operations/reminders.js",
    "integration/final-lifecycle.test.js",
  ],
  10: [
    "src/modules/payroll/payslip.js",
    "src/shared/zip.js",
    "integration/loans-settlement.test.js",
  ],
  23: [
    "src/modules/admin/completion.js",
    "integration/final-lifecycle.test.js",
  ],
  26: [
    "src/modules/admin/completion.js",
    "integration/final-lifecycle.test.js",
    "integration/loans-settlement.test.js",
  ],
  31: [
    "src/modules/admin/completion.js",
    "integration/final-lifecycle.test.js",
  ],
  1: [
    "src/modules/auth/mfa.js",
    "integration/security-lifecycle.test.js",
  ],
  2: [
    "src/modules/dashboard/insights.js",
    "../frontend/src/features/dashboard-insights.jsx",
  ],
  3: [
    "src/modules/admin/imports.js",
    "integration/advanced.test.js",
  ],
  6: [
    "src/modules/attendance/swaps.js",
    "../frontend/src/features/shift-swaps.jsx",
    "integration/final-lifecycle.test.js",
  ],
  7: [
    "src/modules/leave/balances.js",
    "src/modules/leave/management.js",
    "integration/advanced.test.js",
    "integration/final-lifecycle.test.js",
  ],
  9: [
    "src/modules/payroll/finance.js",
    "src/modules/payroll/loans.js",
    "src/modules/payroll/settlements.js",
    "integration/loans-settlement.test.js",
  ],
  14: [
    "src/modules/extended/projects.js",
    "../frontend/src/features/extended.jsx",
    "integration/extended.test.js",
  ],
  17: [
    "src/modules/hr/growth.js",
    "../frontend/src/features/growth.jsx",
    "integration/final-lifecycle.test.js",
  ],
  18: [
    "src/modules/extended/training.js",
    "../frontend/src/features/extended.jsx",
    "integration/extended.test.js",
  ],
  19: [
    "src/modules/documents/letters.js",
    "integration/advanced.test.js",
  ],
  20: [
    "src/modules/hr/assets.js",
    "integration/final-lifecycle.test.js",
  ],
  21: [
    "src/modules/extended/expenses.js",
    "../frontend/src/features/extended.jsx",
    "integration/extended.test.js",
  ],
  22: [
    "src/modules/extended/expenses.js",
    "../frontend/src/features/extended.jsx",
    "integration/extended.test.js",
  ],
  25: [
    "src/modules/extended/engagement.js",
    "../frontend/src/features/extended.jsx",
    "integration/extended.test.js",
  ],
  27: [
    "src/modules/admin/exports.js",
    "integration/advanced.test.js",
  ],
  28: [
    "src/modules/approvals/index.js",
    "../frontend/src/features/extended.jsx",
    "integration/extended.test.js",
  ],
  29: [
    "src/modules/operations/reminders.js",
    "../frontend/src/features/notification-preferences.jsx",
    "integration/advanced.test.js",
  ],
  32: [
    "scripts/backup.mjs",
    "scripts/production-check.mjs",
    "integration/backup.test.js",
    "deploy/nginx.conf.example",
  ],
};
for (const [number, files] of Object.entries(extraEvidence))
  sources[number] = [...(sources[number] || []), ...files];
const modules = [];
let current;
for (const line of prompt.split(/\r?\n/)) {
  const match = line.match(/^## (\d+)\. (.+)$/);
  if (match) {
    current = { number: +match[1], name: match[2], functions: [] };
    modules.push(current);
  } else if (current && line.startsWith("- ")) {
    const name = line.slice(2).trim();
    const has = (map) => map[current.number]?.split("|").includes(name);
    const status = has(blocked)
      ? "Blocked"
      : has(partial)
        ? "Partially Working"
        : has(working)
          ? "Working"
          : "Missing";
    current.functions.push({
      name,
      status,
      evidence: sources[current.number] || [],
      note:
        status === "Blocked"
          ? current.number === 9 || name === "Tax Configuration"
            ? "Statutory rule engine and jurisdiction-specific policy inputs are not implemented or verified. Approved rates, applicability, limits and legal review are required."
            : "Requires configured SMTP delivery, biometric hardware adapter or dedicated HTTPS domain and operator verification. See docs/deployment.md; external integrations have not been verified."
          : status === "Working"
            ? "Implemented path present; module integration checks cover its core workflow. Fine-grained UI coverage is tracked separately."
            : status === "Partially Working"
              ? "Supporting models/routes exist, but the complete requested behavior or verification is incomplete."
              : "No complete connected implementation found at this audit checkpoint.",
    });
  }
}
mkdirSync("docs", { recursive: true });
const totals = {};
for (const module of modules)
  for (const fn of module.functions)
    totals[fn.status] = (totals[fn.status] || 0) + 1;
writeFileSync(
  "docs/function-audit.json",
  JSON.stringify(
    {
      checkpoint:
        "2026-11-02 implementation audit; updated as verification proceeds",
      totals,
      modules,
    },
    null,
    2,
  ),
);
let output =
  "# ABCO HRMS — function-by-function audit\n\nThis is a source and verification checkpoint, not a declaration of production readiness. Working means a connected implementation exists and the core module workflow has passed integration checks; it does not imply every optional edge case has been verified. Blocked records require external services, hardware or statutory engine implementation with approved policy. Missing and partial records remain implementation work.\n\n";
output +=
  "Status counts: " +
  Object.entries(totals)
    .map(([key, value]) => `${key}: ${value}`)
    .join(" · ") +
  "\n\n";
for (const module of modules) {
  output += `## ${module.number}. ${module.name}\n\n`;
  if (sources[module.number])
    output +=
      "Evidence: " +
      sources[module.number].map((file) => `[${file}](../${file})`).join(", ") +
      ".\n\n";
  output += "| Function | Status |\n| --- | --- |\n";
  for (const fn of module.functions)
    output += `| ${fn.name} | ${fn.status} |\n`;
  output += "\n";
}
output +=
  "\n## Remaining scope\n\nPartial entries still require additional implementation or verification. The backup utility verifies isolated reconstruction, while live cutover, retention and a deployment recovery drill remain operator work. Statutory payroll engines, SMTP delivery and HTTPS are not certified. See [release status](release-status.md) and [deployment](deployment.md).\n";
writeFileSync("docs/function-audit.md", output);
console.log(JSON.stringify({ modules: modules.length, totals }));
