# Deployment and recovery

Artifacts are prepared; no live domain/server has been deployed or certified. Review the [function audit](function-audit.md) before authorizing real payroll.

## Dedicated deployment

1. Use Node 24.14+ and a dedicated MongoDB replica set with authentication, private networking and persistent storage. Keep MongoDB off the public Internet.
2. Run `npm ci` separately inside `backend/` and `frontend/`. Run backend operational commands from `backend/`. Review `npm run migrate` standard-role grants before applying migration; it preserves data and creates indexes. Reconcile duplicate legacy records explicitly if an index fails.
3. Run backend tests and lint from `backend/`, and `npm run build` from `frontend/`. Serve `frontend/dist` through a dedicated Nginx site based on `backend/deploy/nginx.conf.example`; replace domain, certificates and paths. Frontend/API must share the HTTPS origin.
4. Configure ignored `backend/.env`: `NODE_ENV=production`, `HOST=127.0.0.1`, HTTPS `FRONTEND_ORIGIN`, authenticated `MONGODB_URI`, random `SESSION_SECRET`, persistent `DOCUMENT_KEY` and a different `BACKUP_KEY`. Both encryption keys must be 32-byte hex values.
5. Keep `DOCUMENT_STORAGE_PATH` on a private persistent volume. Relative paths resolve from `backend/`; default `storage/documents`. Never serve it with Nginx.
6. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, optional `SMTP_USER`/`SMTP_PASSWORD`, and `SMTP_FROM`. Verify real reset/notification delivery. The durable worker retries errors; configuration alone does not prove delivery.
7. Start `pm2 start deploy/ecosystem.config.cjs`. It runs one API instance bound to localhost. Do not overwrite another application's global proxy/process configuration.
8. Verify certificates, secure session cookies, activation, login/logout, MFA recovery, role separation, private downloads and a finance-approved payroll cycle. Provision separate processor/approver people through Access settings.

## Business configuration

Company settings include financial-year start month, timezone, daily-report rules, WFH, shift swaps, finance exit clearance and reminders. Leave, expense and loan entitlements must be explicit. Approval requests snapshot their configured steps.

PF/ESI/professional-tax/TDS engines, automatic statutory filings and jurisdiction-specific certification remain unimplemented. Fixed salary components do not replace a verified statutory engine. Finance must supply and validate applicable policy before real payroll. Biometric hardware requires its vendor adapter.

Set `BUSINESS_POLICY_APPROVED=YES` only after owner/finance validation. Set `DEPLOYMENT_VERIFIED=YES` only after HTTPS, recovery and retention checks. `npm run check:production` reports missing configuration without secrets; these acknowledgements do not erase partial audit entries.

## Encrypted backup

Retain `BACKUP_KEY`, `DOCUMENT_KEY` and database credentials securely **outside** the archive. Without the document key, restored files/bank/MFA secrets are unusable. Without the backup key, the archive cannot be decrypted.

Stop API and workers so database metadata and document bytes remain consistent. Create a private archive destination first. PowerShell example:

```powershell
$env:HRMS_MAINTENANCE_ACK = 'YES'
npm.cmd run backup:create -- C:\PrivateBackups\abco-2026-11-02.abco
npm.cmd run backup:verify -- C:\PrivateBackups\abco-2026-11-02.abco
Remove-Item Env:HRMS_MAINTENANCE_ACK
```

Restart the API and verify `/api/v1/health`. Copy the encrypted archive off-server under an approved retention schedule. The archive excludes sessions, `.env` and indexes. Retain keys separately and recreate indexes with migration during recovery.

Verification authenticates the complete AES-GCM archive before reconstructing BSON and private files in an `abco_restore_test_<uuid>` database and isolated storage directory. It checks completion, reports counts and removes only its own temporary targets. Wrong keys/corrupt archives are rejected before target writes. This was tested with isolated records.

The utility exposes **create** and **verify**; it intentionally has no live database overwrite command. Actual disaster recovery requires an operator-controlled maintenance window, restoration to a new production candidate, index creation, restored-key configuration, content/permission checks and explicit connection cutover. Live cutover and off-server restore drills have not been performed here.

## Release gates

Resolve or explicitly accept every partial audit entry. Real-headcount load testing, monitoring/alerts, distributed storage/virus scanning if needed, SMTP delivery and HTTPS verification remain deployment work. CI configuration is supplied; a hosted CI run has not been observed here.
