# Architecture

The npm workspace has a React client in `frontend/` and Express API in `backend/`. Production serves frontend and `/api/v1` from one HTTPS origin. Development uses Vite :5180 with an API proxy to :4000.

## Identity and access

Mongo-backed HttpOnly sessions carry identity, CSRF token, authentication version and recent reauthentication time. Passwords use Argon2id. Login rotates sessions; password/role changes invalidate existing authentication versions. MFA uses encrypted TOTP secrets, replay counters and single-use hashed recovery codes. Reset email uses a durable encrypted outbox; SMTP delivery remains external.

Roles hold permissions and Company, Department, Branch, Direct reports or Own scopes. AsyncLocalStorage context applies owner filters to employee-bound Mongoose queries, writes and aggregates. Explicit system-scope lookups are bounded for reporting-manager resolution and colleague selection. Route permission and owner checks remain mandatory.

## Domain boundaries

- Core models/app/setup: employees, identity, organization masters and transactional setup.
- Attendance: shifts, timezone/overnight calculations, corrections, date locks and day-specific swap overrides.
- Leave: requests, approvals, cancellation, balance reservations, accrual and encashment.
- Payroll: versioned salary structures, immutable snapshots, bank encryption, adjustments, loan recovery, settlements and payslips.
- Operations: tasks, daily reports, announcements, notifications, tickets, holidays, settings, reminders and calendars.
- HR: recruitment, onboarding, performance/peer feedback, improvement plans, assets, maintenance and exits.
- Extended modules: projects/timesheets, learning/skills, expenses/travel and engagement.
- Approvals: configured multi-step decisions, delegation, escalation thresholds and history.
- Documents: encrypted private files, version history, session-bound grants and approved letter templates.
- Admin: permissions, imports, reports, organization configuration and branding.

## Transactions and history

MongoDB must support transactions. Attendance, leave and payroll mutations share employee write locks to serialize conflicting operations. Leave reserves balances; final approval consumes reservations once. Independent cancellation approval restores used days and reconciles attendance. Payroll locks historical workdays and freezes employee, salary, company and masked payment information.

Preapproval reopening archives old payroll entries before recalculation. Loan installments are reserved during calculation, reversed on reopening and posted at finalization. Settlement requires a separate approver, source revalidation and clearance. Payment records describe external transfers; they do not initiate them.

## Files and background work

Private PDF/PNG/JPEG files are signature checked, bounded and AES-GCM encrypted. Grants bind session, user, version and expiry. No private document folder is served publicly. Local storage needs a persistent private volume; distributed storage and antivirus scanning remain deployment work.

Email/reminder workers use durable records, leases and deduplication. Reminder claims and in-app notifications are transactional. Request logs exclude bodies and signed query strings. Audit records store action metadata.

## Recovery

The backup utility streams BSON-preserving records and private encrypted files into compressed AES-GCM archives. Stopped writers and a separate key are required. Verification authenticates the archive before reconstructing it into random temporary database/storage targets; cleanup is restricted to those targets. Live cutover, indexes, retention and off-server recovery drills remain operator responsibilities.

PM2/Nginx examples are dedicated to this app and have not been installed on a live production host. The function audit distinguishes implemented paths from partial behavior and external blockers.
