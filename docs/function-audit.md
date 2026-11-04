# ABCO HRMS — function-by-function audit

This is a source and verification checkpoint, not a declaration of production readiness. Working means a connected implementation exists and the core module workflow has passed integration checks; it does not imply every optional edge case has been verified. Blocked records require external services, hardware or statutory engine implementation with approved policy. Missing and partial records remain implementation work.

Status counts: Working: 436 · Blocked: 12 · Partially Working: 45

## 1. Authentication & User Management

Evidence: [backend/src/app.js](../backend/src/app.js), [backend/src/modules/auth/recovery.js](../backend/src/modules/auth/recovery.js), [frontend/src/features/recovery.jsx](../frontend/src/features/recovery.jsx), [backend/integration/setup.test.js](../backend/integration/setup.test.js), [backend/src/modules/auth/mfa.js](../backend/src/modules/auth/mfa.js), [backend/integration/security-lifecycle.test.js](../backend/integration/security-lifecycle.test.js).

| Function                    | Status  |
| --------------------------- | ------- |
| Login                       | Working |
| Logout                      | Working |
| Forgot Password             | Blocked |
| Reset Password              | Blocked |
| Change Password             | Working |
| Account Activation          | Working |
| Account Deactivation        | Working |
| Session Management          | Working |
| Role-Based Login            | Working |
| Multi-Factor Authentication | Working |
| User Profile                | Working |
| Login Activity Logs         | Working |
| Password Security           | Working |
| User Permissions            | Working |

## 2. Dashboard Management

Evidence: [frontend/src/main.jsx](../frontend/src/main.jsx), [backend/src/app.js](../backend/src/app.js), [backend/integration/workflows.test.js](../backend/integration/workflows.test.js), [backend/src/modules/dashboard/insights.js](../backend/src/modules/dashboard/insights.js), [frontend/src/features/dashboard-insights.jsx](../frontend/src/features/dashboard-insights.jsx).

| Function                  | Status            |
| ------------------------- | ----------------- |
| Super Admin Dashboard     | Partially Working |
| Admin Dashboard           | Partially Working |
| HR Dashboard              | Partially Working |
| Manager Dashboard         | Partially Working |
| Team Leader Dashboard     | Partially Working |
| Finance Dashboard         | Partially Working |
| Employee Dashboard        | Partially Working |
| Total Employees           | Working           |
| Present Employees         | Working           |
| Absent Employees          | Partially Working |
| On Leave Employees        | Partially Working |
| Late Employees            | Partially Working |
| Pending Approvals         | Working           |
| Employee Statistics       | Working           |
| Attendance Charts         | Partially Working |
| Payroll Summary           | Partially Working |
| Upcoming Holidays         | Partially Working |
| Birthdays & Anniversaries | Partially Working |
| Recent Activities         | Working           |
| Dashboard Notifications   | Working           |

## 3. Employee Management

Evidence: [frontend/src/main.jsx](../frontend/src/main.jsx), [frontend/src/features/profile.jsx](../frontend/src/features/profile.jsx), [backend/src/modules/admin/routes.js](../backend/src/modules/admin/routes.js), [backend/integration/workflows.test.js](../backend/integration/workflows.test.js), [backend/src/modules/admin/imports.js](../backend/src/modules/admin/imports.js), [backend/integration/advanced.test.js](../backend/integration/advanced.test.js).

| Function                     | Status            |
| ---------------------------- | ----------------- |
| Add Employee                 | Working           |
| Edit Employee                | Working           |
| View Employee                | Working           |
| Deactivate Employee          | Working           |
| Employee Directory           | Working           |
| Employee ID Generation       | Working           |
| Employee Profile             | Working           |
| Personal Information         | Working           |
| Professional Information     | Working           |
| Contact Information          | Working           |
| Emergency Contact            | Working           |
| Employment Details           | Working           |
| Reporting Manager Assignment | Working           |
| Department Assignment        | Working           |
| Designation Assignment       | Working           |
| Branch Assignment            | Working           |
| Employee Status              | Working           |
| Employee Search              | Working           |
| Employee Filters             | Working           |
| Employee Bulk Import         | Working           |
| Employee Export              | Working           |
| Employee Documents           | Working           |
| Employee History             | Partially Working |

## 4. Department & Designation Management

