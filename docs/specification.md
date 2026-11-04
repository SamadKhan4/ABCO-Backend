# ABCO COMPUTERS — ENTERPRISE HRMS

## Complete Production-Ready MERN Application — Master Development Prompt

### ROLE & OBJECTIVE

Act as a Principal Software Architect, Senior Full-Stack MERN Developer, Database Architect, UI/UX Designer, DevOps Engineer, and QA Automation Engineer.

Build a complete, production-ready, scalable, secure, responsive Human Resource Management System for **ABCO Computers**.

**Product Name:** ABCO HRMS  
**Company:** ABCO Computers  
**Application Type:** Enterprise Web-Based Human Resource Management System  
**Architecture:** Modular Monolith (MERN)  
**Target:** Real business operations, not a prototype.

The application must be fully functional, with real persistent data, connected workflows, authenticated API endpoints, properly designed permissions, and robust error handling.

Do not build only UI screens, dummy dashboards, or disconnected modules.

**Core Principles**

- Production-grade architecture
- Clean, modern 2026 enterprise SaaS design
- Role-based access control
- Data integrity and transactional consistency
- Security and privacy by design
- Optimized frontend and backend performance
- Reusable components and modular business logic
- Responsive desktop, tablet and mobile layouts
- Complete end-to-end functionality
- Comprehensive testing and deployment readiness

---

# 1. TECHNOLOGY STACK

## Frontend

- React with Vite
- JavaScript / JSX
- Tailwind CSS
- React Router
- TanStack Query for server-state management
- Zustand for lightweight client state
- React Hook Form
- Zod for schema validation
- Axios with centralized API client
- Recharts for analytics
- Lucide React icons
- Framer Motion / Motion for subtle UI transitions
- date-fns with timezone-aware handling
- Accessible reusable UI primitives
- Lazy-loaded routes and components

## Backend

- Node.js 22 LTS or supported newer LTS
- Express.js
- MongoDB
- Mongoose
- Zod validation
- Secure cookie-based authentication
- Argon2id password hashing
- Role and permission middleware
- Centralized exception handling
- Structured logging with Pino
- Helmet security headers
- CORS allowlist
- Rate limiting
- Server-side pagination, filtering and sorting
- Transactional multi-document operations where required

## Supporting Services

- Redis-backed queues for background processing
- Object storage for documents and generated files
- SMTP-based transactional emails
- PDF generation for payslips and official documents
- Excel / CSV export utilities
- Cron or durable queue scheduling for automated tasks

Do not introduce unnecessary microservices.

Use a modular monolith that can scale through clear module boundaries.

---

# 2. DESIGN SYSTEM — STRICT REQUIREMENTS

Create an elegant, highly polished, light-themed enterprise HRMS.

## Official Color Palette

- Primary Background: `#FFFFFF`
- Primary Brand / Navy: `#0B1F3A`
- Secondary Navy: `#173B68`
- Surface Background: `#F7F9FC`
- Light Navy Accent: `#EAF1F8`
- Border: `#E2E8F0`
- Primary Text: `#101828`
- Secondary Text: `#64748B`
- Success: `#16A34A`
- Warning: `#D97706`
- Error: `#DC2626`
- Information: `#2563EB`

**Strict rules:**

- White must be the dominant background.
- Dark navy is the main brand, navigation and action color.
- Avoid purple themes and excessive gradients.
- Use a minimal, sophisticated enterprise aesthetic.
- Use navy buttons with white text.
- Use soft navy-tinted selected navigation backgrounds.
- Use subtle shadows and thin borders.
- Use clear visual hierarchy.
- Maintain consistent spacing and typography throughout all modules.

## Typography

Primary font: Inter or Plus Jakarta Sans.

Typography hierarchy:

- Page heading: 26–30px
- Section title: 18–22px
- Card title: 15–17px
- Body: 14px
- Table text: 13–14px
- Supporting text: 12–13px

## Layout

Create a premium administrative application with:

**Left Sidebar**

- ABCO Computers logo and HRMS branding
- Collapsible navigation
- Grouped module sections
- Active route indicator
- Permission-aware menu items
- Clean icons and labels
- Sticky sidebar
- Collapsed desktop state

**Top Header**

- Global search
- Current page breadcrumb
- Notification center
- Attendance shortcut
- User avatar and dropdown
- Profile and settings access
- Logout action

**Main Workspace**

- Clear heading and contextual description
- Primary action on the top right
- Consistent filter and search toolbars
- Statistic cards
- Tables with server pagination
- Slide-over drawers for editing
- Confirmation dialogs for destructive actions
- Clean empty states
- Loading skeletons
- Error and retry states

## UI Components

Build shared reusable components:

- AppShell
- Sidebar
- Header
- Breadcrumbs
- PageHeader
- StatCard
- DataTable
- SearchInput
- FilterBar
- DateRangePicker
- Select
- Modal
- Drawer
- FormField
- StatusBadge
- Avatar
- Tooltip
- Tabs
- Pagination
- Charts
- FileUploader
- DocumentViewer
- NotificationPanel
- ConfirmationDialog
- ErrorBoundary
- LoadingSkeleton
- EmptyState
- PermissionGuard

All UI must remain consistent across every module.

Animations must be tasteful, fast and non-disruptive. Respect reduced-motion preferences.

---

# 3. USER ROLES & PERMISSIONS

Implement a configurable, database-backed role and permission system.

## Default Roles

### Super Admin

Complete access to the HRMS, including system administration and role management.

### Admin

Company administration access based on assigned permissions.

### HR Manager

Employee records, attendance, leave, onboarding, documents, compliance and HR reports.

### Payroll / Finance

Salary structures, payroll processing, payslips, payroll reports and authorized financial operations.

### Department Manager

