# Sample records

The user explicitly requested three working sample records throughout the HRMS. The `abco-demo-v1` dataset was added to the local development database. All visible sample titles/codes start with `DEMO`; fictional emails use `example.test`.

Each seeded business collection has three sample records. Organization has three records in each of four categories (12 total); private documents contain three of each sample category: general documents, sample letters, resumes, receipts, task attachments and ticket attachments (18 total). Notifications contain three for each existing authorized admin/HR recipient.

Relations connect employees to departments, designations, shifts, projects, tasks, reports, leave balances/reservation ledgers, training, skills, candidates/jobs, performance, peer feedback, maintenance history, expenses and exit previews. Private PDFs are valid generated files stored using the existing encrypted document writer.

Sample employee accounts are inactive with no passwords. Existing login credentials remain unchanged. No emails, salary releases, bank transfers, approved loans or financial recovery transactions were invented. Payroll months remain draft; loan/settlement requests and payroll adjustments need their normal review lifecycle. Payslips and posted recovery ledgers therefore are not prefilled. Sample letter templates, approval configurations and delegations remain inactive; company policy/settings are preserved.

## Run and verify

```sh
npm run seed:demo
npm run verify:demo
```

Seeding uses stable IDs and insert-if-missing behavior. It does not reset edits/statuses made through the app. The second run verifies records instead of creating another set. The verifier uses an isolated in-process MemoryStore session for the existing administrator; it never changes a real password or persisted session. It reads the actual connected APIs and verifies a private signed PDF download. No authentication bypass route is added to the app.

See [exact counts and API results](demo-data-report.json). Verification demonstrates read paths and private download functionality; it does not certify every seeded workflow transition or resolve production audit gaps.