Evidence: [frontend/src/organization.jsx](../frontend/src/organization.jsx), [backend/src/models.js](../backend/src/models.js), [backend/src/app.js](../backend/src/app.js), [backend/src/modules/admin/completion.js](../backend/src/modules/admin/completion.js), [frontend/src/organization.jsx](../frontend/src/organization.jsx), [backend/integration/final-lifecycle.test.js](../backend/integration/final-lifecycle.test.js).

| Function                        | Status            |
| ------------------------------- | ----------------- |
| Add Department                  | Working           |
| Edit Department                 | Working           |
| Deactivate Department           | Working           |
| Department Head Assignment      | Working           |
| Department Employee List        | Working           |
| Department Hierarchy            | Working           |
| Add Designation                 | Working           |
| Edit Designation                | Working           |
| Designation Levels              | Working           |
| Employee Designation Assignment | Working           |
| Branch Management               | Working           |
| Office Location Management      | Partially Working |
| Organizational Hierarchy        | Partially Working |

## 5. Attendance Management

Evidence: [frontend/src/features/attendance.jsx](../frontend/src/features/attendance.jsx), [backend/src/modules/attendance/routes.js](../backend/src/modules/attendance/routes.js), [backend/test/attendance.test.js](../backend/test/attendance.test.js).

| Function                       | Status            |
| ------------------------------ | ----------------- |
| Employee Punch In              | Working           |
| Employee Punch Out             | Working           |
| Live Attendance Status         | Working           |
| Attendance Calendar            | Working           |
| Daily Attendance               | Working           |
| Monthly Attendance             | Working           |
| Working Hours Calculation      | Working           |
| Break Time Tracking            | Working           |
| Late Arrival Tracking          | Working           |
| Early Departure Tracking       | Working           |
| Half-Day Attendance            | Working           |
| Absent Marking                 | Partially Working |
| Overtime Calculation           | Working           |
| Missing Punch Detection        | Working           |
| Attendance Regularization      | Working           |
| Attendance Approval            | Working           |
| Manual Attendance Correction   | Working           |
| Work From Home Attendance      | Working           |
| Holiday Attendance             | Working           |
| Weekly Off Attendance          | Working           |
| Night Shift Attendance         | Working           |
| Attendance Reports             | Working           |
| Department Attendance          | Working           |
| Employee Attendance History    | Working           |
| Attendance Export              | Working           |
| Optional Biometric Integration | Blocked           |

## 6. Shift Management

Evidence: [frontend/src/features/attendance.jsx](../frontend/src/features/attendance.jsx), [backend/src/modules/attendance/models.js](../backend/src/modules/attendance/models.js), [backend/src/modules/attendance/engine.js](../backend/src/modules/attendance/engine.js), [backend/src/modules/attendance/swaps.js](../backend/src/modules/attendance/swaps.js), [frontend/src/features/shift-swaps.jsx](../frontend/src/features/shift-swaps.jsx), [backend/integration/final-lifecycle.test.js](../backend/integration/final-lifecycle.test.js).

| Function                  | Status            |
| ------------------------- | ----------------- |
| Add Shift                 | Working           |
| Edit Shift                | Working           |
| Delete / Deactivate Shift | Working           |
| Shift Assignment          | Working           |
| Shift Scheduling          | Working           |
| Rotational Shifts         | Partially Working |
| Night Shifts              | Working           |
| Shift Swap Requests       | Working           |
| Shift Calendar            | Working           |
| Grace Period Settings     | Working           |
| Weekly Off Settings       | Working           |
| Break Policy              | Partially Working |
| Overtime Policy           | Partially Working |
| Shift History             | Working           |

## 7. Leave Management

Evidence: [frontend/src/leaves.jsx](../frontend/src/leaves.jsx), [backend/src/leaves.js](../backend/src/leaves.js), [backend/test/leave.test.js](../backend/test/leave.test.js), [backend/integration/workflows.test.js](../backend/integration/workflows.test.js), [backend/src/modules/leave/balances.js](../backend/src/modules/leave/balances.js), [backend/src/modules/leave/management.js](../backend/src/modules/leave/management.js), [backend/integration/advanced.test.js](../backend/integration/advanced.test.js), [backend/integration/final-lifecycle.test.js](../backend/integration/final-lifecycle.test.js).