Department-specific employees, attendance summaries, leave approvals, assigned projects and performance.

### Team Leader

Assigned team members, work tracking and limited attendance/leave approval authority.

### Employee

Own profile, attendance, leave, salary slips, documents, assigned work and personal reports.

## RBAC Requirements

Use permissions such as:

- `employee.read`
- `employee.create`
- `employee.update`
- `employee.archive`
- `attendance.read`
- `attendance.manage`
- `attendance.regularize`
- `leave.request`
- `leave.approve`
- `payroll.view`
- `payroll.process`
- `payroll.approve`
- `payroll.release`
- `reports.export`
- `settings.manage`
- `roles.manage`

Permissions must support:

- Own-record access
- Direct-report access
- Department access
- Branch access
- Company-wide access

The backend must enforce every permission and ownership rule.

Never rely only on hiding frontend buttons.

Managers must not automatically receive access to their employees' salaries, sensitive documents or private information.

Any employee self-service API must derive employee identity from the authenticated session, never trust an arbitrary employee ID supplied by the browser.

---

# 4. AUTHENTICATION & ACCOUNT SECURITY

Implement complete authentication.

## Features

- Login
- Secure logout
- Forgot password
- Reset password
- Change password
- Password strength validation
- Account activation/deactivation
- Session management
- Optional MFA readiness
- Password expiry policy support
- Login attempt monitoring
- Security audit logs

## Login Screen

Design a premium split-layout login page:

Left:

- ABCO Computers branding
- Welcome message
- HRMS product introduction
- Subtle abstract geometric illustration

Right:

- Email / employee ID
- Password
- Password visibility toggle
- Remember-session option, subject to security policy
- Forgot password
- Sign-in button

Use clean white surfaces and dark navy branding.

## Security Requirements

- Argon2id password hashing
- HttpOnly secure session cookies
- SameSite cookie configuration
- CSRF protection for cookie-authenticated mutations
- Session rotation after authentication
- Short-lived sessions with configurable expiry
- Server-side session invalidation
- Login rate limiting
- Account lockout/backoff controls
- No secrets inside frontend bundles
- No credentials in source control
- Do not store authentication tokens in localStorage
- Enforce HTTPS in production
- Explicit CORS allowlist
- Re-authentication for sensitive operations
- Comprehensive audit logging of privileged actions

---

# 5. DASHBOARD MANAGEMENT

Build separate dashboards based on the authenticated user's role.

## Admin / HR Dashboard

### Main KPI Cards

- Total Employees
- Active Employees
- Present Today
- Absent Today
- On Leave Today
- Late Arrivals
- Pending Leave Requests
- New Joiners
- Upcoming Birthdays
- Upcoming Anniversaries

### Charts

- Weekly Attendance Trend
- Monthly Attendance Summary
- Department-wise Employee Distribution
- Leave Trends
- Employee Growth
- Monthly Payroll Summary (authorized roles only)

### Dashboard Sections

- Today's Attendance
- Recent Employee Activity
- Pending Approvals
- Employee Announcements
- Upcoming Holidays
- Expiring Documents
- Upcoming Probation Reviews
- Quick Actions

### Quick Actions

- Add Employee
- View Attendance
- Approve Leave
- Run Payroll
- Create Announcement
- Generate Report

All dashboard statistics must use authorized, real-time or appropriately refreshed backend data.

## Manager Dashboard

- My Team
- Team Attendance
- Pending Approvals
- Assigned Work
- Leave Calendar
- Team Performance
- Department Overview

## Employee Dashboard

- Welcome Header
- Today's Date
- Punch In / Punch Out
- Current Attendance Status
- Working Hours
- My Leave Balance
- Upcoming Holidays
- My Tasks
- Announcements
- Recent Payslips
- My Attendance Summary
- Notifications

---

# 6. EMPLOYEE MANAGEMENT

Build a complete employee lifecycle management module.

## Employee Directory

Features:

- Add employee
- Edit employee
- View employee
- Archive/deactivate employee
- Employee search
- Advanced filters
- Sort by joining date, name or department
- Pagination
- Bulk employee import with validation
- Export authorized employee data
- Employee profile photo
- Employment status

## Employee Registration Fields

### Basic Details

- Auto-generated employee code
- First name
- Middle name
- Last name
- Display name
- Personal email
- Official email
- Mobile number
- Alternative mobile
- Date of birth
- Gender (configurable)
- Marital status (optional)
- Blood group (optional)
- Profile picture

### Employment Details

- Employee ID
- Department
- Designation
- Branch
- Office location
- Reporting manager
- Team leader
- Employment type
- Joining date
- Confirmation date
- Probation end date
- Employment status
- Work mode
- Shift assignment
- Weekly-off policy
- Cost center

### Address

- Current address
- Permanent address
- City
- State
- Country
- Postal code

### Emergency Contact

- Contact name
- Relationship
- Mobile number

### Payroll Information

- Salary structure
- Effective date
- Payment frequency
- Bank account information
- IFSC
- Tax-related identifiers as applicable
- Statutory contribution eligibility

### Documents

- Government identification
- Educational certificates
- Experience documents
- Offer letter
- Appointment letter
- Relieving letter
- Other company documents

Sensitive documents and identifiers must have field-level authorization, encrypted storage where appropriate, and audit logging.

Do not expose full bank or government identifier values in ordinary API responses.

## Employee Profile

Create tabs:

1. Overview
2. Personal Details
3. Employment Details
4. Attendance
5. Leaves
6. Payroll
7. Documents
8. Performance
9. Assigned Work
10. Activity History

Show only authorized tabs.

---

# 7. DEPARTMENT & DESIGNATION MANAGEMENT

Build independent master-data management.

## Departments

