# Kooner Fleet Management System — Stage 6 Backend / Shared Platform

Stage 6 puts a real shared PostgreSQL/API platform underneath the approved Stage 3–5 interfaces. It does **not** redesign the approved Kooner operation and it does **not** connect live external providers.

## Architecture overview

- Existing repository remains the single Kooner codebase.
- Node.js 20 + Express provides the Web/API service.
- PostgreSQL 16 is the shared authoritative database in the Stage 6 acceptance environment.
- `server/` contains authentication, permissions, business rules, sync, audit, pricing, billing and compatibility services.
- `server/migrations/` contains version-controlled PostgreSQL migrations.
- `server/seed.js` creates controlled Stage 1–5 regression fixtures and Stage 6 test identities.
- `server/regression-seed.js` reconciles the approved fixed-maintenance and other regression fixtures without making the browser authoritative.
- `stage6-client.js` is a **temporary API-backed compatibility bridge** so the approved Stage 3–5 screens can keep their existing journeys while reads/writes go through the authenticated backend/database.
- If the Stage 6 API cannot be reached, the acceptance environment fails closed instead of silently falling back to legacy browser business data. Technician offline operation is the controlled exception.

## Local development setup

Requirements:

- Node.js 20
- PostgreSQL 16 or compatible supported PostgreSQL instance
- npm

Typical setup:

```bash
npm install
export APP_ENV=development
export NODE_ENV=development
export DATABASE_URL='postgresql://...'
export TEST_USER_PASSWORD='use-a-test-secret-of-at-least-14-characters'
export MFA_ENCRYPTION_KEY='development-secret'
export SESSION_SECRET='development-secret'
npm run migrate
npm run seed
npm test
npm start
```

Do not commit real credentials. A developer should use local environment variables or an approved secret manager.

## Required environment variables

- `NODE_ENV=production` on Render runtime.
- `APP_ENV=stage6-test` while Stage 6 is under acceptance test.
- `DATABASE_URL` — Render PostgreSQL Internal Database URL in the hosted environment; never hard-code it.
- `TEST_USER_PASSWORD` — test-only shared password secret for the controlled Stage 6 test identities.
- `MFA_ENCRYPTION_KEY` — secret used to encrypt the test MFA secret at rest.
- `SESSION_SECRET` — service secret used as cryptographic fallback material.
- `PG_POOL_MAX` — optional database pool size.
- `OBJECT_STORAGE_PROVIDER` — currently `Not Connected` for Stage 6.
- `BACKUP_STATUS` — deliberately records the unresolved backup/recovery production dependency.

## Database setup and migrations

Run:

```bash
npm run migrate
```

Startup also runs migrations idempotently before the service starts. Migration state is recorded in `schema_migrations` and is visible through the authorised Admin/System endpoint.

Current Stage 6 acceptance migration chain:

1. `001_stage6_foundation.sql`
2. `002_stage6_scope_hardening.sql`
3. `003_stage6_portal_persistence.sql`
4. `004_stage6_evidence_metadata.sql`
5. `005_stage6_business_rule_hardening.sql`
6. `005_stage6_labour_review_versioning.sql`
7. `006_stage6_portal_action_resolution.sql`

The two `005` migrations are separate already-applied migrations and are retained by filename rather than renamed after deployment. Core records are relational/queryable rather than stored as one monolithic browser JSON blob.

## Seed and regression data

Run:

```bash
npm run seed
```

The seed is idempotent and establishes the known test customers, Sites, Vehicles, Work Orders, Technician records, Estimates, invoices, document visibility cases, DCR register and controlled users. `server/regression-seed.js` also restores approved Stage 1–5 regression fixtures such as the October 2026 fixed-maintenance total of **£492.10**.

Test-user password hashes are reconciled from the current Render `TEST_USER_PASSWORD` secret at Stage 6 test startup. The password itself is never stored in source control.

## Test accounts

Internal:

