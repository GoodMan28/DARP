# Deploying DARP

This file did not exist in the repository before — the only deployment runbook was
`Project Info/implementation/10-deployment-ops.md` in the planning workspace, which is **not**
part of this git repository and does not travel with it when the repo is cloned or handed over.
Anyone deploying from GitHub alone had no instructions. This is the condensed, repo-local version;
the planning document has more detail (nginx config, systemd hardening flags, DPDP-Act
operational duties) if you need it.

---

## Before you deploy, decide which of these you're doing

| | Local demo (what this repo has been run as so far) | Real institutional deployment |
|---|---|---|
| Database | `docker compose up -d` (password `devpassword`, port open) | Native PostgreSQL 16, loopback-only, real passwords |
| Data | Demo/test accounts (`@demo.bitmesra.ac.in`) | Real IQAC-created accounts only |
| `APP_URL` | `http://localhost:3000` or a LAN IP | `https://<real-domain>` |
| TLS | None | Required — production sets `Secure` cookies, which browsers refuse over plain HTTP except on `localhost` |
| Process | `npm run dev` / `npm run start` run by hand | `systemd`, restarts on boot and on crash |

**This checklist assumes the second column.** If you only want a demo, the main `README.md`'s
"Running it locally" section is all you need — stop here.

---

## Go-live checklist

- [ ] `.env.production` created on the server, filled from `.env.example`, **not** the file used for local dev
- [ ] `PII_ENCRYPTION_KEY` and `SESSION_SECRET` are **freshly generated for production** — never reuse the ones from `.env.local`
- [ ] `APP_URL` is the real `https://` domain — the CSRF/origin check refuses every login otherwise (this has already caused two outages in local testing; see `README.md`'s troubleshooting note)
- [ ] `NODE_ENV=production`
- [ ] PostgreSQL is a real install, **not** the `docker-compose.yml` in this repo — that file is for local development only (open port, weak default password) and is not meant to face a real deployment
- [ ] `npm run db:migrate && npm run db:harden && npm run db:seed` run against the production database, with a real one-time admin password handed to IQAC out of band (not by email alongside the URL)
- [ ] TLS certificate installed and valid (not self-signed)
- [ ] A reverse proxy (nginx or equivalent) terminates TLS and forwards to `127.0.0.1:3000`
- [ ] `npm run build` succeeds on the server; the process is supervised (systemd/pm2) so it restarts on crash and on reboot
- [ ] **All demo data removed**: `npm run db:seed:demo -- --clear` — see the note below on what this does and does not remove
- [ ] A real backup of the database and `EVIDENCE_DIR` is running on a schedule, and **has been test-restored at least once**
- [ ] `PII_ENCRYPTION_KEY` is backed up **separately** from the database backup — losing it makes every stored Aadhaar/PAN permanently unreadable; whoever holds both the backup and the key holds the personal data, so they must not be stored together
- [ ] The six original `.xlsx` workbooks are dropped into `templates/` if you want the export to fill the real institute templates rather than generate plain sheets (see `README.md` → "Known deviations" #1) — this folder does not exist yet
- [ ] A test account has walked the full journey (sign in → add a record → submit → verify → approve → export) on the real production URL, and its test records were deleted afterward

## Known gaps not yet built (needed for unattended long-term operation)

These are referenced by the original implementation plan but do not exist in this codebase yet.
None of them block a supervised go-live; they matter for running unattended for months:

- **Scheduled cleanup of orphaned evidence files** — nothing currently deletes files on disk left
  behind by a soft-deleted record. `EVIDENCE_DIR` will grow forever without one.
- **Scheduled pruning of expired sessions / old login attempts / expired password-reset tokens** —
  those tables currently only shrink when the app happens to touch a row; there's no standalone job.
- A process supervisor config (systemd unit / pm2 config) is not included in this repo — write one
  for whichever process manager the target server uses.

## What `db:seed:demo -- --clear` does and does not do

It removes the demo user accounts and their records. It **deliberately does not** remove their
entries from `audit_log` — the audit trail is append-only by database trigger (not even the
database owner can delete from it; see `README.md` → Security posture). Demo activity will remain
visible in the audit log permanently. If that's unacceptable for your deployment, don't run the
demo seed against a database that will become the real production database — seed demo data only
in a disposable database, or accept the audit rows as harmless (they carry no personal data beyond
the demo accounts' own names/emails, which are fake).

---

© Internal Quality Assurance Cell, Birla Institute of Technology, Mesra.