- Create department
- Edit department
- Assign head
- Assign employees
- Department code
- Department description
- Active/inactive status
- Employee count

## Designations

- Create designation
- Designation hierarchy
- Department mapping
- Employment level
- Active status

## Branches & Office Locations

- Create multiple branches
- Configure branch address
- Working timezone
- Holiday calendar
- Attendance policy
- Branch-wise employee assignment
- Branch-wise reports

Prevent deletion of master records when referenced by live business records; use controlled deactivation.

---

# 8. ATTENDANCE MANAGEMENT

Build a complete attendance engine, not a simple timestamp form.

## Employee Attendance Flow

1. Employee logs in.
2. Dashboard displays current attendance status.
3. Employee selects Punch In.
4. Backend records authoritative server time.
5. Current shift and applicable attendance policy are determined.
6. Employee starts the workday.
7. Optional break start/end tracking.
8. Employee submits daily work report where required by policy.
9. Employee selects Punch Out.
10. Backend calculates working duration.
11. Attendance record is finalized according to company policy.
12. Admin, HR and authorized managers see updated attendance.

## Attendance Data

- Employee
- Attendance date
- Shift
- Punch-in timestamp
- Punch-out timestamp
- Break durations
- Total working minutes
- Overtime minutes
- Late arrival minutes
- Early departure minutes
- Attendance status
- Source
- Regularization state
- Approval details

## Attendance Statuses

- Present
- Absent
- Half Day
- Late
- On Leave
- Holiday
- Weekly Off
- Work From Home
- Missing Punch
- Pending Regularization

Represent status and punctuality separately internally where necessary.

## Special Scenarios

- Night shifts spanning midnight
- Multiple work sessions
- Duplicate punch prevention
- Network retry and idempotency
- Forgotten punch-out
- Missing punch-in
- Holidays
- Weekly offs
- Approved leave
- Overnight working hours
- Different branch timezones
- Manual attendance correction
- Backdated attendance
- Attendance reconciliation
- Attendance payroll lock

### Attendance Regularization

Employee submits:

- Date
- Existing times
- Requested times
- Reason
- Supporting attachment (optional)

Approval workflow:
Employee → Reporting Manager / HR → Approved or Rejected.

Preserve original times and immutable correction history.

### Critical Rule

Never calculate payroll attendance from frontend-generated values.

Store time in UTC and apply the employee's relevant branch timezone for shift/date interpretation.

Backend must validate attendance transitions and reject impossible state changes.

---

# 9. SHIFT & WORK SCHEDULE MANAGEMENT

Create a complete shift management module.

## Shift Fields

- Shift name
- Shift code
- Start time
- End time
- Break policy
- Grace period
- Minimum hours
- Half-day threshold
- Full-day threshold
- Overtime eligibility
- Late arrival policy
- Early departure policy
- Overnight shift indicator

## Features

- Create shift
- Edit shift
- Assign employee to shift
- Bulk shift assignment
- Department-wise shifts
- Rotational shifts
- Effective-dated scheduling
- Shift calendar
- Weekly offs
- Shift change history

Changing an employee's future shift must not silently rewrite historical attendance.

---

# 10. LEAVE MANAGEMENT

Implement a fully functional leave policy and request system.

## Default Leave Types

- Casual Leave
- Sick Leave
- Earned / Privilege Leave
- Compensatory Off
- Unpaid Leave
- Maternity Leave
- Paternity Leave
- Other configurable leave types

Do not hardcode statutory entitlements. Configure applicable policies based on the company's jurisdiction and approved HR rules.

## Leave Features

- Leave type configuration
- Annual entitlement
- Accrual policy
- Opening balance
- Carry-forward
- Expiry
- Encashment eligibility
- Probation restrictions
- Minimum notice period
- Attachment requirements
- Half-day leave
- Multi-day leave
- Leave cancellation
- Leave history
- Team leave calendar
- Leave approval delegation
- HR adjustments

## Request Workflow

Employee applies → Backend validates policy and available balance → Manager/HR approval → Leave ledger updated → Attendance reconciled → Employee notified.

## Leave Request Fields

- Employee
- Leave type
- Start date
- End date
- Half-day selection
- Requested days
- Reason
- Attachment
- Approval status
- Approver
- Approval timestamp
- Rejection reason

## Validation

- Prevent overlapping approved/pending requests according to policy.
- Prevent negative leave balance unless expressly permitted.
- Apply holidays and weekly-off counting rules.
- Use transactions for approval and balance posting.
- Preserve a proper leave transaction ledger.
- Prevent double deduction after retries.
- Support payroll locks and approved adjustment workflows.

---

# 11. HOLIDAY CALENDAR MANAGEMENT

Features:

- Create holiday
- Edit holiday
- Holiday name
- Date
- Type
- Applicable branch
- Applicable employee group
- Calendar year
- Optional/restricted holiday flag
- Recurring holiday support where appropriate
- Holiday calendar view
- Employee holiday visibility

Holiday rules must integrate with attendance, leave and payroll calculations.

---

# 12. PAYROLL & SALARY MANAGEMENT

Build a configurable payroll engine suitable for Indian business operations.

Do not use fixed tax rates, fixed deduction formulas or assumptions about employee eligibility.

All statutory rules must be configurable by effective date and validated against applicable current requirements before go-live.

## Salary Structure

- Effective date
- Currency
- Pay frequency
- Basic salary
- HRA
- Special allowance
- Other earnings
- Fixed deductions
- Variable earnings
- Variable deductions
- Employer contributions
- Employee contributions
- Reimbursements
- Incentives
- Bonuses
- Arrears
- Recoveries
- Loan deductions where applicable

## Payroll Operations

