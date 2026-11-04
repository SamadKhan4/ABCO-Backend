# ABCO HRMS — Complete Function Audit & Implementation Prompt

Act as a Senior Full-Stack Developer and HRMS System Architect.

**Task:** Audit my existing ABCO HRMS application. Check every module and function listed below. Identify which functions are implemented, partially implemented, missing, or broken.

**Instructions for Codex:**

1. Inspect the complete frontend, backend, APIs, database models, routes, and permissions.
2. Check each function against the existing codebase.
3. Verify actual functionality, not just UI presence.
4. Do not recreate already working functions.
5. Fix incomplete or broken functions.
6. Implement every missing function with frontend, backend, database integration, validation, and role-based permissions.
7. Preserve the existing UI, code structure, and working functionality.
8. Maintain the design theme: **White Background (#FFFFFF) + Dark Navy Blue (#0B1F3A)**.
9. Use real database data, not mock data.
10. Test every completed function and ensure integration between modules.
11. Do not delete existing features or data.
12. Provide a final status report for every function: **Working / Partially Working / Missing / Fixed / Implemented / Blocked**.

---

## 1. Authentication & User Management

- Login
- Logout
- Forgot Password
- Reset Password
- Change Password
- Account Activation
- Account Deactivation
- Session Management
- Role-Based Login
- Multi-Factor Authentication
- User Profile
- Login Activity Logs
- Password Security
- User Permissions

## 2. Dashboard Management

- Super Admin Dashboard
- Admin Dashboard
- HR Dashboard
- Manager Dashboard
- Team Leader Dashboard
- Finance Dashboard
- Employee Dashboard
- Total Employees
- Present Employees
- Absent Employees
- On Leave Employees
- Late Employees
- Pending Approvals
- Employee Statistics
- Attendance Charts
- Payroll Summary
- Upcoming Holidays
- Birthdays & Anniversaries
- Recent Activities
- Dashboard Notifications

## 3. Employee Management

- Add Employee
- Edit Employee
- View Employee
- Deactivate Employee
- Employee Directory
- Employee ID Generation
- Employee Profile
- Personal Information
- Professional Information
- Contact Information
- Emergency Contact
- Employment Details
- Reporting Manager Assignment
- Department Assignment
- Designation Assignment
- Branch Assignment
- Employee Status
- Employee Search
- Employee Filters
- Employee Bulk Import
- Employee Export
- Employee Documents
- Employee History

## 4. Department & Designation Management

- Add Department
- Edit Department
- Deactivate Department
- Department Head Assignment
- Department Employee List
- Department Hierarchy
- Add Designation
- Edit Designation
- Designation Levels
- Employee Designation Assignment
- Branch Management
- Office Location Management
- Organizational Hierarchy

## 5. Attendance Management

- Employee Punch In
- Employee Punch Out
- Live Attendance Status
- Attendance Calendar
- Daily Attendance
- Monthly Attendance
- Working Hours Calculation
- Break Time Tracking
- Late Arrival Tracking
- Early Departure Tracking
- Half-Day Attendance
- Absent Marking
- Overtime Calculation
- Missing Punch Detection
- Attendance Regularization
- Attendance Approval
- Manual Attendance Correction
- Work From Home Attendance
- Holiday Attendance
- Weekly Off Attendance
- Night Shift Attendance
- Attendance Reports
- Department Attendance
- Employee Attendance History
- Attendance Export
- Optional Biometric Integration

## 6. Shift Management

- Add Shift
- Edit Shift
- Delete / Deactivate Shift
- Shift Assignment
- Shift Scheduling
- Rotational Shifts
- Night Shifts
- Shift Swap Requests
- Shift Calendar
- Grace Period Settings
- Weekly Off Settings
- Break Policy
- Overtime Policy
- Shift History

## 7. Leave Management

- Leave Type Management
- Casual Leave
- Sick Leave
- Earned Leave
- Unpaid Leave
- Compensatory Off
- Maternity / Paternity Leave
- Leave Application
- Leave Approval
- Leave Rejection
- Leave Cancellation
- Leave Balance
- Leave Accrual
- Leave Carry Forward
- Leave Encashment
- Half-Day Leave
- Leave Calendar
- Leave History
- Multi-Level Leave Approval
- Leave Policy Configuration
- Leave Reports
- Leave Notifications

## 8. Holiday Management

- Add Holiday
- Edit Holiday
- Remove Holiday
- Holiday Calendar
- National Holidays
- Company Holidays
- Optional Holidays
- Branch-Wise Holidays
- Weekly Off Configuration
- Holiday Notifications

## 9. Payroll Management

- Salary Structure Creation
- Employee Salary Assignment
- Basic Salary
- HRA
- Allowances
- Salary Deductions
- PF Calculation
- ESI Calculation
- Professional Tax
- TDS
- Overtime Payment
- Loss of Pay
- Incentives
- Bonuses
- Salary Arrears
- Salary Advances
- Loan Deductions
- Monthly Payroll Processing
- Payroll Preview
- Payroll Approval
- Payroll Locking
- Payroll History
- Payroll Reports
- Salary Register
- Bank Payment Statement
- Payment Status Tracking
- Full & Final Settlement

## 10. Salary Slip Management

- Generate Payslip
- Download Payslip PDF
- Monthly Payslip History
- Employee Payslip Access
- Salary Breakdown
- Earnings Summary
- Deduction Summary
- Net Salary
- Payslip Template
- Company Branding
- Payslip Email Notification
- Bulk Payslip Generation

## 11. Employee Self-Service

- Employee Dashboard
- View Profile
- Update Permitted Profile Details
- Punch In / Out
- Attendance History
- Attendance Regularization
- Apply Leave
- Leave Balance
- Leave History
- Download Payslip
- View Holiday Calendar
- Upload Documents
- View Tasks
- Submit Daily Report
- Raise HR Ticket
- View Announcements
- Personal Notifications
- Change Password

## 12. Daily Work Report Management

- Create Daily Report
- Save Draft
- Submit Daily Report
- Edit Draft Report
- Daily Task Description
- Work Hours
- Work Status
- Project Linking
- Daily Work Summary
- Manager Review
- Report Approval
- Report Rejection
- Report History
- Department Reports
- Missing Report Tracking
- Mandatory Report Before Punch Out (Configurable)

## 13. Task Management

- Create Task
- Assign Task
- Edit Task
- Delete / Archive Task
- Task Priority
- Task Deadline
- Task Status
- Task Comments
- Task Attachments
- Employee Task List
- Manager Task Overview
- Task Progress
- Overdue Tasks
- Completed Tasks
- Task History
- Task Notifications

## 14. Project & Timesheet Management

- Project Creation
- Project Assignment
- Department Allocation
- Employee Allocation
- Project Status
- Project Start / End Dates
- Project Tasks
- Timesheet Entry
- Timesheet Approval
- Billable Hours
- Non-Billable Hours
- Employee Utilization
- Project Work Reports

## 15. Recruitment Management

- Job Opening Creation
- Job Vacancy Management
- Candidate Database
- Candidate Application
- Resume Upload
- Candidate Screening
- Interview Scheduling
- Interview Feedback
- Candidate Status
- Hiring Pipeline
- Offer Letter
- Candidate Selection
- Candidate Rejection
- Candidate-to-Employee Conversion
- Recruitment Reports

## 16. Employee Onboarding

- New Joiner Registration
- Onboarding Checklist
- Document Collection
- Document Verification
- Offer Letter
- Appointment Letter
- Employee Account Creation
- Department Allocation
- Manager Allocation
- Shift Allocation
- Salary Assignment
- Asset Allocation
- Policy Acknowledgement
- Probation Period Tracking
- Onboarding Status

## 17. Performance Management

- KPI Management
- KRA Management
- Employee Goal Setting
- Performance Review Cycle
- Self-Appraisal
- Manager Appraisal
- Performance Rating
- 360-Degree Feedback
- Performance Feedback
- Appraisal History
- Performance Improvement Plan
- Increment Recommendation
- Promotion Recommendation
- Performance Reports

## 18. Training & Development

- Training Program Creation
- Training Calendar
- Employee Training Assignment
- Training Attendance
- Course Management
- Skill Management
- Skill Gap Analysis
- Training Progress
- Training Assessment
- Certifications
- Training Feedback
- Training Reports

## 19. Document Management

- Upload Employee Documents
- View Documents
- Download Documents
- Document Categories
- Document Verification
- Document Approval
- Document Expiry Tracking
- Document Version History
- Offer Letter Generation
- Appointment Letter Generation
- Experience Letter Generation
- Relieving Letter Generation
- Secure Document Access

## 20. Asset Management

- Add Asset
- Edit Asset
- Asset Categories
- Asset Inventory
- Asset Assignment
- Asset Return
- Asset Reassignment
- Asset Condition
- Asset Maintenance
- Warranty Tracking
- Asset History
- Employee Asset List
- Asset Clearance During Exit

## 21. Expense & Reimbursement

- Expense Claim Creation
- Expense Categories
- Receipt Upload
- Expense Approval
- Expense Rejection
- Expense Policy
- Travel Reimbursement
- Medical Reimbursement
- Payment Tracking
- Expense History
- Expense Reports

## 22. Travel & Visit Management

- Travel Request
- Travel Approval
- Travel Planning
- Travel Advances
- Travel Expenses
- Travel Settlement
- Employee Visit Tracking
- Travel History
- Travel Reports

## 23. Employee Helpdesk

- Create HR Ticket
- Ticket Categories
- Ticket Priority
- Ticket Assignment
- Ticket Status
- Ticket Comments
- Ticket Attachments
- Ticket Escalation
- Ticket Resolution
- Ticket History
- HR Support Dashboard

## 24. Announcements & Communication

- Create Announcement
- Edit Announcement
- Delete / Archive Announcement
- Department Announcements
- Company-Wide Announcements
- Scheduled Announcements
- Important Notices
- Policy Announcements
- Employee Acknowledgement
- Announcement History

## 25. Employee Engagement

- Employee Surveys
- Feedback Forms
- Employee Recognition
- Employee Rewards
- Employee Suggestions
- Satisfaction Surveys
- Engagement Reports

## 26. Exit & Offboarding Management

- Resignation Request
- Resignation Approval
- Notice Period Tracking
- Last Working Day
- Exit Interview
- Handover Checklist
- Asset Clearance
- No-Dues Clearance
- Leave Adjustment
- Full & Final Settlement
- Relieving Letter
- Experience Letter
- Employee Deactivation
- Exit History
- Exit Reports

## 27. Reports & Analytics

- Employee Master Report
- Department Report
- Headcount Report
- Daily Attendance Report
- Monthly Attendance Report
- Late Attendance Report
- Overtime Report
- Leave Report
- Leave Balance Report
- Payroll Report
- Salary Register
- Recruitment Report
- Performance Report
- Task Report
- Daily Work Report
- Asset Report
- Expense Report
- Employee Attrition Report
- Custom Date Filters
- Department Filters
- Branch Filters
- Excel Export
- CSV Export
- PDF Export

## 28. Workflow & Approval Management

- Approval Workflow Configuration
- Multi-Level Approvals
- Reporting Manager Approval
- HR Approval
- Finance Approval
- Approval Delegation
- Approval Notifications
- Pending Approval Dashboard
- Approval Rejection
- Approval History
- Escalation Rules

## 29. Notifications & Reminders

- In-App Notifications
- Email Notifications
- Leave Notifications
- Attendance Reminders
- Missing Punch Alerts
- Daily Report Reminders
- Payroll Notifications
- Payslip Notifications
- Birthday Reminders
- Work Anniversary Reminders
- Document Expiry Alerts
- Task Deadline Alerts
- Notification Preferences
- Read / Unread Notifications

## 30. Roles & Permission Management

- Super Admin
- Admin
- HR Manager
- Finance / Payroll
- Department Manager
- Team Leader
- Employee
- Custom Role Creation
- Permission Assignment
- Module Access Control
- Page Access Control
- API Permission Control
- Department-Level Access
- Branch-Level Access
- Employee Data Privacy
- Payroll Data Privacy
- Document Access Restrictions
- Permission Audit Logs

## 31. Company Settings

- Company Profile
- Company Logo
- Company Address
- Branch Settings
- Department Settings
- Designation Settings
- Shift Policies
- Attendance Policies
- Leave Policies
- Holiday Settings
- Payroll Settings
- Tax Configuration
- Financial Year
- Timezone Configuration
- Email Configuration
- Notification Settings
- Document Templates

## 32. System Administration & Security

- Authentication Security
- Session Security
- Role-Based Authorization
- API Security
- Input Validation
- Sensitive Data Encryption
- Audit Logs
- Login Logs
- Activity Logs
- Error Logs
- Backup & Restore
- Data Import / Export
- Data Archival
- File Upload Security
- Rate Limiting
- HTTPS Configuration
- Environment Configuration
- System Health Monitoring
- Database Optimization
- Production Build Verification

---

# FINAL CODEX INSTRUCTIONS

After checking all 32 modules:

1. Create a module-wise audit report.
2. Classify every function as **Working / Partially Working / Missing / Broken**.
3. Include relevant frontend files, backend files, routes, and database models as evidence.
4. Identify missing dependencies between modules.
5. Implement missing and incomplete functionality in logical dependency order.
6. Fix broken functions without unnecessary refactoring.
7. Connect related modules, especially Employee → Attendance → Leave → Payroll → Reports.
8. Maintain existing RBAC and enforce authorization at the backend.
9. Add required validations, error handling, audit logging and tests.
10. Preserve existing database records and avoid destructive schema changes.
11. Use configurable company policies for attendance, leave, payroll and statutory calculations.
12. Do not invent operational policies, salary rules, credentials or compliance configurations. Mark any required missing configuration as blocked and document it.
13. Run relevant tests and production builds after implementation.
14. Report what was actually tested; do not claim unverified functionality is working.
15. Provide a final checklist showing implemented, fixed, working and blocked functions.

**Important:** Do not stop after the audit report. Start fixing and implementing missing functions immediately, phase by phase, while keeping the application operational.

**Final Goal:** Make the existing ABCO HRMS a complete, secure, fully integrated, production-ready enterprise HRMS with all listed applicable functions working correctly and no dummy functionality.