- `operations@kooner.test`
- `dispatcher@kooner.test`
- `technician@kooner.test`
- `billing@kooner.test`
- `admin@kooner.test`

Customer:

- `customer.admin@testtransport.test`
- `birmingham.manager@testtransport.test`
- `finance@testtransport.test`
- `customer.admin@demologistics.test`
- `readonly@testtransport.test`

All controlled Stage 6 test identities use the Render `TEST_USER_PASSWORD` value. Do not write the password into this repository or into production-facing source.

## Test commands and final Stage 6 evidence

Unit/business-rule tests:

```bash
npm test
```

The Stage 6 Render service runs the unit suite before server startup. In `APP_ENV=stage6-test`, startup then runs the deployed live acceptance suites against the actual Web/API + PostgreSQL service.

Final comprehensive acceptance evidence on build `687db12d1df5f6ef379987e7c957fa877236042e`:

- unit/business-rule tests: **17 passed / 0 failed**
- core live acceptance: **24 passed / 0 failed**
- final comprehensive live acceptance: **42 passed / 0 failed**

The final deployed suite proves shared cross-interface records, authentication, Customer/Site isolation, Read Only enforcement, concurrency conflict detection, invalid state transitions, document/invoice scope, idempotent Technician sync, pricing, billing, fixed maintenance, persistence across redeploy, search, exports/import preview, Technician Labour Review, customer lower-mileage review, effective-dated Vehicle Site movement, Emergency/VOR triage continuity and DCR promotion.

`Ready to Test` means ready for Jon/user acceptance. It does **not** mean production security sign-off.

## Render deployment method

Stage 6 uses the same repository and Kooner Render workspace with:

- Web/API service: `kooner-stage6-app`
- PostgreSQL database: `kooner-stage6-postgres`

The service build command installs production dependencies and the start command runs the test gate then `server/start.js`. Startup runs migrations, seed/reconciliation, test-credential reconciliation and current-deploy acceptance evidence.

Main Stage 6 URL:

`https://kooner-stage6-app.onrender.com`

Interfaces:

- Operations/Desktop: `https://kooner-stage6-app.onrender.com/`
- Technician Mobile: `https://kooner-stage6-app.onrender.com/technician.html`
- Customer Portal: `https://kooner-stage6-app.onrender.com/customer.html`
- Login: `https://kooner-stage6-app.onrender.com/stage6-login.html`

## Main API endpoints