- Define salary templates
- Assign salary structures
- Maintain salary revision history
- Create payroll period
- Lock attendance inputs
- Calculate payable days
- Calculate paid/unpaid leave
- Calculate loss of pay
- Process variable earnings
- Apply configured deductions
- Preview payroll
- Validate payroll
- Submit for approval
- Approve payroll
- Finalize payroll
- Generate payslips
- Record disbursement status
- Generate reports
- Reconcile payroll changes

## Payroll Processing Workflow

Draft → Calculate → Review → Approve → Finalize → Disburse / Record Payment → Close.

Implement explicit state transitions.

Payroll corrections after finalization must use authorized adjustment or reversal workflows.

Do not directly mutate finalized payroll without audit history.

## Payslip

Generate a clean branded PDF payslip containing:

- ABCO Computers identity
- Employee information
- Pay period
- Earnings
- Deductions
- Gross salary
- Net salary
- Payment details (masked)
- Leave/attendance summary
- Payroll reference

Employees can download only their own payslips.

Payroll and HR permissions must remain independently configurable.

## Statutory / Tax Configuration

Support configurable integration of applicable:

- EPF
- ESI
- Professional Tax
- TDS
- Other employer/employee statutory obligations

Apply the correct effective-dated rules and eligibility conditions as configured by authorized payroll administrators.

## Data Integrity

- Store immutable payroll snapshots.
- Use decimal-safe monetary calculations.
- Do not use floating-point arithmetic for financial amounts.
- Prevent duplicate payroll runs for the same employee and period.
- Retain calculation versions and approval histories.
- Use deterministic payroll calculations and comprehensive unit tests.

---

# 13. EMPLOYEE SELF-SERVICE PORTAL (ESS)

Every employee must have a personalized portal.

## Features

- Personal Dashboard
- Punch In / Punch Out
- Attendance History
- Attendance Regularization
- Leave Application
- Leave Balance
- Holiday Calendar
- Salary Slips
- Profile Details
- Document Access
- Daily Work Report
- My Tasks
- Announcements
- Notifications
- Password Change
- Helpdesk Requests

Employees should not see internal HR or admin tools without explicit authorization.

---

# 14. DAILY WORK REPORT MANAGEMENT

Implement daily employee reporting.

## Work Report Fields

- Employee
- Report date
- Department
- Reporting manager
- Task title
- Task description
- Linked project (optional)
- Time spent
- Completion status
- Blockers
- Additional notes
- Attachments

## Features

- Create daily report
- Save draft
- Submit report
- Edit draft
- View submission history
- Manager review
- Review comments
- Report status
- Department-wise filtering
- Export authorized reports

## Daily Report & Punch-Out Policy

Support optional mandatory daily report before punch-out.

This policy must be configurable by employee group, department or branch.

If enabled:

- Employee must submit required report.
- Backend validates submission.
- Punch-out becomes available after validation.

Provide authorized emergency/manual closure so missing reports cannot permanently prevent attendance closure.

HR must be able to review missing submissions.

---

# 15. WORK / TASK MANAGEMENT

Create a lightweight HRMS-integrated task tracking module.

This is not a full project ERP, but must support employee work accountability.

## Task Fields

- Title
- Description
- Assigned by
- Assigned to
- Department
- Priority
- Start date
- Due date
- Estimated time
- Actual time
- Status
- Attachments
- Comments

## Task Status

- To Do
- In Progress
- On Hold
- Completed
- Cancelled

## Features

- Create and assign tasks
- Task list and Kanban view
- Due date tracking
- Status updates
- Attachments
- Comments
- Team overview
- Task activity history
- Overdue task notifications
- Integration with daily work reports

Managers must only access authorized task records.

---

# 16. RECRUITMENT MANAGEMENT

Build an applicant tracking and hiring module.

## Job Openings

- Job title
- Department
- Designation
- Location
- Employment type
- Vacancy count
- Description
- Requirements
- Hiring manager
- Opening date
- Status

## Candidate Management

- Candidate name
- Email
- Phone
- Resume
- Applied role
- Source
- Experience
- Skills
- Current stage
- Recruiter
- Notes

## Recruitment Workflow

Job Opening → Candidate Application → Screening → Interview → Evaluation → Selection → Offer → Joining → Employee Onboarding.

## Features

- Candidate pipeline
- Interview scheduling
- Interview feedback
- Candidate status
- Offer records
- Recruitment analytics
- Authorized resume access
- Candidate conversion to employee record

Avoid duplicate employee records during candidate conversion.

---

# 17. EMPLOYEE ONBOARDING

Create structured onboarding workflows.

## Features

- New employee checklist
- Document collection
- Identity verification status
- Appointment letter
- Department assignment
- Reporting manager assignment
- Shift assignment
- Salary structure setup
- Policy acknowledgement
- Asset allocation
- Account activation
- Probation tracking
- HR onboarding approval

## Workflow

Offer Accepted → Pre-Joining Documentation → Employee Record Created → Joining Checklist → Account Activated → Onboarding Completed.

Each checklist item must have an owner, deadline and completion status.

---

# 18. EMPLOYEE EXIT & OFFBOARDING

Support complete employee separation.

## Fields

- Employee
- Resignation date
- Last working date
- Notice period
- Exit reason
- Separation type
- Approval status
- Handover details

## Offboarding Flow

Resignation Request → Manager Review → HR Approval → Notice Period → Asset Clearance → Knowledge Handover → Final Settlement → Account Deactivation → Exit Completed.

## Features

- Resignation requests
- Exit approvals
- Exit interview
- Clearance checklist
- Pending leave adjustments
- Asset recovery
- Final settlement calculation
- Relieving documentation
- Experience letter
- Separation history

Preserve legally required records while revoking system access at the appropriate stage.

---

# 19. PERFORMANCE MANAGEMENT