| Function                    | Status            |
| --------------------------- | ----------------- |
| Leave Type Management       | Working           |
| Casual Leave                | Working           |
| Sick Leave                  | Working           |
| Earned Leave                | Working           |
| Unpaid Leave                | Working           |
| Compensatory Off            | Working           |
| Maternity / Paternity Leave | Working           |
| Leave Application           | Working           |
| Leave Approval              | Working           |
| Leave Rejection             | Working           |
| Leave Cancellation          | Working           |
| Leave Balance               | Working           |
| Leave Accrual               | Working           |
| Leave Carry Forward         | Partially Working |
| Leave Encashment            | Working           |
| Half-Day Leave              | Working           |
| Leave Calendar              | Working           |
| Leave History               | Working           |
| Multi-Level Leave Approval  | Working           |
| Leave Policy Configuration  | Working           |
| Leave Reports               | Working           |
| Leave Notifications         | Working           |

## 8. Holiday Management

Evidence: [frontend/src/features/operations.jsx](../frontend/src/features/operations.jsx), [backend/src/modules/operations/routes.js](../backend/src/modules/operations/routes.js), [backend/src/modules/operations/reminders.js](../backend/src/modules/operations/reminders.js), [backend/integration/final-lifecycle.test.js](../backend/integration/final-lifecycle.test.js).

| Function                 | Status  |
| ------------------------ | ------- |
| Add Holiday              | Working |
| Edit Holiday             | Working |
| Remove Holiday           | Working |
| Holiday Calendar         | Working |
| National Holidays        | Working |
| Company Holidays         | Working |
| Optional Holidays        | Working |
| Branch-Wise Holidays     | Working |
| Weekly Off Configuration | Working |
| Holiday Notifications    | Working |

## 9. Payroll Management

Evidence: [frontend/src/features/payroll.jsx](../frontend/src/features/payroll.jsx), [backend/src/modules/payroll/routes.js](../backend/src/modules/payroll/routes.js), [backend/test/payroll.test.js](../backend/test/payroll.test.js), [backend/integration/full-workflows.test.js](../backend/integration/full-workflows.test.js), [backend/src/modules/payroll/finance.js](../backend/src/modules/payroll/finance.js), [backend/src/modules/payroll/loans.js](../backend/src/modules/payroll/loans.js), [backend/src/modules/payroll/settlements.js](../backend/src/modules/payroll/settlements.js), [backend/integration/loans-settlement.test.js](../backend/integration/loans-settlement.test.js).

| Function                   | Status  |
| -------------------------- | ------- |
| Salary Structure Creation  | Working |
| Employee Salary Assignment | Working |
| Basic Salary               | Working |
| HRA                        | Working |
| Allowances                 | Working |
| Salary Deductions          | Working |
| PF Calculation             | Blocked |
| ESI Calculation            | Blocked |
| Professional Tax           | Blocked |
| TDS                        | Blocked |
| Overtime Payment           | Working |
| Loss of Pay                | Working |
| Incentives                 | Working |
| Bonuses                    | Working |
| Salary Arrears             | Working |
| Salary Advances            | Working |
| Loan Deductions            | Working |
| Monthly Payroll Processing | Working |
| Payroll Preview            | Working |
| Payroll Approval           | Working |
| Payroll Locking            | Working |
| Payroll History            | Working |
| Payroll Reports            | Working |
| Salary Register            | Working |
| Bank Payment Statement     | Working |
| Payment Status Tracking    | Working |
| Full & Final Settlement    | Working |

## 10. Salary Slip Management

Evidence: [frontend/src/features/payroll.jsx](../frontend/src/features/payroll.jsx), [backend/src/modules/payroll/routes.js](../backend/src/modules/payroll/routes.js), [backend/integration/full-workflows.test.js](../backend/integration/full-workflows.test.js), [backend/src/modules/payroll/payslip.js](../backend/src/modules/payroll/payslip.js), [backend/src/shared/zip.js](../backend/src/shared/zip.js), [backend/integration/loans-settlement.test.js](../backend/integration/loans-settlement.test.js).

| Function                   | Status  |
| -------------------------- | ------- |
| Generate Payslip           | Working |
| Download Payslip PDF       | Working |
| Monthly Payslip History    | Working |
| Employee Payslip Access    | Working |
| Salary Breakdown           | Working |
| Earnings Summary           | Working |
| Deduction Summary          | Working |
| Net Salary                 | Working |
| Payslip Template           | Working |
| Company Branding           | Working |
| Payslip Email Notification | Blocked |
| Bulk Payslip Generation    | Working |

