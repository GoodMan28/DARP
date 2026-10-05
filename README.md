# DARP — Accreditation Data Portal

The institutional data collection portal for **Birla Institute of Technology, Mesra**.

It replaces six Excel workbooks that are currently emailed around the institute for NAAC, NIRF and
QS reporting. Faculty and offices enter each record **once**; the system computes every total,
tracks completion, keeps evidence files with the records, and exports the data back in the layout
of the original workbooks.

- **24 data modules** — one config file each; there is no bespoke code per module.
- **7 roles** — `faculty`, `hod`, `dofa`, `drie`, `dugs`, `cdc`, `admin` (IQAC).
- **Record lifecycle** — `draft → submitted → verified → approved`, plus `returned` with a remark.
- Internal use only. Accounts are created by IQAC; there is no self-registration.

---

## Running it locally

Requires **Node 22**, **Docker** (for PostgreSQL 16) and **git**.

```bash
npm install
cp .env.example .env.local          # then fill in the two keys below
docker compose up -d                # PostgreSQL 16 on :5432
npm run db:setup                    # migrate + harden + seed
npm run dev                         # http://localhost:3000
```

Generate the two secrets `.env.local` needs:

```bash
node -e "const c=require('crypto');console.log('PII_ENCRYPTION_KEY='+c.randomBytes(32).toString('base64'));console.log('SESSION_SECRET='+c.randomBytes(32).toString('base64'))"
```

`npm run db:setup` runs three steps, and the order matters:

| Step | What it does |
|---|---|
| `db:migrate` | Creates the 13 tables, as the database **owner**. |
| `db:harden` | Creates the least-privilege `darp_app` role the application actually connects as, makes `audit_log` append-only with a trigger, and adds the constraints that make illegal states impossible. |
| `db:seed` | 7 departments, 23 master lists, the active cycle, and the first IQAC administrator. |