Build performance evaluation and appraisal tracking.

## Features

- Performance review cycles
- Goal / KPI creation
- Goal assignment
- Self-assessment
- Manager assessment
- Feedback
- Weighted scoring
- Competency ratings
- Appraisal recommendations
- Review approval
- Performance history
- Department-wise analytics

## Workflow

Review Cycle Created → Goals Assigned → Employee Self Review → Manager Review → HR Moderation (if configured) → Final Approval → Employee Acknowledgement.

Salary adjustments must go through authorized payroll workflows, not direct performance module changes.

---

# 20. ASSET MANAGEMENT

Build employee IT asset allocation tracking.

## Asset Fields

- Asset ID
- Asset category
- Asset name
- Serial number
- Brand
- Model
- Purchase date
- Warranty expiry
- Condition
- Status
- Assigned employee
- Assigned date

## Asset Features

- Add asset
- Allocate asset
- Reassign asset
- Return asset
- Mark under repair
- Mark retired
- Asset history
- Warranty notifications
- Exit clearance integration

Prevent conflicting allocations of the same physical asset.

---

# 21. DOCUMENT MANAGEMENT

Implement secure employee and HR document management.

## Document Categories

- Identity Documents
- Employment Letters
- Offer Letters
- Appointment Letters
- Educational Certificates
- Experience Certificates
- Payslips
- HR Policies
- Appraisal Letters
- Other Records

## Features

- Upload
- Preview
- Download
- Replace version
- Set expiry date
- Approval/rejection where required
- Document verification
- Access control
- Version history
- Retention policy
- Audit history

Use private object storage.

Never expose private documents through public static directories.

Use signed, time-limited download access after server-side authorization.

Validate file MIME type, size and content. Scan uploaded files when feasible.

---

# 22. ANNOUNCEMENTS & COMPANY COMMUNICATION

Features:

- Create announcement
- Edit announcement
- Schedule publication
- Target specific departments or branches
- Attach documents
- Mark important
- Employee acknowledgement
- Expiry date
- Announcement history

Only authorized users can publish company-wide announcements.

---

# 23. NOTIFICATIONS MANAGEMENT

Implement persistent application notifications.

## Notification Types

- Leave request submitted
- Leave approved/rejected
- Attendance irregularity
- Daily report reminder
- New task assignment
- Payroll released
- New payslip
- Company announcement
- Birthday
- Work anniversary
- Probation completion
- Document expiry
- Pending approvals

## Channels

- In-app notifications
- Email notifications
- Optional future push integration

## Features

- Unread notification count
- Mark as read
- Mark all as read
- Notification preferences
- Deep links to relevant records
- Scheduled notifications
- Retry handling

Use background queues for email delivery and other non-critical asynchronous tasks.

---

# 24. HELP DESK / EMPLOYEE REQUESTS

Create an internal HR helpdesk.

## Ticket Categories

- Payroll
- Attendance
- Leave
- Documents
- HR Policy
- IT Support
- Other

## Ticket Fields

- Ticket number
- Requester
- Category
- Subject
- Description
- Priority
- Assigned team
- Status
- Attachments
- Conversation history

## Status

- Open
- In Progress
- Awaiting Response
- Resolved
- Closed

Employees may access their own tickets.

Assigned agents may access only tickets within their authorized responsibility.

---

# 25. REPORTS & ANALYTICS

Build a centralized reporting interface.

## Report Categories

**Employee Reports**

- Employee Directory
- Department Headcount
- Joining/Exit Report
- Employee Growth
- Probation Tracking

**Attendance Reports**

- Daily Attendance
- Monthly Attendance
- Late Arrivals
- Missing Punches
- Overtime
- Attendance Regularization

**Leave Reports**

- Leave Balance
- Leave Utilization
- Leave Requests
- Leave Trends

**Payroll Reports**

- Salary Register
- Payroll Summary
- Earnings
- Deductions
- Payroll Comparison
- Disbursement Status

**HR Operations Reports**

- Recruitment Funnel
- Onboarding Progress
- Exit Summary
- Asset Allocation
- Task Completion
- Daily Work Reports
- Performance Reviews

## Reporting Features

- Role-based reporting
- Department filters
- Branch filters
- Employee filters
- Date range
- Status filters
- Server-side search
- Interactive charts
- CSV export
- Excel export
- Authorized PDF reports
- Asynchronous large exports

Report queries and exports must use the same authorization and data-scope rules as ordinary application views.

Log sensitive exports.

---

# 26. COMPANY SETTINGS

Create a centralized administrative configuration module.

## Company Profile

- Company name
- Logo
- Registered address
- Office locations
- Contact email
- Phone
- Default timezone
- Currency
- Financial year

## HR Policies

- Attendance rules
- Leave policies
- Weekly offs
- Shift rules
- Holiday calendars
- Probation rules
- Notice period rules
- Daily report requirements

## Payroll Settings

- Salary components
- Payroll cycle
- Statutory configurations
- Payslip template
- Payment dates
- Approval workflow

## System Settings

- Role management
- Permission management
- Notification settings
- Session policies
- Email settings
- File upload limits
- Audit retention
- Data retention
- Backup configuration

Sensitive changes must require administrative permissions and appear in the audit trail.

---

# 27. DATABASE ARCHITECTURE

Design normalized-enough MongoDB schemas with meaningful references, appropriate indexes and explicit integrity constraints.

## Main Collections

**Identity & Organization**

- users
- roles
- permissions
- sessions
- employees
- departments
- designations
- branches
- organizationSettings

**Attendance**

- attendanceRecords
- attendanceEvents
- attendanceRegularizations
- shifts
- shiftAssignments
- attendancePolicies
- holidayCalendars

**Leave**