## 11. Employee Self-Service

Evidence: [frontend/src/features/profile.jsx](../frontend/src/features/profile.jsx), [frontend/src/features/attendance.jsx](../frontend/src/features/attendance.jsx), [frontend/src/features/operations.jsx](../frontend/src/features/operations.jsx), [backend/integration/full-workflows.test.js](../backend/integration/full-workflows.test.js).

| Function                         | Status  |
| -------------------------------- | ------- |
| Employee Dashboard               | Working |
| View Profile                     | Working |
| Update Permitted Profile Details | Working |
| Punch In / Out                   | Working |
| Attendance History               | Working |
| Attendance Regularization        | Working |
| Apply Leave                      | Working |
| Leave Balance                    | Working |
| Leave History                    | Working |
| Download Payslip                 | Working |
| View Holiday Calendar            | Working |
| Upload Documents                 | Working |
| View Tasks                       | Working |
| Submit Daily Report              | Working |
| Raise HR Ticket                  | Working |
| View Announcements               | Working |
| Personal Notifications           | Working |
| Change Password                  | Working |

## 12. Daily Work Report Management

Evidence: [frontend/src/features/operations.jsx](../frontend/src/features/operations.jsx), [backend/src/modules/operations/routes.js](../backend/src/modules/operations/routes.js), [backend/integration/full-workflows.test.js](../backend/integration/full-workflows.test.js).

| Function                                         | Status  |
| ------------------------------------------------ | ------- |
| Create Daily Report                              | Working |
| Save Draft                                       | Working |
| Submit Daily Report                              | Working |
| Edit Draft Report                                | Working |
| Daily Task Description                           | Working |
| Work Hours                                       | Working |
| Work Status                                      | Working |
| Project Linking                                  | Working |
| Daily Work Summary                               | Working |
| Manager Review                                   | Working |
| Report Approval                                  | Working |
| Report Rejection                                 | Working |
| Report History                                   | Working |
| Department Reports                               | Working |
| Missing Report Tracking                          | Working |
| Mandatory Report Before Punch Out (Configurable) | Working |

## 13. Task Management

Evidence: [frontend/src/features/operations.jsx](../frontend/src/features/operations.jsx), [backend/src/modules/operations/routes.js](../backend/src/modules/operations/routes.js), [backend/integration/full-workflows.test.js](../backend/integration/full-workflows.test.js).

| Function              | Status            |
| --------------------- | ----------------- |
| Create Task           | Working           |
| Assign Task           | Working           |
| Edit Task             | Working           |
| Delete / Archive Task | Working           |
| Task Priority         | Working           |
| Task Deadline         | Working           |
| Task Status           | Working           |
| Task Comments         | Working           |
| Task Attachments      | Working           |
| Employee Task List    | Working           |
| Manager Task Overview | Working           |
| Task Progress         | Partially Working |
| Overdue Tasks         | Partially Working |
| Completed Tasks       | Working           |
| Task History          | Working           |
| Task Notifications    | Working           |

## 14. Project & Timesheet Management

Evidence: [backend/src/modules/extended/projects.js](../backend/src/modules/extended/projects.js), [frontend/src/features/extended.jsx](../frontend/src/features/extended.jsx), [backend/integration/extended.test.js](../backend/integration/extended.test.js).

| Function                  | Status            |
| ------------------------- | ----------------- |
| Project Creation          | Working           |
| Project Assignment        | Working           |
| Department Allocation     | Working           |
| Employee Allocation       | Working           |
| Project Status            | Working           |
| Project Start / End Dates | Working           |
| Project Tasks             | Working           |
| Timesheet Entry           | Working           |
| Timesheet Approval        | Working           |
| Billable Hours            | Working           |
| Non-Billable Hours        | Working           |
| Employee Utilization      | Partially Working |
| Project Work Reports      | Working           |

## 15. Recruitment Management

Evidence: [frontend/src/features/operations.jsx](../frontend/src/features/operations.jsx), [backend/src/modules/hr/routes.js](../backend/src/modules/hr/routes.js), [backend/integration/full-workflows.test.js](../backend/integration/full-workflows.test.js).

