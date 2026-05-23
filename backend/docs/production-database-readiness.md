# Production Database Readiness

Use this checklist before sending production traffic to UniFab.

## Migration Gate

- Production must use `npm run db:migrate`.
- Do not run `npm run db:reset` in production.
- Run `npm run db:preflight` before each release. It checks migration status, canonical table drift, required seeds, foreign keys, storage references, slicer profile files, and required high-traffic indexes.
- If `NODE_ENV=production`, preflight requires these confirmations:
  - `PROD_DB_BACKUPS_CONFIRMED=true`
  - `PROD_DB_PITR_CONFIRMED=true`
  - `PROD_DB_RESTORE_DRILL_CONFIRMED=true`
  - `MYSQL_SLOW_QUERY_LOGS_CONFIRMED=true`
  - `FILE_STORAGE_BACKUP_CONFIRMED=true`

## Managed MySQL

- Enable automated daily backups.
- Enable point-in-time recovery.
- Enable slow query logging at roughly 500 ms for launch, then tighten after real traffic tuning.
- Monitor database size, row counts, slow query count, quote failure rate, cleanup failures, and file reference inconsistencies through the admin database health endpoint.

## Restore Drill

Before launch, perform one restore into staging:

1. Restore the latest managed MySQL backup into a staging database.
2. Restore the matching file storage backup into staging storage.
3. Point staging backend env vars at the restored DB and storage.
4. Run `npm run db:preflight`.
5. Smoke test login, quote upload/recalculate, add to cart, submit request, MyDesigns upload/delete, Design Library detail, and admin print request list.
6. Record restore start/end time and any manual repair steps. Set `PROD_DB_RESTORE_DRILL_CONFIRMED=true` only after this is complete.

## Retention Jobs

Configure these explicitly in production:

- `QUOTE_CLEANUP_INTERVAL_MINUTES`
- `DESIGN_FILE_CLEANUP_INTERVAL_MINUTES`
- `DB_RETENTION_CLEANUP_INTERVAL_MINUTES`
- `QUOTE_ATTEMPT_RETENTION_DAYS`
- `FILE_ACCESS_EVENT_RETENTION_DAYS`
- `DESIGN_MODERATION_RETENTION_DAYS`
- `DESIGN_AUDIT_RETENTION_DAYS`
- `PRINT_REQUEST_EVENT_RETENTION_DAYS`

Keep file storage backup retention aligned with database backup retention, because database rows reference physical model, snapshot, profile, and payment-slip files.