- leaveTypes
- leavePolicies
- leaveRequests
- leaveLedgerEntries
- leaveBalances

**Payroll**

- salaryStructures
- salaryComponents
- salaryRevisions
- payrollPeriods
- payrollRuns
- payrollEntries
- payrollAdjustments
- payrollApprovals
- payslips
- paymentRecords
- statutoryConfigurations

**HR Operations**

- recruitmentJobs
- candidates
- interviews
- offers
- onboardingTasks
- exits
- clearanceTasks
- performanceCycles
- performanceReviews

**Work & Assets**

- tasks
- dailyReports
- assets
- assetAssignments

**Communication**

- announcements
- notifications
- helpdeskTickets

**Security & Operations**

- employeeDocuments
- documentVersions
- auditLogs
- backgroundJobs
- idempotencyRecords
- exportJobs

## Database Requirements

- Proper ObjectId references
- Required field validation
- Compound indexes for common filters
- Unique business identifiers
- Uniqueness constraints on active employee codes
- Appropriate status enums
- Effective-dated policies
- Consistent timestamps
- Optimistic concurrency where relevant
- Transactions for critical operations
- Paginated queries
- Explicit deletion/retention policies

Do not store calculated salary or attendance values without clear computation ownership and reconciliation rules.

Use migrations/versioned data updates when changing persisted schemas.

## High-Priority Integrity Rules

- One active employee code per company.
- One authoritative attendance state per employee per relevant shift occurrence.
- A payroll entry must have a unique employee + period + run identity.
- Leave posting must be idempotent.
- Assets cannot have conflicting active assignments.
- Documents must reference an authorized owner/context.
- Sensitive changes must preserve audit history.
- Payroll snapshots must survive subsequent employee profile or salary policy changes.

---

# 28. REST API ARCHITECTURE

Use `/api/v1` as the base API prefix.

## Authentication

- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `POST /auth/change-password`

## Employees

- `GET /employees`
- `POST /employees`
- `GET /employees/:id`
- `PATCH /employees/:id`
- `POST /employees/:id/archive`
- `GET /employees/me`

## Attendance

- `GET /attendance/me`
- `POST /attendance/punch-in`
- `POST /attendance/punch-out`
- `GET /attendance`
- `POST /attendance/regularizations`
- `POST /attendance/regularizations/:id/approve`
- `POST /attendance/regularizations/:id/reject`

## Leaves

- `GET /leaves/me`
- `POST /leaves`
- `GET /leaves`
- `POST /leaves/:id/approve`
- `POST /leaves/:id/reject`
- `POST /leaves/:id/cancel`
- `GET /leave-balances/me`

## Payroll

- `GET /payroll/periods`
- `POST /payroll/periods`
- `POST /payroll/periods/:id/calculate`
- `POST /payroll/periods/:id/submit`
- `POST /payroll/periods/:id/approve`
- `POST /payroll/periods/:id/finalize`
- `GET /payroll/periods/:id/entries`
- `GET /payslips/me`
- `GET /payslips/:id/download`

## Other API Modules

Implement appropriately structured REST endpoints for:

- Departments
- Designations
- Branches
- Shifts
- Holidays
- Leave Policies
- Salary Structures
- Recruitment
- Onboarding
- Performance
- Exit Management
- Assets
- Documents
- Tasks
- Daily Reports
- Announcements
- Notifications
- Helpdesk
- Reports
- Company Settings
- Roles & Permissions
- Audit Logs

## API Requirements

- Consistent JSON response contract
- Proper HTTP status codes
- Central error handler
- Request validation
- Permission middleware
- Ownership/scope validation
- Idempotency support for sensitive mutations
- Correlation/request IDs
- OpenAPI documentation
- Pagination metadata
- Standard error codes
- No internal stack traces in production responses

---

# 29. FRONTEND APPLICATION STRUCTURE

Use a clean project structure:

```text
abco-hrms/
├── client/
│   ├── public/
│   ├── src/
│   │   ├── app/
│   │   ├── assets/
│   │   ├── components/
│   │   │   ├── ui/
│   │   │   ├── layout/
│   │   │   ├── forms/
│   │   │   └── charts/
│   │   ├── features/
│   │   │   ├── auth/
│   │   │   ├── dashboard/
│   │   │   ├── employees/
│   │   │   ├── attendance/
│   │   │   ├── leaves/
│   │   │   ├── shifts/
│   │   │   ├── payroll/
│   │   │   ├── recruitment/
│   │   │   ├── onboarding/
│   │   │   ├── performance/
│   │   │   ├── assets/
│   │   │   ├── tasks/
│   │   │   ├── reports/
│   │   │   └── settings/
│   │   ├── hooks/
│   │   ├── lib/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── stores/
│   │   └── styles/
│   └── package.json
│
├── server/
│   ├── src/
│   │   ├── config/
│   │   ├── middleware/
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   ├── employees/
│   │   │   ├── attendance/
│   │   │   ├── leaves/
│   │   │   ├── payroll/
│   │   │   ├── recruitment/
│   │   │   ├── onboarding/
│   │   │   ├── performance/
│   │   │   ├── tasks/
│   │   │   ├── assets/
│   │   │   ├── reports/
│   │   │   └── settings/
│   │   ├── shared/
│   │   ├── jobs/
│   │   ├── database/
│   │   ├── app.js
│   │   └── server.js
│   └── package.json
│
├── shared/
│   ├── constants/
│   └── schemas/
│
├── tests/
├── docs/
├── scripts/
├── .env.example
├── package.json
└── README.md
```

Use a single npm workspace root for dependency management and development commands.

Keep frontend, backend and shared-package imports explicit and deployable.

Avoid importing files through accidental absolute filesystem paths.

