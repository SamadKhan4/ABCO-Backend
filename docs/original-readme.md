# ABCO Computers HRMS

MERN application with separate **frontend** (React/Vite) and **backend** (Express/MongoDB) folders. Requires Node **24.14+** and a MongoDB replica set.

The app has connected HR workflows and automated database/browser checks. This is **not a declaration that all 493 requested functions are production complete**. See the [function audit](docs/function-audit.md), [release status](docs/release-status.md) and [deployment guide](docs/deployment.md).

## Start locally

```sh
npm ci
node scripts/configure-local.mjs
npm run migrate
npm run dev
```

Open **http://127.0.0.1:5180**. The API listens on localhost:4000. Configure `backend/.env` using [backend/.env.example](backend/.env.example). MongoDB transactions require a replica set. On PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`.

Existing accounts/passwords are preserved. On a fresh database run `npm run setup`, then use its expiring one-time link to choose the initial administrator. Employees receive single-use activation links. Passwords and sample business data are not committed. Migration updates standard HR/finance grants and creates indexes without deleting records; review custom access policies before production migration.

## Connected workflows

- Sessions, CSRF, Argon2 passwords, lockout, reauthentication, TOTP MFA and recovery codes; reset email requires SMTP.
- Employee directory, CSV import, private profiles, organization masters, department heads/hierarchy, managers and scoped roles.
- Effective-dated/overnight shifts, breaks, WFH, corrections, colleague-consented shift swaps and calendars.
- Configured leave policies, half days, accrual, balance adjustments, encashment and reviewed cancellation with transactional ledgers.
- Integer-paise salary components, independent payroll approvals, historical locks, adjustment archives, encrypted bank data, loan recovery and final settlement.
- Released PDF payslips and bounded bulk ZIP downloads; approved templates generate private employment letters.
- Tasks, daily-report rejection/resubmission, projects/timesheets, recruitment, onboarding, performance/360 feedback and improvement plans.
- Training/skills, expenses/receipts, travel/settlement, surveys/recognition, assets/maintenance, exits/interviews, announcements and helpdesk escalation.
- Scoped CSV/XLSX/PDF exports, configured reminders, audit records and private encrypted document storage.

These describe connected implementations; per-function limitations remain in the audit. Statutory tax engines have not been implemented or certified. Salary components/settlement amounts require finance approval. Recording a payment reference does not transfer money.

## Sample data

The local database now contains three clearly labelled `DEMO` records per seeded business list, with linked employees, organization records, projects, tasks, leave, learning, recruitment, assets, expenses and private PDFs. See [sample-data report](docs/demo-data-report.json) for exact counts and API verification.

```sh
npm run seed:demo
npm run verify:demo
```

The seed preserves existing records and uses stable IDs to avoid duplicates. It refuses production mode. Sample employees have inactive accounts without passwords; use the existing administrator/HR account to inspect them. Financial requests remain draft/pending and do not represent real payments. Released payslips and repayment ledgers require the real approval lifecycle. Sample approval configurations and legal templates are inactive, so they do not replace company policy.

## Automated checks

```sh
npm test
npm run test:integration
npm run test:e2e
npm run lint
npm run format:check
npm run build
npm audit --omit=dev
npm run check:production
```

Tests create random `abco_test_*` databases, temporary storage and test-only credentials; cleanup is restricted to those targets. Local MongoDB is required. Browser tests use Edge on Windows and Chromium on Linux. CI installs Chromium through Playwright.

`check:production` deliberately fails until deployment configuration and operator/business approvals are supplied. It does not deploy the app or certify statutory compliance. Serve `frontend/dist` and `/api` through one dedicated HTTPS reverse proxy; `npm start` runs the API.

See [architecture](docs/architecture.md), [API reference](docs/api.md) and [deployment/recovery](docs/deployment.md). Keep private encryption keys separate from encrypted backups.
