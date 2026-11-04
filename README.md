# ABCO HRMS backend

Requires Node.js 24.14 or newer and a MongoDB replica set. Run commands from this folder. Frontend and backend are independent npm projects; there is no root npm workspace.

```sh
npm ci
npm run configure:local
npm run migrate
npm start
```

The existing `.env`, accounts and private storage are preserved. `configure:local` creates `.env` only if absent. Review `.env.example` for deployment settings. API: http://127.0.0.1:4000/api/v1/health. For development watch mode use `npm run dev`. Start `../frontend` in a second terminal with `npm run dev`.

For a fresh database only, run `npm run setup` and use the generated one-time administrator link.

Super Admin is a standalone system owner with company-wide permissions, not an employee. New setup creates no employee profile for the owner. For an older bootstrap account, run `node --env-file=.env scripts/separate-system-owner.mjs`: it detaches the employee link, archives the original dummy administrator employee, preserves history/passwords and revokes old sessions. Owner actions remain subject to financial approval and audit rules.

## Checks and operations

```sh
npm test
npm run test:integration
npm run test:e2e
npm run lint
npm run check:production
```

Browser checks require the sibling frontend with its dependencies installed. Production checks require real production settings and operator approvals; a local successful start does not certify deployment or statutory payroll.

Scripts, documentation, tests and deployment templates are inside this backend folder. Run `npm run migrate`, `npm run backup:create -- <archive>` and `npm run backup:verify -- <archive>` here. Build the frontend from `../frontend`, serve its `dist/` through HTTPS and proxy `/api/` to this API. PM2: `pm2 start deploy/ecosystem.config.cjs` from this folder.

The former root workspace manifests/dependencies are preserved in the ignored `.workspace-backup/` directory for recovery; neither application uses them. `ci/workflows/` contains the former root workflow as a reference, not an active GitHub Actions workflow, because the project root intentionally contains only two folders.

See [deployment](docs/deployment.md), [release status](docs/release-status.md) and [function audit](docs/function-audit.md) for operational details and remaining limitations.