| Function                         | Status  |
| -------------------------------- | ------- |
| Job Opening Creation             | Working |
| Job Vacancy Management           | Working |
| Candidate Database               | Working |
| Candidate Application            | Working |
| Resume Upload                    | Working |
| Candidate Screening              | Working |
| Interview Scheduling             | Working |
| Interview Feedback               | Working |
| Candidate Status                 | Working |
| Hiring Pipeline                  | Working |
| Offer Letter                     | Working |
| Candidate Selection              | Working |
| Candidate Rejection              | Working |
| Candidate-to-Employee Conversion | Working |
| Recruitment Reports              | Working |

## 16. Employee Onboarding

Evidence: [frontend/src/features/operations.jsx](../frontend/src/features/operations.jsx), [backend/src/modules/hr/routes.js](../backend/src/modules/hr/routes.js), [backend/integration/full-workflows.test.js](../backend/integration/full-workflows.test.js).

| Function                  | Status            |
| ------------------------- | ----------------- |
| New Joiner Registration   | Working           |
| Onboarding Checklist      | Working           |
| Document Collection       | Working           |
| Document Verification     | Working           |
| Offer Letter              | Working           |
| Appointment Letter        | Working           |
| Employee Account Creation | Working           |
| Department Allocation     | Working           |
| Manager Allocation        | Working           |
| Shift Allocation          | Working           |
| Salary Assignment         | Working           |
| Asset Allocation          | Working           |
| Policy Acknowledgement    | Partially Working |
| Probation Period Tracking | Partially Working |
| Onboarding Status         | Working           |

## 17. Performance Management

Evidence: [frontend/src/features/operations.jsx](../frontend/src/features/operations.jsx), [backend/src/modules/hr/routes.js](../backend/src/modules/hr/routes.js), [backend/integration/full-workflows.test.js](../backend/integration/full-workflows.test.js), [backend/src/modules/hr/growth.js](../backend/src/modules/hr/growth.js), [frontend/src/features/growth.jsx](../frontend/src/features/growth.jsx), [backend/integration/final-lifecycle.test.js](../backend/integration/final-lifecycle.test.js).

| Function                     | Status            |
| ---------------------------- | ----------------- |
| KPI Management               | Working           |
| KRA Management               | Partially Working |
| Employee Goal Setting        | Working           |
| Performance Review Cycle     | Working           |
| Self-Appraisal               | Working           |
| Manager Appraisal            | Working           |
| Performance Rating           | Working           |
| 360-Degree Feedback          | Working           |
| Performance Feedback         | Working           |
| Appraisal History            | Working           |
| Performance Improvement Plan | Working           |
| Increment Recommendation     | Working           |
| Promotion Recommendation     | Working           |
| Performance Reports          | Working           |

## 18. Training & Development

Evidence: [backend/src/modules/extended/training.js](../backend/src/modules/extended/training.js), [frontend/src/features/extended.jsx](../frontend/src/features/extended.jsx), [backend/integration/extended.test.js](../backend/integration/extended.test.js).

| Function                     | Status  |
| ---------------------------- | ------- |
| Training Program Creation    | Working |
| Training Calendar            | Working |
| Employee Training Assignment | Working |
| Training Attendance          | Working |
| Course Management            | Working |
| Skill Management             | Working |
| Skill Gap Analysis           | Working |
| Training Progress            | Working |
| Training Assessment          | Working |
| Certifications               | Working |
| Training Feedback            | Working |
| Training Reports             | Working |

## 19. Document Management

Evidence: [frontend/src/features/operations.jsx](../frontend/src/features/operations.jsx), [backend/src/modules/documents/routes.js](../backend/src/modules/documents/routes.js), [backend/integration/full-workflows.test.js](../backend/integration/full-workflows.test.js), [backend/src/modules/documents/letters.js](../backend/src/modules/documents/letters.js), [backend/integration/advanced.test.js](../backend/integration/advanced.test.js).

| Function                      | Status  |
| ----------------------------- | ------- |
| Upload Employee Documents     | Working |
| View Documents                | Working |
| Download Documents            | Working |
| Document Categories           | Working |
| Document Verification         | Working |
| Document Approval             | Working |
| Document Expiry Tracking      | Working |
| Document Version History      | Working |
| Offer Letter Generation       | Working |
| Appointment Letter Generation | Working |
| Experience Letter Generation  | Working |
| Relieving Letter Generation   | Working |
| Secure Document Access        | Working |

## 20. Asset Management