- `GET /api/v1/health/live`
- `GET /api/v1/health/ready`
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/logout`
- `GET /api/v1/bootstrap`
- Work Order, Vehicle, Estimate, Billing, Portal, Document and Mileage routes under `/api/v1/`
- `POST /api/v1/sync/...` for Technician Mobile server sync
- `GET /api/v1/search`
- `GET /api/v1/audit`
- `GET /api/v1/dcr`
- `GET /api/v1/admin/system`
- permission-scoped CSV export and vehicle import-preview endpoints

## Security controls in the Stage 6 foundation

- Passwords use salted scrypt hashes.
- Sessions use random tokens; only token hashes are stored server-side.
- Session expiry/revocation and inactive-user rejection are server-controlled.
- Customer/Site roles and permissions are resolved server-side.
- CSRF checks protect authenticated mutation routes where applicable.
- Sensitive endpoints have request-size controls and rate limiting.
- SQL calls are parameterised.
- secure headers are applied through Helmet.
- optimistic record versions prevent silent stale writes.
- idempotency keys and unique Technician sync event IDs prevent duplicate application.
- Customer Portal never receives Internal Only documents or internal technician cost data.
- invoice and document scope fail closed where required scope cannot be established.
- audit events are generated by the server for controlled actions.
- production penetration testing remains a deferred dependency; Stage 6 does not claim formal security certification.

## Important business-rule controls proven in Stage 6

- Technician actual time is distinct from Customer Billable Labour. Billing cannot validate a Work Order while a Technician Labour Review is unresolved; the commercial decision is made by an authenticated authorised user and is audited.
- A lower Customer Portal mileage reading without an explanation is rejected. A lower reading with an explanation is retained as an exception/review record and does not reduce trusted vehicle mileage.
- Vehicle Home Site changes create effective-dated Site Assignment history using the chosen effective date and reason rather than silently replacing previous history.
- Emergency/VOR Portal requests cannot disappear from Operations attention merely because an action is marked reviewed. Standard triage remains active until the request is converted into operational work or deliberately closed with an authorised reason.
- Attendance completion does not automatically imply Work Order completion.

## Backup / recovery notes

Stage 6 proves **application redeploy persistence**: database-backed records survive Web/API redeployment and browser clearing. It does **not** claim completed production backup/restore assurance.

`DCR-108 – Backup / Recovery Foundation` remains **Agreed / Deferred Production Dependency** until a production-grade backup schedule, retention policy, restore procedure and actual restore test are approved and evidenced.

The current Render PostgreSQL free test database is an acceptance/development resource, not the final production continuity design.

## Development/Test reset

A guarded development/test reset exists and is not intended for normal production use. It can rerun migrations/seed and restore known Kooner test scenarios. Production must not expose a casual reset route or test credentials.

## Migration / compatibility status

**Database/API Backed:**

- shared Customers, Sites, Vehicles, Work Orders, Attendances and Tasks
- authentication, roles, permissions, sessions and Customer/Site scope
- Estimates and approvals
- pricing rules and effective versions
- fixed-maintenance plans/rates/calculation
- Billing state controls and invoices
- Technician Labour Review commercial authority
- effective-dated Vehicle Site assignments
- append-only mileage/review history
- document metadata/visibility rules
- Customer Portal request/action persistence foundation
- Emergency/VOR triage continuity
- Technician server sync events/conflicts/idempotency
- audit, DCR, feature flags and integration-provider records
- backend search/filter/pagination foundation
- import preview/export foundation
- notification-event/background-job foundation

**Temporary Prototype Compatibility:**

The approved Stage 3–5 front-end screens still use their historic in-browser state shape internally. `stage6-client.js` intercepts the legacy `koonerv1` storage contract and loads/saves that state through the authenticated API/database. Browser storage is therefore a UI cache/compatibility mechanism in Stage 6, **not the system of record**. If the API is unavailable, the interface fails closed rather than treating cached browser business data as authoritative. Technician controlled offline cache/events are the intentional exception.

A future front-end modernisation can progressively replace the compatibility calls with direct resource APIs without redesigning the approved Kooner journeys.

## Known production dependencies

- DCR-108: production backup/recovery verification.
- DCR-115: external penetration testing/formal production security assurance.
- Stage 5 DCR-078 remains visibly deferred as the production Portal security dependency until final production identity/security rollout is approved.
- Production object/media storage provider and malware/content validation remain to be selected/operationalised before real customer files are stored.
- GDPR retention periods require legal/compliance verification.
- Production domain, final environment segregation, monitoring/alerting thresholds and production support procedures require go-live planning.
- Live DVLA, DVSA, telematics, accounting, M365/email, SMS, customer APIs, fuel cards, parts suppliers, maps and payment providers remain **Future Integration – Not Connected**.

## DCR build control

DCR-089 through DCR-115 live in shared backend storage. Current-deploy acceptance evidence promotes implemented Stage 6 items to **Ready to Test** only after both deployed acceptance suites pass with zero failures.

- DCR-089–107 and DCR-109–114: implemented and promoted to **Ready to Test** after current-deploy evidence.
- DCR-108: **Agreed / Deferred Production Dependency** — production backup/recovery verification.
- DCR-115: **Agreed / Deferred Production Dependency** — external penetration testing/formal production security assurance.
- DCR-078 remains **Agreed / Deferred – Production Security Dependency**.

## Stage boundary

Stage 6 is built and deployed for user acceptance testing. Stop here. Do **not** begin Stage 7 or connect live external integrations without explicit approval.