Each backend module should contain routes, controller, service, model, validation and permission logic where appropriate.

---

# 30. PERFORMANCE & SCALABILITY

## Frontend

- Route-based lazy loading
- Code splitting
- Query caching
- Avoid unnecessary renders
- Debounced search
- Server-side pagination
- Virtualized long tables where required
- Optimized image delivery
- Loading skeletons
- Minimal JavaScript bundle size

## Backend

- Database query optimization
- Compound indexes
- Lean read queries where appropriate
- Indexed pagination
- Avoid N+1 database queries
- Bulk operations for safe batch workloads
- Queue-based PDF generation
- Background processing for scheduled tasks
- Connection pooling
- Graceful shutdown
- Health checks

## Reliability

- Handle failed background jobs
- Use retries with bounded exponential backoff
- Prevent duplicate processing
- Preserve critical write consistency
- Handle network timeouts
- Avoid long synchronous request handlers

---

# 31. SECURITY & PRIVACY REQUIREMENTS

Treat this as an application containing sensitive employee and payroll information.

Mandatory:

- Authentication on all protected endpoints
- Object-level authorization
- Field-level sensitive-data protection
- Server-side input validation
- Proper output encoding
- Safe upload handling
- Strict CORS policy
- CSRF protection
- Secure headers
- HTTP request rate limiting
- NoSQL injection prevention
- MongoDB operator injection defenses
- Password hashing
- HTTPS-only production transport
- Secure document access
- Audit logging
- Backup encryption
- Secret management
- Least-privilege database credentials
- No debug credentials in production
- No default admin password
- No PII in ordinary logs

## Bootstrap Admin

Provide a controlled initial Super Admin creation process.

Use environment-provided credentials or a secure one-time setup flow.

Do not create a hardcoded default account.

Ensure initial setup cannot be replayed to create additional unauthorized privileged accounts.

## Data Governance

- Configurable retention policies
- Backup and recovery procedures
- Access logs for sensitive records
- Authorized data export
- Archival policy for departed employees
- Controlled data deletion
- Documentation for privacy and statutory obligations

Compliance with Indian legal and employment requirements must be verified against the business's jurisdiction and policies before production activation.

---

# 32. AUDIT LOGGING

Create immutable audit events for sensitive actions.

Audit:

- Employee creation
- Employee profile changes
- Salary changes
- Attendance corrections
- Leave approvals
- Payroll calculations/finalization
- Role/permission changes
- Sensitive document access
- Sensitive exports
- Authentication and security events
- Company policy changes

Each log should capture:

- Actor
- Action
- Resource
- Resource identifier
- Timestamp
- Request/correlation ID
- Changed field names
- Appropriate before/after summaries
- Source metadata where permitted

Never store passwords, authentication tokens, bank account details or unnecessary personal data in audit logs.

---

# 33. TESTING REQUIREMENTS

Use Vitest or an equivalent suitable test runner, Supertest for API testing and Playwright for end-to-end testing.

## Unit Tests

- Attendance duration
- Overnight shift handling
- Late arrival
- Leave day calculation
- Leave ledger operations
- Payroll component calculations
- Net salary calculation
- Access-control utilities
- Approval transitions

## Integration Tests

- Authentication/session workflow
- Employee creation
- Attendance updates
- Leave approval
- Payroll lifecycle
- Document access authorization
- Reporting permissions
- Transaction rollback
- Idempotency/retry behavior

## End-to-End Tests

- Login and logout
- HR adds employee
- Employee punches in
- Employee submits daily report
- Employee punches out
- Employee applies for leave
- Manager approves leave
- HR reviews attendance
- Payroll team processes payroll
- Employee downloads payslip
- Employee cannot access another employee's private data

## Quality Requirements

- No production build errors
- No unhandled promises
- No broken routes
- No fake API responses
- No inaccessible primary controls
- No missing validation
- No critical console errors
- No unauthorized data leaks
- Responsive screens tested
- Keyboard-accessible forms
- Screen-reader-friendly labels

Add automated CI checks for linting, testing, building and security/dependency scanning.

---

# 34. PRODUCTION DEPLOYMENT

Target environment:

- Ubuntu VPS
- Nginx
- PM2
- MongoDB Atlas or secured MongoDB deployment
- Redis
- HTTPS with valid SSL certificate
- Dedicated application domain/subdomain

## Deployment Requirements

- Production frontend build
- Node.js backend under PM2
- Nginx reverse proxy
- Dedicated Nginx server block
- Environment-based configuration
- Secure cookie domain configuration
- WebSocket/real-time configuration only if required
- Trusted proxy configuration
- Process restart policies
- Structured application logging
- Health endpoint
- Readiness checks
- Graceful shutdown
- Automated database backups
- Backup restore testing
- Error monitoring
- Basic metrics and alerting
- Deployment rollback procedure

Do not overwrite global Nginx settings that could affect other websites hosted on the same VPS.

Provide deployment scripts, PM2 ecosystem configuration, example Nginx configuration and production documentation.

Do not include real secret values in any generated files.

---

# 35. ESSENTIAL USER JOURNEYS

Implement and test these complete real-world workflows.

## Journey A: New Employee

HR creates employee → Assigns department/designation → Assigns manager → Configures shift → Assigns salary structure → Uploads documents → Sends activation invitation → Employee activates account → Employee completes profile → Dashboard becomes available.

## Journey B: Daily Employee Workflow

Employee logs in → Punches in → Views tasks → Performs work → Submits daily report → Punches out → Attendance updates → HR/manager dashboards reflect results.

## Journey C: Leave Approval

Employee checks balance → Applies for leave → Manager receives notification → Manager approves/rejects → Leave ledger updates → Attendance reconciles → Employee receives outcome.

## Journey D: Monthly Payroll