Evidence: [frontend/src/features/operations.jsx](../frontend/src/features/operations.jsx), [backend/src/modules/hr/routes.js](../backend/src/modules/hr/routes.js), [backend/integration/full-workflows.test.js](../backend/integration/full-workflows.test.js), [backend/src/modules/hr/assets.js](../backend/src/modules/hr/assets.js), [backend/integration/final-lifecycle.test.js](../backend/integration/final-lifecycle.test.js).

| Function                    | Status            |
| --------------------------- | ----------------- |
| Add Asset                   | Working           |
| Edit Asset                  | Working           |
| Asset Categories            | Working           |
| Asset Inventory             | Working           |
| Asset Assignment            | Working           |
| Asset Return                | Working           |
| Asset Reassignment          | Working           |
| Asset Condition             | Working           |
| Asset Maintenance           | Working           |
| Warranty Tracking           | Partially Working |
| Asset History               | Working           |
| Employee Asset List         | Working           |
| Asset Clearance During Exit | Working           |

## 21. Expense & Reimbursement

Evidence: [backend/src/modules/extended/expenses.js](../backend/src/modules/extended/expenses.js), [frontend/src/features/extended.jsx](../frontend/src/features/extended.jsx), [backend/integration/extended.test.js](../backend/integration/extended.test.js).

| Function               | Status  |
| ---------------------- | ------- |
| Expense Claim Creation | Working |
| Expense Categories     | Working |
| Receipt Upload         | Working |
| Expense Approval       | Working |
| Expense Rejection      | Working |
| Expense Policy         | Working |
| Travel Reimbursement   | Working |
| Medical Reimbursement  | Working |
| Payment Tracking       | Working |
| Expense History        | Working |
| Expense Reports        | Working |

## 22. Travel & Visit Management

Evidence: [backend/src/modules/extended/expenses.js](../backend/src/modules/extended/expenses.js), [frontend/src/features/extended.jsx](../frontend/src/features/extended.jsx), [backend/integration/extended.test.js](../backend/integration/extended.test.js).

| Function                | Status  |
| ----------------------- | ------- |
| Travel Request          | Working |
| Travel Approval         | Working |
| Travel Planning         | Working |
| Travel Advances         | Working |
| Travel Expenses         | Working |
| Travel Settlement       | Working |
| Employee Visit Tracking | Working |
| Travel History          | Working |
| Travel Reports          | Working |

## 23. Employee Helpdesk

Evidence: [frontend/src/features/operations.jsx](../frontend/src/features/operations.jsx), [backend/src/modules/operations/routes.js](../backend/src/modules/operations/routes.js), [backend/integration/full-workflows.test.js](../backend/integration/full-workflows.test.js), [backend/src/modules/admin/completion.js](../backend/src/modules/admin/completion.js), [backend/integration/final-lifecycle.test.js](../backend/integration/final-lifecycle.test.js).

| Function             | Status            |
| -------------------- | ----------------- |
| Create HR Ticket     | Working           |
| Ticket Categories    | Working           |
| Ticket Priority      | Working           |
| Ticket Assignment    | Working           |
| Ticket Status        | Working           |
| Ticket Comments      | Working           |
| Ticket Attachments   | Working           |
| Ticket Escalation    | Working           |
| Ticket Resolution    | Working           |
| Ticket History       | Working           |
| HR Support Dashboard | Partially Working |

## 24. Announcements & Communication

Evidence: [frontend/src/features/operations.jsx](../frontend/src/features/operations.jsx), [backend/src/modules/operations/routes.js](../backend/src/modules/operations/routes.js), [backend/integration/full-workflows.test.js](../backend/integration/full-workflows.test.js).

| Function                      | Status  |
| ----------------------------- | ------- |
| Create Announcement           | Working |
| Edit Announcement             | Working |
| Delete / Archive Announcement | Working |
| Department Announcements      | Working |
| Company-Wide Announcements    | Working |
| Scheduled Announcements       | Working |
| Important Notices             | Working |
| Policy Announcements          | Working |
| Employee Acknowledgement      | Working |
| Announcement History          | Working |

## 25. Employee Engagement

Evidence: [backend/src/modules/extended/engagement.js](../backend/src/modules/extended/engagement.js), [frontend/src/features/extended.jsx](../frontend/src/features/extended.jsx), [backend/integration/extended.test.js](../backend/integration/extended.test.js).