The seeded administrator comes from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` and is forced to
change its password at first sign-in.

### Demo data

```bash
npm run db:seed:demo             # 11 accounts, ~150 records across all 24 modules and all 5 states
npm run db:seed:demo -- --clear  # remove the demo accounts and their records
```

Demo accounts all use the `@demo.bitmesra.ac.in` domain, so `--clear` can find and remove them.
Sign in as `verma@`, `hodcse@`, `drie@`, `dofa@`, `dugs@`, `cdc@` or `iqac@` with the password the
script prints. **This is review data — delete it before the portal is used for real.**

`--clear` does **not** remove the demo activity from `audit_log` — that table is append-only by
database trigger (see Security posture below), so demo logins and record changes stay visible
there permanently. See `DEPLOYMENT.md` if that matters for your deployment.

> Running `npm run test` truncates the records tables, which removes the demo data with it.
> Re-run `npm run db:seed:demo` afterwards if you want it back.

---

## Verifying it

```bash
npm run verify     # typecheck + lint + 113 unit, integration and security tests
npm run test:e2e   # 11 Playwright journeys against a real browser
```

The E2E suite signs in as real accounts, so it needs `npm run db:seed:demo` to have run.

### What the test suites protect

| Suite | Guards |
|---|---|
| `tests/security/auth.test.ts` | argon2id hashing, AES-256-GCM round-trip and tamper detection, Aadhaar Verhoeff checksum, masking, session-bound CSRF tokens |
| `tests/security/permissions.test.ts` | the whole role matrix, including "another dean cannot read this module" and "no module is verified by its own owner" |
| `tests/security/no-unscoped-queries.test.ts` | a static sweep of `src/`: nothing queries `records` outside the service layer, nothing skips `scopeFilter()`, no raw SQL interpolation, no `dangerouslySetInnerHTML`, no bare route handlers, and `decryptPii` is called in only four allowed places |
| `tests/security/upload.test.ts` | magic-byte sniffing, size caps, rejected file types |
| `tests/integration/records.test.ts` | the lifecycle end to end, IDOR attempts, the duplicate guard, soft deletes, nil returns |
| `tests/integration/export.test.ts` | the six workbooks, seed money converted to lakhs on the way out |
| `tests/unit/*` | period resolution for all 24 modules, config-driven validation, the 49 roll-up counters |

---

## How it is put together

```
src/
├─ modules/          the 24 ModuleConfig files + the registry. The single source of truth
│                    for fields, labels, permissions, list columns and export headers.
├─ server/
│  ├─ auth/          password, session, CSRF, rate limiting, the permission matrix
│  ├─ crypto/        AES-256-GCM for Aadhaar and PAN, masking, Verhoeff
│  ├─ records/       scope filter, validation, storage preparation, the record service
│  ├─ rollups/       the 49 computed counters and completion tracking
│  ├─ evidence/      upload, storage adapter, authorised download
│  ├─ export/        the six workbooks
│  ├─ audit/         the append-only trail
│  └─ http/          withRoute() — the wrapper every API route goes through
├─ components/       hand-written UI: shell, primitives, the generic record form
└─ app/              pages and API routes
```

Two functions are the security boundary and every route passes through both:
**`prepareForStorage`** (nothing unvalidated goes in) and **`presentForRead`** (nothing sensitive
comes out).

### Adding a 25th module

Write one file in `src/modules/`, add it to the registry in `src/modules/index.ts`. The form, the
list view, validation, permissions, the duplicate guard, search, roll-ups and the Excel export all
read that config. No other file changes.

---

## Security posture

- **Passwords** — argon2id (19 MiB, t=2, p=1), 12-character minimum, per-account lockout after 5
  failures and per-IP throttling after 20, identical responses and timing for unknown accounts.
- **Sessions** — 256-bit ids stored as SHA-256 hashes, so a database dump cannot be replayed;
  `HttpOnly` + `SameSite=Lax`, idle and absolute expiry, rotated on sign-in and password change.
- **CSRF** — a session-bound double-submit token plus an `Origin`/`Referer` check on every unsafe
  method, including sign-in itself.
- **Authorisation** — `scopeFilter()` is the one place that decides which rows a query may see, and
  it denies by default. Record-level checks run again on the row actually loaded.
- **Personal data** — Aadhaar and PAN are AES-256-GCM encrypted before they reach the database,
  excluded from search text and list views, and always returned masked. Plaintext is produced only
  by the admin reveal route and the official export, both of which write a `pii.reveal` audit entry
  **before** returning anything.
- **Uploads** — extension, declared MIME and magic bytes must all agree; 5 MB cap; server-generated
  storage names; files live outside `public/` and are served only through an authorised route.
- **Audit** — append-only, enforced by a database trigger and revoked grants. Not even the database
  owner can rewrite it.
- **Headers** — CSP with a per-request nonce, `X-Frame-Options: DENY`, `nosniff`, a same-origin
  referrer policy, and `no-store` on every API response.

### Known deviations from the implementation plan

1. **Export templates.** The six original `.xlsx` workbooks were not available on the build machine,
   so the exporter *generates* each sheet from the `exportAs` headers in the module configs. Drop the
   originals into `templates/` (`faculty.xlsx`, `drie.xlsx`, `dofa.xlsx`, `dugs.xlsx`, `hod.xlsx`,
   `cdc.xlsx`) and that workbook silently switches to opening and filling the real template instead.
2. **HOD export.** Doc 07 gives heads of department a workbook export while doc 03's capability
   matrix denied it. Export is enabled for `hod` — every export query runs through `scopeFilter()`,
   so a head can only ever export their own department.
3. **Department-scoped duplicate guards.** A natural key on a department module is scoped to that
   department, so two departments can both report EDP/MDP revenue for the same financial year.
4. **Period resolution.** A record whose date field falls outside the cycle is stamped with the
   cycle's own period rather than a year the workbook has no column for.
5. **Public pages render per request** so the CSP nonce reaches Next's hydration scripts. A
   prerendered page cannot carry one.

---

## Troubleshooting

**"Security check failed. Reload the page and try again." on sign-in.** `APP_URL` in `.env.local`
must be the *exact* origin you're typing into the browser — `http://localhost:3000` and
`http://127.0.0.1:3000` (or a LAN IP) are different origins even though they reach the same
machine, and the CSRF/origin guard rejects a mismatch by design. Fix `APP_URL`, restart the server,
and use the matching address.

**A page loads with no styling (raw black-and-white HTML) after switching between `npm run dev`
and `npm run build`/`npm run start`.** Dev mode and the production build use incompatible layouts
inside `.next/`, and running both against the same folder at the same time corrupts it — the page
ends up referencing a CSS file that no longer exists on disk. Stop every running instance, delete
`.next`, and start exactly one of the two modes again. Don't run both at once.

**Only ever run one server on port 3000 at a time.** Both issues above get much harder to diagnose
once two servers (or two modes) are fighting over the same port or build folder.

For a production deployment rather than local running, see `DEPLOYMENT.md`.

---

## Operations

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm run start` | Production build and serve |
| `npm run verify` | typecheck + lint + tests — the gate |
| `npm run db:generate` | Generate a migration after changing `schema.ts` |
| `npm run db:reset` | Drop and recreate the schema (development only) |

Evidence files are written to `EVIDENCE_DIR` (default `./storage/evidence`), which is gitignored
and must be backed up alongside the database.

---

© Internal Quality Assurance Cell, Birla Institute of Technology, Mesra. Internal use only.