HR verifies attendance → Payroll team locks inputs → Engine calculates payroll → Authorized approver reviews → Payroll finalized → Payslips generated → Employee can download payslip → Payroll close is audited.

## Journey E: Exit Management

Employee submits resignation → Manager reviews → HR approves → Notice period and clearance tracked → Assets returned → Final settlement reviewed → Account disabled → Historical records retained.

## Journey F: Attendance Regularization

Employee submits correction → Authorized manager reviews → Approved correction recorded → Attendance reconciled → Payroll impact evaluated based on payroll lock state.

---

# 36. IMPLEMENTATION SEQUENCE

Do not attempt to build all modules as one monolithic implementation.

Implement incrementally while maintaining a working application.

## Phase 1 — Foundation

- Workspace setup
- Configuration
- Database connection
- Design system
- Shared UI components
- Authentication
- RBAC
- Core App Shell
- Error handling
- Audit foundations
- Testing infrastructure

## Phase 2 — Organization & Employees

- Company settings
- Departments
- Designations
- Branches
- Employee management
- Employee profiles
- Document foundations

## Phase 3 — Attendance

- Shift configuration
- Attendance engine
- Punch in/out
- Attendance dashboard
- Regularization
- Holiday calendars
- Timezone edge cases

## Phase 4 — Leave Management

- Leave policies
- Leave ledger
- Employee requests
- Manager approvals
- Leave calendar
- Notifications

## Phase 5 — Employee Operations

- Employee dashboard
- Daily reports
- Task management
- Announcements
- Helpdesk

## Phase 6 — Payroll

- Salary structures
- Payroll engine
- Payroll approvals
- Payslip PDF
- Payroll reporting
- Input reconciliation

## Phase 7 — Advanced HR Operations

- Recruitment
- Onboarding
- Performance
- Assets
- Exit management

## Phase 8 — Reporting

- Dashboards
- HR analytics
- Report exports
- Department reports
- Audit reporting

## Phase 9 — Production Hardening

- Security review
- Automated testing
- Performance profiling
- Database index review
- Build optimization
- Accessibility review
- Backup/recovery verification
- Monitoring
- VPS deployment documentation

For every phase:

1. Implement backend schemas and business logic.
2. Implement secure API endpoints.
3. Implement frontend UI.
4. Connect actual backend data.
5. Add validation and error handling.
6. Write tests.
7. Run tests and production builds.
8. Report results and remaining work.

Do not mark a phase complete if it only has UI screens.

---

# 37. CODING STANDARDS

- Use clean, readable JavaScript/JSX.
- Use ES modules consistently.
- Use feature-based architecture.
- Avoid excessive abstraction.
- Avoid giant components and controllers.
- Keep business rules in backend services.
- Reuse shared validation schemas.
- Use consistent naming conventions.
- Use centralized authorization utilities.
- Add meaningful error handling.
- Never swallow errors silently.
- Avoid mock data in production paths.
- Document environment variables.
- Avoid hardcoded URLs, credentials and configuration.
- Preserve database integrity.
- Avoid unnecessary dependencies.
- Use responsive Tailwind patterns.
- Build accessible interfaces.
- Keep code maintainable and testable.

---

# 38. REQUIRED DELIVERABLES

Provide a working project with:

1. Complete React frontend
2. Complete Express backend
3. MongoDB models and indexes
4. Secure authentication
5. Configurable RBAC
6. Admin, HR, Manager and Employee dashboards
7. Functional employee management
8. Functional attendance management
9. Functional leave management
10. Functional payroll management
11. Daily work reporting
12. Recruitment and onboarding
13. Performance management
14. Asset management
15. Exit management
16. Helpdesk
17. Notifications
18. Reports and exports
19. Secure document management
20. Company settings
21. Audit logging
22. Test suite
23. API documentation
24. Environment templates
25. Deployment configurations
26. Setup documentation
27. Production readiness checklist

---

# 39. DEFINITION OF DONE

A module is complete only when:

- Its pages render correctly.
- Its API endpoints are operational.
- Its data persists in MongoDB.
- Its business rules are enforced.
- Its permissions work at the backend.
- Its loading, empty and error states work.
- Its forms are validated.
- Its tests pass.
- Its major workflows can be completed end-to-end.
- It introduces no regression to existing modules.
- It builds successfully for production.

Do not claim production readiness without passing the required verification checks.

---

# 40. FINAL EXECUTION INSTRUCTIONS FOR CODEX

Start by inspecting the repository.

If the repository is empty, initialize the specified MERN workspace.

If an existing project is detected, inspect its structure and preserve compatible working functionality. Do not destroy existing code or data.

First produce:

- Architecture overview
- Application module map
- Database relationship and integrity design
- RBAC permission matrix
- Development implementation sequence
- Environment variable checklist

Then begin implementing Phase 1 immediately.

Do not stop after producing the architecture document.

Continue implementing the phases in dependency order while preserving existing working functionality.

For each development milestone:

- Explain which files were created or modified.
- Explain what functionality is operational.
- Run available tests/build checks.
- Show the actual test/build results.
- Identify incomplete functionality explicitly.
- Continue to the next logical development step.

**IMPORTANT FINAL DESIGN DIRECTION**

ABCO HRMS must look like a sophisticated 2026 enterprise HR platform.

- Clean white background
- Deep navy blue identity
- Beautiful dashboard cards
- Premium professional typography
- Refined sidebar
- Smooth navigation
- Modern data tables
- Clear form layouts
- Responsive design
- Consistent UI across every module

The final product should feel comparable in polish and usability to premium modern SaaS platforms, while being uniquely branded for ABCO Computers.

**Build a real, complete, secure and maintainable HRMS — not a template, prototype, mockup or disconnected dashboard.**