| Function             | Status  |
| -------------------- | ------- |
| Employee Surveys     | Working |
| Feedback Forms       | Working |
| Employee Recognition | Working |
| Employee Rewards     | Working |
| Employee Suggestions | Working |
| Satisfaction Surveys | Working |
| Engagement Reports   | Working |

## 26. Exit & Offboarding Management

Evidence: [frontend/src/features/operations.jsx](../frontend/src/features/operations.jsx), [backend/src/modules/hr/routes.js](../backend/src/modules/hr/routes.js), [backend/integration/full-workflows.test.js](../backend/integration/full-workflows.test.js), [backend/src/modules/admin/completion.js](../backend/src/modules/admin/completion.js), [backend/integration/final-lifecycle.test.js](../backend/integration/final-lifecycle.test.js), [backend/integration/loans-settlement.test.js](../backend/integration/loans-settlement.test.js).

| Function                | Status            |
| ----------------------- | ----------------- |
| Resignation Request     | Working           |
| Resignation Approval    | Working           |
| Notice Period Tracking  | Working           |
| Last Working Day        | Working           |
| Exit Interview          | Working           |
| Handover Checklist      | Partially Working |
| Asset Clearance         | Working           |
| No-Dues Clearance       | Partially Working |
| Leave Adjustment        | Working           |
| Full & Final Settlement | Working           |
| Relieving Letter        | Working           |
| Experience Letter       | Working           |
| Employee Deactivation   | Working           |
| Exit History            | Working           |
| Exit Reports            | Working           |

## 27. Reports & Analytics

Evidence: [frontend/src/features/admin.jsx](../frontend/src/features/admin.jsx), [backend/src/modules/admin/routes.js](../backend/src/modules/admin/routes.js), [backend/integration/full-workflows.test.js](../backend/integration/full-workflows.test.js), [backend/src/modules/admin/exports.js](../backend/src/modules/admin/exports.js), [backend/integration/advanced.test.js](../backend/integration/advanced.test.js).

| Function                  | Status            |
| ------------------------- | ----------------- |
| Employee Master Report    | Working           |
| Department Report         | Working           |
| Headcount Report          | Working           |
| Daily Attendance Report   | Working           |
| Monthly Attendance Report | Working           |
| Late Attendance Report    | Partially Working |
| Overtime Report           | Partially Working |
| Leave Report              | Working           |
| Leave Balance Report      | Working           |
| Payroll Report            | Working           |
| Salary Register           | Working           |
| Recruitment Report        | Working           |
| Performance Report        | Working           |
| Task Report               | Working           |
| Daily Work Report         | Working           |
| Asset Report              | Working           |
| Expense Report            | Working           |
| Employee Attrition Report | Partially Working |
| Custom Date Filters       | Working           |
| Department Filters        | Partially Working |
| Branch Filters            | Partially Working |
| Excel Export              | Working           |
| CSV Export                | Working           |
| PDF Export                | Working           |

## 28. Workflow & Approval Management

Evidence: [backend/src/modules/approvals/index.js](../backend/src/modules/approvals/index.js), [frontend/src/features/extended.jsx](../frontend/src/features/extended.jsx), [backend/integration/extended.test.js](../backend/integration/extended.test.js).

| Function                        | Status            |
| ------------------------------- | ----------------- |
| Approval Workflow Configuration | Working           |
| Multi-Level Approvals           | Working           |
| Reporting Manager Approval      | Working           |
| HR Approval                     | Working           |
| Finance Approval                | Working           |
| Approval Delegation             | Working           |
| Approval Notifications          | Partially Working |
| Pending Approval Dashboard      | Working           |
| Approval Rejection              | Working           |
| Approval History                | Working           |
| Escalation Rules                | Working           |

## 29. Notifications & Reminders

Evidence: [frontend/src/components/NotificationCenter.jsx](../frontend/src/components/NotificationCenter.jsx), [backend/src/modules/operations/routes.js](../backend/src/modules/operations/routes.js), [backend/src/modules/auth/recovery.js](../backend/src/modules/auth/recovery.js), [backend/src/modules/operations/reminders.js](../backend/src/modules/operations/reminders.js), [frontend/src/features/notification-preferences.jsx](../frontend/src/features/notification-preferences.jsx), [backend/integration/advanced.test.js](../backend/integration/advanced.test.js).

| Function                    | Status            |
| --------------------------- | ----------------- |
| In-App Notifications        | Working           |
| Email Notifications         | Blocked           |
| Leave Notifications         | Working           |
| Attendance Reminders        | Partially Working |
| Missing Punch Alerts        | Working           |
| Daily Report Reminders      | Working           |
| Payroll Notifications       | Working           |
| Payslip Notifications       | Working           |
| Birthday Reminders          | Working           |
| Work Anniversary Reminders  | Working           |
| Document Expiry Alerts      | Working           |
| Task Deadline Alerts        | Working           |
| Notification Preferences    | Working           |
| Read / Unread Notifications | Working           |

## 30. Roles & Permission Management

Evidence: [frontend/src/features/admin.jsx](../frontend/src/features/admin.jsx), [backend/src/modules/admin/routes.js](../backend/src/modules/admin/routes.js), [backend/src/shared/scope.js](../backend/src/shared/scope.js).

| Function                     | Status            |
| ---------------------------- | ----------------- |
| Super Admin                  | Working           |
| Admin                        | Working           |
| HR Manager                   | Working           |
| Finance / Payroll            | Working           |
| Department Manager           | Working           |
| Team Leader                  | Working           |
| Employee                     | Working           |
| Custom Role Creation         | Working           |
| Permission Assignment        | Working           |
| Module Access Control        | Working           |
| Page Access Control          | Partially Working |
| API Permission Control       | Working           |
| Department-Level Access      | Working           |
| Branch-Level Access          | Working           |
| Employee Data Privacy        | Working           |
| Payroll Data Privacy         | Working           |
| Document Access Restrictions | Working           |
| Permission Audit Logs        | Working           |

## 31. Company Settings

Evidence: [frontend/src/features/admin.jsx](../frontend/src/features/admin.jsx), [frontend/src/organization.jsx](../frontend/src/organization.jsx), [backend/src/modules/operations/routes.js](../backend/src/modules/operations/routes.js), [backend/src/modules/admin/completion.js](../backend/src/modules/admin/completion.js), [backend/integration/final-lifecycle.test.js](../backend/integration/final-lifecycle.test.js).

| Function               | Status            |
| ---------------------- | ----------------- |
| Company Profile        | Working           |
| Company Logo           | Working           |
| Company Address        | Working           |
| Branch Settings        | Working           |
| Department Settings    | Working           |
| Designation Settings   | Working           |
| Shift Policies         | Working           |
| Attendance Policies    | Working           |
| Leave Policies         | Working           |
| Holiday Settings       | Working           |
| Payroll Settings       | Partially Working |
| Tax Configuration      | Blocked           |
| Financial Year         | Working           |
| Timezone Configuration | Working           |
| Email Configuration    | Blocked           |
| Notification Settings  | Working           |
| Document Templates     | Working           |

## 32. System Administration & Security

Evidence: [backend/src/app.js](../backend/src/app.js), [backend/src/modules/documents/routes.js](../backend/src/modules/documents/routes.js), [backend/src/shared/scope.js](../backend/src/shared/scope.js), [backend/integration/full-workflows.test.js](../backend/integration/full-workflows.test.js), [scripts/backup.mjs](../scripts/backup.mjs), [scripts/production-check.mjs](../scripts/production-check.mjs), [backend/integration/backup.test.js](../backend/integration/backup.test.js), [deploy/nginx.conf.example](../deploy/nginx.conf.example).

| Function                      | Status            |
| ----------------------------- | ----------------- |
| Authentication Security       | Working           |
| Session Security              | Working           |
| Role-Based Authorization      | Working           |
| API Security                  | Working           |
| Input Validation              | Working           |
| Sensitive Data Encryption     | Working           |
| Audit Logs                    | Working           |
| Login Logs                    | Working           |
| Activity Logs                 | Working           |
| Error Logs                    | Working           |
| Backup & Restore              | Partially Working |
| Data Import / Export          | Working           |
| Data Archival                 | Partially Working |
| File Upload Security          | Working           |
| Rate Limiting                 | Working           |
| HTTPS Configuration           | Blocked           |
| Environment Configuration     | Working           |
| System Health Monitoring      | Partially Working |
| Database Optimization         | Partially Working |
| Production Build Verification | Working           |

## Remaining scope

Partial entries still require additional implementation or verification. The backup utility verifies isolated reconstruction, while live cutover, retention and a deployment recovery drill remain operator work. Statutory payroll engines, SMTP delivery and HTTPS are not certified. See [release status](release-status.md) and [deployment](deployment.md).
