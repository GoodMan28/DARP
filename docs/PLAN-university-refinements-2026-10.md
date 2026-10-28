# DARP: university refinements, implementation plan (October 2026)

This plan covers the 13 changes the university asked for, plus a cleaner light-theme UI. It is written so that a smaller model can follow it **one step at a time**. Every step names the files to change, says what to do, and says how to check it worked.

Do the phases **in order**. Later phases depend on earlier ones. Do not start a step until the previous step's checks pass.

---

## 0. Read this first

### 0.1 Ground rules (never break these)

1. **Git identity.**
   - Commit as `Abhineet Anand <abhineetanand91@gmail.com>`, which is the GitHub account GoodMan28. Check with `git config user.email` before committing.
   - **Never** add a `Co-Authored-By: Claude` line or any Claude/Anthropic credit to a commit or PR.
   - Ask the user before every `git push`.
2. **Databases.**
   - `darp` is the user's dev database. `darp_test` is the test database.
   - Integration tests wipe the database they run against (`truncateAll()`), so **run them only against `darp_test`**.
   - Never change rows in `darp` without asking the user. That includes data-fix scripts and backfills.
3. **No scraping of paid or protected sites.**
   - Do not automate Clarivate (JCR, Web of Science), Scopus web pages or IP India InPASS, whether by Playwright, by scraping or in any other way.
   - These sites are under licence or CAPTCHA, and automated downloading can get BIT's subscription suspended.
   - Use only the routes this plan names: official APIs with keys, files that IQAC uploads, and the public Patent Office Journal PDFs.
4. **One step = one commit.** The message describes what changed for users, e.g. `feat(records): approve every module on submission`.
5. Keep the code style of the file you are editing: same comment density, same naming, same helpers.

### 0.2 Commands

Run all commands from the repo root `C:\Users\Abhineet Anand\Desktop\BITWISE\darp` in Git Bash.

```bash
# Point the API at the TEST database for this shell (the .env.local file points at darp)
cd apps/api
export DATABASE_URL="$(grep '^DATABASE_URL=' .env.local | cut -d'"' -f2 | sed 's#/darp$#/darp_test#')"
export DATABASE_URL_OWNER="$(grep '^DATABASE_URL_OWNER=' .env.local | cut -d'"' -f2 | sed 's#/darp$#/darp_test#')"
echo "$DATABASE_URL" | grep -q '/darp_test$' && echo "OK: test DB" || echo "STOP: not the test DB"

# Make a migration after editing apps/api/src/server/db/schema.ts
npm run db:generate                   # writes apps/api/drizzle/000N_*.sql — read it before applying
npx tsx src/server/db/migrate.ts      # applies it to darp_test (env vars above win over .env.local)

# Server tests (must say OK: test DB first)
npx vitest run                        # all
npx vitest run tests/unit/periods.test.ts   # one file
cd ../..

# Whole repo checks before every commit
npm run typecheck && npm run lint
npm run build
```

Docker must be running, because the database lives in the container `darp-db`.

The user applies new migrations to `darp` themselves, with `npm run db:migrate -w @darp/api`. Tell them when a step adds one.

### 0.3 Decisions already made with the user (do not re-open)

| # | Topic | Decision |
|---|---|---|
| D1 | Web of Science Impact Factor and quartile | IQAC uploads files. Indexing comes from Clarivate's free Master Journal List (one CSV per collection). IF and JIF quartile come from a JCR export made by the library with BIT's subscription. **No scraping.** Not found means **NA**. |
| D2 | Which year's metrics | The **latest** edition loaded, worked out when needed (form, record page, lists, exports, counters). The edition is always shown, e.g. "JIF 2024". |
| D3 | Storing rankings | Quartile, IF and indexing are **not stored** on the publication. They are computed from the journal's ISSN when needed. |
| D4 | Indexing shown | **All** indexes the journal is in, e.g. "Scopus, SCIE", in IQAC's master-list order. |
| D5 | Approval | **Approved on submit, in every module.** HOD, verifying offices and IQAC can still return a record with a remark. A corrected record is approved again on resubmission and shows up in a "Corrected after return" list for the person who returned it. |
| D6 | Editing | The owner can edit a record at any time, including after approval. Fetched (locked) fields stay locked, apart from the existing "Change it" path. Every edit is kept in a history: who, when, old → new. |
| D7 | Researcher metrics | Scopus numbers come from the **Elsevier API** with BIT's institutional key. WoS (ResearcherID) numbers are **typed by the faculty member** with a screenshot. |
| D8 | Award validity | All award-type modules: Awards & Recognition, R&I Awards, Extension Awards, Fellowships. Each gets an award **date** and a validity of **1 year / 2 years / 3 years / Lifetime**. |
| D9 | Bulk upload | Each line becomes a **draft** with its details fetched. A review table lets the faculty member attach evidence to each one, then submit them together. |
| D10 | Year types | Every record carries CY, FY and AY years when its date allows. Reports pick the year type per sheet. |
| D11 | Cycle | Nothing is limited to an "active cycle" any more. IQAC picks a year range when pulling reports. Faculty pick a range on their profile. |
| D12 | Theme | Light theme only, bigger text, fewer notices and badges. |

### 0.4 Phase map

| Phase | Covers | Depends on |
|---|---|---|
| 1 | Item 11 (2 MB), item 12 (no approval), item 13 (edit), UI foundations | none |
| 2 | Item 7 (CY/AY/FY), item 6 part A (remove active-cycle scoping, profile filter) | 1 |
| 3 | Items 1, 2, 3 (journal rankings from SJR + WoS, computed when needed) | 2 |
| 4 | Items 4, 5 (patent lifecycle, grant number) | 1, 2 |
| 5 | Item 9 (award date + validity) | 2 |
| 6 | Item 8 (bulk upload) | 1, 3, 4 |
| 7 | Item 6 part B (IQAC reports by year range in NAAC/NIRF/NBA formats) | 2, 3, 4, 5 |
| 8 | Item 10 (Scopus ID / ResearcherID, h-index, citations, quality signal) | 3 |
| 9 | UI declutter, page by page | all |

---

## Phase 1: Quick wins and foundations

### Step 1.1: Evidence files at most 2 MB (item 11)

**Files**
- `apps/api/src/server/evidence/service.ts`: `maxUploadBytes()`. The default is 5 MB and the value is clamped to `DB_MAX_BYTES`.
- `apps/api/.env.example`: `MAX_UPLOAD_MB`.
- `packages/shared/src/modules/_types.ts`: the comment on `maxSizeMB` ("default 5").
- `packages/shared/src/modules/*.ts`: 24 fields set `maxSizeMB`. Find them with `grep -rn maxSizeMB packages/shared/src/modules`.
- `apps/web/src/components/form/RecordForm.tsx`: the `f.maxSizeMB ?? 5` fallback.
- `apps/web/src/app/instructions/page.tsx`: the "5 MB" text, twice.

**Do**
1. Change the default in `maxUploadBytes()` from 5 to 2 MB. Leave the clamp to `DB_MAX_BYTES` in place.
2. Set `MAX_UPLOAD_MB="2"` in `.env.example`. **Tell the user** to change it in their own `apps/api/.env.local` too, where it is currently `"5"`. Do not edit that file yourself.
3. Set every `maxSizeMB: 5` (or any value above 2) to `maxSizeMB: 2`.
4. Change the fallback in RecordForm to `?? 2`, update the `_types.ts` comment, and change the instructions page text to "2 MB".
5. Leave the database CHECK `evidence_size_rule` (5 MB) alone. It is only an upper bound, and old files may be bigger than 2 MB.

**Test**
- In `apps/api/tests/integration/evidence.test.ts`, add a test: uploading 2 MB + 1 byte is refused with the same error code as the existing "too large" test, and exactly 2 MB is accepted.

**Done when** the tests pass and the form says "up to 2 MB".

---

### Step 1.2: Approved on submit in every module (item 12)

**Today**
- In `apps/api/src/server/auth/permissions.ts`, `returnsAfterApproval(m)` is true only for modules whose `lookup.autoApprove === 'always'`: publications, books and patents.
- Every other module goes submit → verify (office) → approve (IQAC).
- `approvesNow` in `apps/api/src/server/records/service.ts` decides auto-approval, and never auto-approves a resubmitted record.

**Do**
1. In `permissions.ts`:
   - Make `returnsAfterApproval()` return `true` for every module. Keep the function so callers don't change, and add a one-line comment saying why.
   - The `submit` transition now goes `draft | returned → approved` for everyone.
   - Remove the `verify`, `approve` and `unlock` transitions from the allowed list.
   - Keep `return`, allowed from `approved`, for the module's `verifierRoles`, for `hod` (own department only, using the same scope check as reading) and for `admin`. A remark is still required.
2. In `service.ts`:
   - Make `approvesNow` return `true` for every submit, **including** resubmissions after a return.
   - When the record had been returned before (it has a `returned` transition), set `verification.correctedAfterReturn = { returnedBy: <userId of the last return>, at: <now ISO> }`.
   - Keep writing the system-actor transition ("Approved on submission") exactly as auto-approval does now.
3. Remove `'whenChecksPass'` from `LookupConfig.autoApprove` in `_types.ts`, and the code that reads it. No module uses it now. Also remove `autoApprove` from the three lookup configs if nothing reads it after step 1 (grep `autoApprove`).
4. Counters and exports:
   - In `apps/api/src/server/rollups/counters.ts`, set `COUNTED_STATUSES = ['approved']`.
   - In `apps/api/src/server/export/mapping.ts`, set `EXPORTABLE_STATUSES = ['approved']`.
   - Keep the DB enum values `submitted` and `verified`. Removing Postgres enum values is risky and not needed.
5. New script `apps/api/scripts/approve-pending.ts`:
   - Every record with status `submitted` or `verified` becomes `approved`, with a transition whose actor is the system and whose note is "Approved: approval step removed (Oct 2026)".
   - Print the count per module.
   - Run it on `darp_test`. **Ask the user** before running it on `darp`.
6. Web:
   - `apps/web/src/components/records/ActionRail.tsx`: remove the Verify, Approve and Unlock buttons and their notes. Keep "Return to owner".
   - `apps/web/src/app/(app)/dashboard/page.tsx`: replace the verification queue with two lists for verifier roles, HOD and admin:
     - (a) **Corrected after return**: records where `verification.correctedAfterReturn.returnedBy` is the current user, with buttons "Looks fine" (clears the flag; new API action `ackCorrection`) and "Return again".
     - (b) **Added in the last 14 days** in their area, as a link list only.
   - Remove the "Record lifecycle" legend strip from the dashboard.
   - `apps/web/src/app/(app)/m/[moduleKey]/page.tsx`: the status chips become Draft / Approved / Returned only.
   - Change `verificationQueue` in `apps/api/src/server/rollups/completion.ts` to feed the two new lists.
7. Tests:
   - `tests/integration/records.test.ts`: the `WORKFLOW = 'consultancy'` block checks the old classic flow. Rewrite it so that submit → approved, return from approved works for the verifier, HOD (own department only) and admin, resubmit → approved with `correctedAfterReturn` set, and `ackCorrection` clears it.
   - Update `permissions.test.ts`.

**Done when** submitting in any module shows "Approved", the dashboard has no verification queue, and all tests pass.

---

### Step 1.3: Edit after approval, with a history (item 13)

**Today**
- In `permissions.ts`, `canEditRecord` allows the owner to edit only while the record is `draft` or `returned`. Admin can always edit.
- `updateRecord` in `service.ts` refuses with "ask the verifying office to return it".

**Do**
1. Schema (`apps/api/src/server/db/schema.ts`): add a table `record_edits`. Then generate the migration and apply it to `darp_test`.
   ```ts
   export const recordEdits = pgTable('record_edits', {
     id: uuid('id').primaryKey().defaultRandom(),
     recordId: uuid('record_id').notNull().references(() => records.id),
     userId: uuid('user_id').references(() => users.id),       // null = system (e.g. patent refresh)
     at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
     note: text('note'),                                          // e.g. "Patent Office Journal issue 41/2026"
     changes: jsonb('changes').$type<{ key: string; label: string; from: string; to: string }[]>().notNull(),
   }, (t) => [index('record_edits_record_idx').on(t.recordId, t.at)]);
   ```
   Copy the column helper names from the existing tables in that file.
2. `permissions.ts`:
   - `canEditRecord`: the owner may edit when the status is `draft`, `returned` or `approved`.
   - `canDeleteRecord`: leave it as it is (owner deletes only `draft` and `returned`; admin deletes anything).
3. `service.ts` `updateRecord`:
   - Delete the "ask the verifying office" refusal.
   - When the record is `approved` before the save, it stays `approved` whatever the mode. An approved record never goes back to draft.
   - Lookup modules: the identifier fields (`m.lookup.idFields`) cannot change once the record is not a draft. Refuse with: "The DOI / number can't be changed after submission. Add the right one as a new record and ask IQAC to remove this one."
   - After a successful save of a record that was **not** a draft, build the diff:
     - for each field whose value changed, record `{ key, label, from, to }`
     - for `file` fields, use `to: 'file replaced'`
     - for encrypted fields (PAN, Aadhaar), use `from: 'hidden', to: 'changed'`
   - If the diff is not empty, insert a `record_edits` row.
   - `applyLookup` already runs on every save, so locked fields keep their fetched values and overrides keep their provenance. Do not change that.
4. New API: `GET /api/modules/:moduleKey/records/:id/edits` returns the history, newest first. Use the same read permission as the record. Add it next to the record GET route in `apps/api/src/routes/modules/`.
5. Web, on the record page `apps/web/src/app/(app)/m/[moduleKey]/[id]/page.tsx`:
   - The owner sees the form in edit mode for approved records.
   - The sticky bar shows one button, **Save changes**, for approved records. Drafts keep "Save as draft" and "Submit".
   - Add a collapsed `<details>` section "Edit history (n)" listing date, who, and "Field: old → new".
6. Tests (integration):
   - The owner edits an approved record: it is still approved and one `record_edits` row is written.
   - Changing the DOI of a submitted publication is refused.
   - Another faculty member cannot edit it.
   - A file change is logged as "file replaced".

---

### Step 1.4: Light theme and readable sizes (UI foundations)

Making this change now means every new screen in later phases is built in the new look.

**Files**: `apps/web/src/app/globals.css` and `apps/web/src/components/ui/index.tsx`.

**Do**
1. **Light only.**
   - In `globals.css`, delete the whole `@media (prefers-color-scheme: dark) { ... }` block and the `[data-theme="dark"] { ... }` block.
   - Add `color-scheme: light;` to `:root`.
   - Check that `body` keeps an explicit light background.
2. **Bigger type.** In the `@theme` block, change the size tokens:
   - `--text-2xs` 11px → 13px
   - `--text-xs` 12px → 14px
   - `--text-sm` 13px → 15px
   - `--text-base` 14px → 16px
   - keep `--text-md` at 16px or more, and scale the larger sizes up by about 2px each
   This one change enlarges every screen.
3. **Darker grey text.** Set the `ink-faint` colour to the same value as `ink-muted` (#5e6c84), which reaches 5.3:1 on white. The old #8993a4 is only 3.1:1 and fails WCAG AA.
4. **Bigger click targets.** In `components/ui/index.tsx`, change Button and LinkButton from `min-h-9` to `min-h-11` (44px), and give inputs the same height.
5. Remove `uppercase` and `tracking-wider` from `Th`, `Eyebrow` and the field labels in `components/ui/index.tsx`. Use sentence case.
6. Build the web app, open http://localhost:3000, and look at the dashboard, a module list, a form and the admin page at a width of 1280 and at 390. Fix any text that now overflows. The usual fix is `break-words` or a smaller grid.

**Done when** no page has dark colours with the OS in dark mode, the body text is 16px, and nothing overflows at 390px.

---

## Phase 2: Year types (CY/AY/FY) and no fixed cycle

Background:
- Each module declares `periodType` ('CY' | 'FY' | 'AY') in `packages/shared/src/modules/*.ts`.
- `apps/api/src/server/records/periods.ts` turns the module's first `year` or `date` field into one `periodYear` and `periodLabel`.
- Definitions: CY = calendar year; FY = April–March; AY = July–June. A period is named by its starting year.
- `scopeFilter` (`apps/api/src/server/records/scope.ts`) adds `records.cycleId = active cycle` to every query, so records from other cycles are hidden everywhere.

### Step 2.1: Say explicitly which field dates a record

1. In `_types.ts` `ModuleConfig`, add `periodField?: string`: the key of the `date` or `year` field that dates the record. In `periods.ts` `periodSourceField`, use `m.periodField` when it is set and fall back to today's rule.
2. Set `periodField` in **every** module config, so nothing relies on "first field" any more:
   - publications `'year'`
   - patents `'statusDate'` (this fixes the earlier bug where the filing date decided the year)
   - books: its year field
   - each other module: whatever its first date or year field is today (keep the current behaviour)
3. Fix the e-content counter label in `apps/api/src/server/rollups/counters.ts`. It uses `{AY}`, but e-content is a CY module, so change it to `{CY}`.
4. Unit test in `tests/unit/periods.test.ts`: a patent with filedDate 2021-05-01 and statusDate 2024-03-10 gets periodYear 2024.

### Step 2.2: Keep all three year types on each record (item 7)

1. Schema: add to `records` the columns `cyYear integer`, `fyYear integer` and `ayYear integer` (all nullable), plus indexes `(module_key, cy_year)`, `(module_key, fy_year)` and `(module_key, ay_year)`. Generate the migration.
2. In `periods.ts`, add `yearsOf(value: { date?: string; year?: number }, own: PeriodType): { cy: number|null; fy: number|null; ay: number|null }`:
   - A full date: all three. `cy = year`, `fy = month >= 4 ? year : year - 1`, `ay = month >= 7 ? year : year - 1`. Reuse the existing `yearOfPeriod` for each.
   - A year only (a `year` field): fill **only** the column for the module's own `periodType`. A year alone cannot place the record in an FY or AY that differs from it.
   - `resolvePeriod` sets the three new columns as well as `periodYear` and `periodLabel`. Do not change what `periodYear` means, because other code uses it.
3. Script `apps/api/scripts/backfill-years.ts` recomputes all three columns for every record with the same code as the save path. Run it on `darp_test`, then **ask the user** before running it on `darp`.
4. Unit tests for `yearsOf`:
   - 2024-03-31 → cy 2024, fy 2023, ay 2023
   - 2024-04-01 → fy 2024
   - 2024-07-01 → ay 2024
   - a year only, 2024, in an FY module → `{cy:null, fy:2024, ay:null}`

### Step 2.3: Stop scoping by the active cycle (item 6, part A)

1. `scope.ts`: remove the `records.cycleId = activeCycle` condition from `scopeFilter`. Records of every year are now visible according to role.
2. Schema changes, all in one migration:
   - Make `records.cycle_id` nullable and stop setting it on new records.
   - Replace the natural-key unique index `(module_key, cycle_id, natural_key)` with `(module_key, natural_key) WHERE deleted_at IS NULL`.
   - Profile: replace one per user per cycle with one per user (`module_key = 'profile'`).
   - Feedback: replace one per department per cycle with one per department per `ay_year`.
   - `module_declarations` (nil returns): replace `cycleId` with `periodYear integer not null`. The unique key becomes `(user_id, module_key, period_year)`.
   - **Before** generating the migration, write and run a check script that lists any duplicates the new unique indexes would reject, on `darp_test` and (read-only) on `darp`. If any exist, stop and show them to the user.
3. Go through every `activeCycle()` / `getActiveCycle()` call (`grep -rn "activeCycle\|getActiveCycle" apps/api/src`; there are about 18). For each, decide which case it is:
   - (a) Only stamps `cycle_id` on create: delete it.
   - (b) Only used for scoping: delete it.
   - (c) Used for year windows (counters, period options, completion): replace it with a `range: { from: number; to: number }` parameter. Default: `defaultRange()`, which returns the **saved range marked default** if there is one, else the last 3 calendar years ending with the current year.

   Write the list of call sites and what you did with each into the commit message.
4. Cycles become "saved year ranges":
   - Keep the `cycles` table (name, the CY/FY/AY start and end, `isActive`, now meaning "default range").
   - Add POST and DELETE to `apps/api/src/routes/admin/cycles.ts`.
   - In `CyclePanel.tsx`, rename the tab "Year ranges" and allow add, edit, delete and "make default".
   - Remove the entry-opens and deadline inputs. They are only displayed today and nothing enforces them.
5. Replace hard-coded year text with placeholders:
   - `packages/shared/src/modules/profile.ts` (the export headers 'AY 2024-25' and 'FY 2024-25')
   - the `exportAs` "(data for 2024, 2023, 2022)" in awards, extawards and riawards

   Use `{AY}`, `{FY}` or `{years}`, and fill them from the chosen range in `withCycleYears` (rename it `withRangeYears`).
6. Nil declarations (`components/records/NilDeclaration.tsx`): add a year dropdown so the declaration is "Nothing to report for [year]".

### Step 2.4: Year-range filter on the faculty profile (item 6, user side)

1. `apps/api/src/routes/profile-rollups.ts`: GET accepts `from` and `to` (years, validated as 1990–2100 with `from <= to`) and passes them down.
2. `computeCounters` (`counters.ts`): each counter filters on the column for its module's `periodType`: `cy_year`, `fy_year` or `ay_year` between `from` and `to`. `sinceJoining` counters ignore the range.
3. Labels show the real period:
   - CY: "2022–2024"
   - FY: "FY 2022-23 to 2024-25"
   - AY: "AY 2022-23 to 2024-25"
4. `apps/web/src/app/(app)/profile/page.tsx`:
   - Add two dropdowns at the top, **From** and **To**. The years run from the oldest record year to the current year.
   - The default is `defaultRange()`. Put the range in the URL (`?from=&to=`) so it can be shared.
   - Below the dropdowns, show one line: "Counting records dated between …".
5. The module list year filter already exists (`recordPeriods`). Keep it.
6. Tests: counters for a 2021 record and a 2024 record with ranges 2021–2021, 2022–2024 and 2021–2024.

**Phase 2 done when** the old cycle no longer hides anything, the profile range changes the counts, and all tests pass.

---

## Phase 3: Journal rankings from SJR and Web of Science (items 1, 2, 3)

What exists today:
- `apps/api/src/server/lookup/journals.ts` `journalFacts(issns, year)` fills `quartile`, `quartileSource` and **one** `indexing` value, which are **stored** in `records.data`.
- Tables:
  - `journal_metrics` (SJR quartile per ISSN per year)
  - `journal_index_listings` (which list, e.g. SCIE or Scopus, an ISSN is in)
  - `journal_coverage` (Scopus coverage years)
- A WoS upload reads only ISSN and title. There is **no impact factor anywhere**.

Target (D1–D4): rankings are **computed when needed** from the publication's ISSN, using the **latest** edition loaded, and they show **all** indexes. Nothing ranking-related is stored on the record.

### Step 3.1: Where the WoS data comes from (instructions for IQAC; write them into the admin card text)

- **Indexing: SCIE / SSCI / AHCI / ESCI.**
  - Clarivate's Master Journal List (mjl.clarivate.com) is free with a free account.
  - Its Downloads page gives one CSV per collection, with columns including "Journal title", "ISSN" and "eISSN".
  - IQAC uploads each one under its list name (SCIE, SSCI, AHCI or ESCI). This already works with the existing "list" upload.
- **Impact Factor and JIF quartile.**
  - The library signs in to Journal Citation Reports with BIT's subscription, chooses the latest year and all editions, and exports **CSV**.
  - If JCR limits the number of rows per export, export several times (for example by category). The upload accepts many files.
  - The export has a few title lines first. The header row includes "Journal name", "ISSN", "eISSN", "Category", "Edition", "<YEAR> JIF" and "JIF Quartile". Check the column names on a real file and adjust the parser.
- Note for the UI text:
  - JCR has given an IF to AHCI and ESCI journals only since the 2023 release, and quartiles across all editions only since the 2024 release.
  - So some older ESCI or AHCI journals have no quartile. These show "NA".

### Step 3.2: Store JCR data

1. Schema: new table `journal_jcr`. Generate the migration.
   ```ts
   export const journalJcr = pgTable('journal_jcr', {
     issn: text('issn').notNull(),                 // normalised like journal_metrics (NNNN-NNNN)
     jifYear: integer('jif_year').notNull(),       // the year in the "2024 JIF" header
     title: text('title').notNull(),
     jif: numeric('jif', { precision: 8, scale: 3 }),   // null when JCR says N/A
     jifQuartile: text('jif_quartile'),            // 'Q1'..'Q4' or null; best across categories
     categories: text('categories'),               // "CHEMISTRY, APPLIED; FOOD SCIENCE & TECHNOLOGY"
     editions: text('editions'),                   // "SCIE" or "SCIE, SSCI"
     importedAt: timestamp('imported_at', { withTimezone: true }).notNull().defaultNow(),
   }, (t) => [uniqueIndex('journal_jcr_issn_year').on(t.issn, t.jifYear)]);
   ```
2. In `packages/shared/src/journals.ts`, add `extractJcrRows(rows: string[][])`. It returns `{ jifYear: number; rows: JcrRow[] }` or throws a clear error.
   - The header row is the first row with a cell equal to "ISSN" (ignore case) **and** a cell ending in "JIF".
   - `jifYear` comes from the header matching `/(\d{4})\s+JIF/`.
   - Every data row gives one entry for its ISSN and another for its eISSN, skipping blanks and "N/A", normalised with the existing ISSN helper.
   - `jif`: a number, or null for "N/A".
   - `jifQuartile`: Q1–Q4, or null.
   - Rows without an ISSN (title or copyright lines) are skipped.
   - **Merge** duplicate ISSNs (a journal in several categories): keep the highest JIF and the best quartile (Q1 is best), and join the distinct categories and editions.
   - Unit test it with a small fixture `apps/api/tests/fixtures/jcr-sample.csv`: title lines, a journal in two categories, an N/A JIF and a copyright footer.
3. In `apps/api/src/routes/admin/journal-lists.ts`, add a new import kind `'jcr'`:
   - Accept batches of up to 5000 rows plus `jifYear`.
   - Upsert into `journal_jcr` (on conflict update).
   - Audit the action.
   - GET returns the loaded JCR years with their row counts.
   - Add a "remove JCR year" action.
4. Web: in `apps/web/src/components/admin/JournalListsPanel.tsx`, add a card "Web of Science Impact Factor (JCR)":
   - a multi-file CSV input, parsed in the browser with the existing `parseCsv` + `extractJcrRows`
   - a preview ("JIF 2024 · 21,345 journals")
   - an upload in batches, like the SJR card
   - the list of loaded years with Remove
   - the 3.1 instructions in short form

### Step 3.3: One function that works out rankings

Create `apps/api/src/server/journals/ranking.ts`:

```ts
export type Quartile = 'Q1' | 'Q2' | 'Q3' | 'Q4';
export interface JournalRanking {
  indexes: string[];            // e.g. ['Scopus','SCIE'] in indexingTypes master-list order; [] = none
  sjrQuartile: Quartile | null; sjrYear: number | null; sjrEstimated: boolean; // estimated = source 'scopus-list'
  jif: number | null; jifQuartile: Quartile | null; jifYear: number | null;
}
/** Rankings for many papers at once (lists, exports, counters): 3 queries total, not 3 per paper. */
export async function rankingsFor(items: { key: string; issns: string[]; year: number | null }[]): Promise<Map<string, JournalRanking>>;
export async function rankingFor(issns: string[], year: number | null): Promise<JournalRanking>;
```

Rules:
- **SJR quartile:** the newest `journal_metrics` row for any of the ISSNs (`DISTINCT ON (issn) ... ORDER BY issn, year DESC`, then the newest across the ISSNs). A `scimago` row beats a `scopus-list` row of the same year.
  - **Exception:** if Scopus coverage (`scopusCovered`, which already exists in `lookup/journals.ts`; move it here) says the journal was **not** in Scopus in the paper's year, the SJR quartile is null.
- **JIF and JIF quartile:** the newest `journal_jcr` row for any of the ISSNs.
- **Indexes:**
  - Scopus counts if `scopusCovered(issns, paperYear)` is true.
  - Each other list counts if the ISSN is in that list's **newest** uploaded year.
  - Sort by the order of the `indexingTypes` master list.
- If nothing is found, the value is null. The UI and exports print **"NA"**.
- `rankingsFor` gathers all ISSNs, runs one query per table, and maps the results back.

Unit and integration tests in `tests/integration/rankings.test.ts`:
- a journal in Scopus + SCIE with SJR 2023 Q2, SJR 2024 Q1 and JIF 2024 5.2 Q2 → `indexes ['SCIE','Scopus']` (in master-list order), sjr Q1/2024, jif 5.2 Q2/2024
- a journal dropped from Scopus before the paper year → no Scopus and no SJR quartile
- an unknown ISSN → everything null

### Step 3.4: Stop storing rankings on publications

1. `packages/shared/src/modules/publications.ts`:
   - Delete the fields `quartile`, `quartileSource` and `indexing`.
   - Make `issn` required, with the help text "Needed to show the journal's indexing, quartile and Impact Factor". The DOI fetch already fills it.
   - Remove `quartile` from `listColumns`.
2. In `_types.ts` `MetaKey`, remove `'quartile' | 'quartileSource' | 'indexing'`. Fix each compile error:
   - `apps/api/src/server/lookup/doi.ts`, around the `journalFacts` call: stop copying these values. Keep only the ISSN.
   - `apps/api/src/server/lookup/apply.ts`: remove the `quartileSource` wording and the journal flags (`no-journal-lists`, `no-sjr-data`, `not-indexed`, `scopus-dropped`, `scopus-not-that-year`, `no-issn`). They no longer create "points to check".
   - `journalFacts` in `lookup/journals.ts`: delete it once nothing uses it. Keep the list-import helpers.
3. Bump `CACHE_VERSION` in `apps/api/src/server/lookup/resolve.ts` from `'v4'` to `'v5'`.
4. Add a **derived columns** option to `ModuleConfig`:
   ```ts
   derived?: { key: 'indexes' | 'sjrQuartile' | 'jif' | 'jifQuartile'; label: string; exportAs?: Partial<Record<WorkbookKey, string>> }[];
   ```
   Give publications:
   - `indexes` "Indexing" (exportAs faculty and drie "Indexing", the old header)
   - `sjrQuartile` "Quartile (SJR)"
   - `jif` "Impact Factor (WoS)"
   - `jifQuartile` "JIF quartile (WoS)"

   In `apps/api/src/server/export/excel.ts`, fill derived columns by calling `rankingsFor` once per sheet. Write `indexes.join(', ')`, "Q1 (SJR 2024)", "5.200 (JIF 2024)" or "NA".
5. Script `apps/api/scripts/drop-stored-rankings.ts` removes the old keys: `UPDATE records SET data = data - 'quartile' - 'quartileSource' - 'indexing' WHERE module_key='publications'`. Run it on `darp_test`. **Ask the user** before running it on `darp`. It is optional, because the keys are ignored anyway.
6. Change the books lookup the same way if it reads any of these keys (`grep -n "quartile\|indexing" packages/shared/src/modules/books.ts apps/api/src/server/lookup`).

### Step 3.5: Show rankings where people look

1. New route `GET /api/journals/ranking?issn=XXXX-XXXX&issn=...&year=2024` (signed-in users, same rate limit as lookup). It returns a `JournalRanking`.
2. Form (`RecordForm.tsx`), publications only:
   - After a fetch, or when the ISSN field changes, show a read-only card **Journal ranking (latest)** with four rows:
     - Indexed in: Scopus, SCIE
     - Quartile (SJR): Q1 · SJR 2024
     - Impact Factor (WoS): 5.200 · JIF 2024
     - JIF quartile (WoS): Q2
   - "NA" when null. "estimated" in small text when `sjrEstimated`.
3. Record page: the same card.
4. List page: for publications, the records list API attaches `ranking` per row (one `rankingsFor` call per page). Add one column "Ranking" showing e.g. "Q1 · IF 5.2", or "NA".
5. Counters (`counters.ts`):
   - Add "Publications in Scopus", "Publications in Web of Science (SCIE/SSCI/AHCI/ESCI)", "Q1 (SJR)", "Q1 (JIF)", "Q1+Q2 (SJR or JIF)" for the selected range and since joining.
   - Compute them with `rankingsFor` over the counted records, not with a JSON field filter.
6. Admin: after any list upload (SJR, Scopus sync, WoS list, JCR), nothing needs recomputing, because rankings are computed when read. The "refresh" button text should say so.

**Phase 3 done when**
- uploading a JCR CSV makes the IF appear on existing publications without touching them
- a journal in two indexes shows both
- exports have Indexing, SJR quartile, IF and JIF quartile, with NA where unknown
- all tests pass

---

## Phase 4: Patent lifecycle and grant number (items 4, 5)

What exists:
- `packages/shared/src/modules/patents.ts`:
  - one field `applicationNo` takes either an application number or a grant number
  - `status` comes from the master list `patentStatus` = ['Published', 'Awarded/Granted']
  - `statusDate`
- `apps/api/src/server/lookup/patent.ts` `resolvePatent(raw)` checks `patent_grants` (by patentNo **or** applicationNo), then `patent_applications`.
- Nothing updates saved records when a later journal issue shows the grant.

Facts that shape the design:
- An Indian application is **secret until publication** (usually 18 months after filing). The "Applied" stage cannot be fetched, so the faculty member enters it by hand with the filing receipt.
- The nightly journal reading then moves the record forward: Applied → Published → Granted.

### Step 4.1: Fields

In `patents.ts`:
1. `applicationNo`: label "Patent application number". The help says "You can also type the patent (grant) number; DARP finds the application number."
   - On save, if the resolver found a grant, store the **application** number here.
   - It stays the `naturalKey` and the lookup id.
2. New `patentNumber`: "Patent (grant) number", type text, autofill `{ from: 'patentNo', locked: true, alwaysLocked: true }`. It is never typed.
   - Exports and the record page show **"NA"** while it is empty (item 5).
   - exportAs: faculty and drie "Patent Number".
3. `status`: the master list `patentStatus` becomes `['Applied', 'Published', 'Granted']`.
   - Update `apps/api/scripts/seed.ts`.
   - Write a script `apps/api/scripts/patent-status-rename.ts` that changes the master list rows and records with `'Awarded/Granted'` → `'Granted'`. Run it on `darp_test`; **ask before running it on `darp`**.
4. Dates: keep `filedDate`, with the label "Date filed (Applied)". Add:
   - `publishedDate`: "Date published (Patent Office Journal)", date, autofill `{ from: 'publishedDate', locked: true }`
   - `grantDate`: "Date granted (as published in the Journal)", date, autofill `{ from: 'grantDate', locked: true }`
5. `statusDate` stays, because the exports need "Date of Publish/Grant". It is now **computed on the server**: `grantDate ?? publishedDate ?? filedDate`. Show it read-only, or hide it from the form. `periodField: 'statusDate'` (from step 2.1) then dates the record by its latest stage.
6. Status rules when saving:
   - The status is fetched (locked) when the number is found.
   - When it isn't found, the faculty member may choose **Applied** (needs `filedDate` and the filing receipt as evidence), or Published or Granted (needs the matching date and evidence; this becomes a "point to check", as typed values do today).
7. In `_types.ts` `MetaKey`, add `'patentNo' | 'publishedDate' | 'grantDate'`. In `patent.ts`, return them:
   - `patentNo` from the grant row
   - `publishedDate` = `app.publishedDate` (or `grant.publishedDate`)
   - `grantDate` = `grant.grantPublishedDate`
   - the canonical `applicationNo`

### Step 4.2: Move records forward automatically (item 4)

Create `apps/api/src/server/lookup/patentRefresh.ts`:

```ts
/** Moves saved patents forward (Applied → Published → Granted) when the Journal index has caught up. */
export async function refreshPatentRecords(): Promise<{ checked: number; moved: number }>;
```

1. Select live patent records (`module_key='patents'`, `deleted_at IS NULL`, `data->>'status' <> 'Granted'`).
2. For each, run `resolvePatent(data.applicationNo)`. If nothing is found, skip it.
3. Stage order: Applied = 0, Published = 1, Granted = 2. If the fetched stage is **higher** than the saved one:
   - set `status`, `publishedDate`, `grantDate`, `patentNumber`, and `title` if it was empty
   - recompute `statusDate` and the years (call `resolvePeriod`)
   - mark these fields `fetched` in `verification.fields`
   - insert a `record_edits` row with `userId: null` and the note "Patent Office Journal issue <issue>"
   - **Do not** change the record's status: approved stays approved.
4. Never move a record backwards, and never overwrite a field the owner changed on purpose (provenance `changed`).
5. Call it at the end of each nightly `updatePatentIndex` run (`patentIndex.ts`, inside `schedulePatentJournal`), and after the admin "Read new issues now" action. Log the counts.
6. Dashboard: a card for the owner, "Updated automatically (last 30 days)", listing records with a system `record_edits` row. One line each: "Patent 202331085872 is now Granted (patent no. 512345)".
7. Integration tests in `tests/integration/patents-lookup.test.ts`:
   - an Applied record + an applications row → refresh → Published with publishedDate
   - + a grants row → Granted with patentNumber and grantDate
   - a second refresh changes nothing (idempotent)
   - a record whose status the owner changed by hand is not overwritten
   - an approved record stays approved

---

## Phase 5: Award date and validity (item 9)

Modules: `awards.ts`, `riawards.ts`, `extawards.ts`, `fellowships.ts`. All four use `awardYear` (year only) today, and `awardYear` is part of their `naturalKey` and exports.

### Step 5.1: A small "computed field" feature

1. In `_types.ts` `FieldConfig`, add `computed?: { from: string; as: 'year' }`. A computed field is never typed. The server sets it on every save from the source field (`as: 'year'` = the year of a date).
2. In `service.ts`, call a new `applyComputed(m, data)` in both `createRecord` and `updateRecord`, **before** validation and before `resolvePeriod`.
3. `RecordForm.tsx` shows computed fields as read-only text. They are not inputs.
4. Unit test `applyComputed`.

### Step 5.2: Date + validity on the four modules

For each of the four modules:
1. Add `awardDate`: "Date of award", type `date`, required.
2. Change `awardYear` to `computed: { from: 'awardDate', as: 'year' }`. Keep its `exportAs` and its place in `naturalKey`.
3. Add `validity`: "Validity", select, required, `listKey: 'awardValidity'`. Seed `['1 year', '2 years', '3 years', 'Lifetime']` in `seed.ts`, plus a script to insert the list into `darp_test` (and `darp` after asking).
4. `periodField: 'awardDate'`. Fellowships are FY, and with a full date they now get the right FY.
5. In `packages/shared/src/format.ts`, add `validUntil(awardDate: string, validity: string): string | null`:
   - add N years and subtract one day
   - Lifetime → null, meaning it never expires
   - also add `isActive(...)`
6. Show it:
   - list column "Valid until": a date, "Lifetime", or "Expired" in muted text
   - on the record page
   - export columns "Validity" and "Valid until"
7. Counters: "Active awards (as of today)" per module.
8. Old records have an `awardYear` but no `awardDate`.
   - They still show and count by `awardYear`. `resolvePeriod` falls back to it, so it must keep supporting `year` values.
   - The list shows "Date not given".
   - When the owner next edits one, the date and validity become required.
   - Do **not** invent a date for old records.

Tests:
- validUntil: 2024-03-15 + '2 years' → 2026-03-14
- Lifetime → null
- a fellowship dated 2024-02-10 → fy 2023
- an old record without a date still counts under its year

---

## Phase 6: Bulk upload of DOIs or patent numbers (item 8)

For the modules with a lookup: Publications, Books/Chapters/Conference papers and Patents.

### Step 6.1: Storage

Schema:
```ts
export const bulkImports = pgTable('bulk_imports', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerUserId: uuid('owner_user_id').notNull().references(() => users.id),
  moduleKey: text('module_key').notNull(),
  fileName: text('file_name').notNull(),
  status: text('status').notNull(),            // 'running' | 'done' | 'failed'
  total: integer('total').notNull(), done: integer('done').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const bulkImportItems = pgTable('bulk_import_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  importId: uuid('import_id').notNull().references(() => bulkImports.id),
  raw: text('raw').notNull(),                  // what the line said
  status: text('status').notNull(),            // 'pending' | 'created' | 'exists' | 'not-found' | 'wrong-module' | 'not-yours' | 'error'
  recordId: uuid('record_id').references(() => records.id),
  message: text('message'),
}, (t) => [index('bulk_items_import_idx').on(t.importId)]);
```

### Step 6.2: Server

1. Route `POST /api/modules/:moduleKey/bulk` (owner only, module must have a lookup):
   - multipart, one file of at most 1 MB, `.txt`, `.csv` or `.xlsx`
   - reuse the multer setup in `apps/api/src/server/http/upload.ts` with its own limits
2. Getting the identifiers out:
   - `.xlsx`: read every cell of the first sheet with `exceljs`, which the API already uses.
   - `.txt` and `.csv`: every line and every comma or semicolon separated cell.
   - Keep what matches the module's identifier: a DOI (`10\.\d{4,9}/\S+`, also inside `https://doi.org/...`), a patent number (use the existing `patentNumber` normaliser), or an ISBN for books.
   - Remove duplicates. **At most 100** identifiers per file; refuse with a clear message if there are more.
3. Create the `bulk_imports` row and the items, then process them **in the background** (a simple in-process async loop, like `updatePatentIndex`), one at a time with a 1 second pause for Crossref.
   - Number already in DARP for this owner (natural key) → `exists`, with a link.
   - Not found → `not-found`. The faculty member can still add it by hand later.
   - Wrong module (e.g. a conference paper in Publications) → `wrong-module`, with the target module named (the `lookup.elsewhere` logic).
   - Owner's name not in the author/inventor list → `not-yours`. **Do not create a record.**
   - Otherwise create a **draft** through the normal `createRecord` (lookup applied, fields locked) → `created`.
4. `GET /api/modules/:moduleKey/bulk/:id` returns the import, its items and each created record's title and missing-evidence state.
5. `POST /api/modules/:moduleKey/bulk/:id/submit` with `{ recordIds: [...] }` submits each through the normal submit path. It returns a result for each one (approved, or the refusal message, e.g. "Evidence file missing").

### Step 6.3: Web

1. On the module list page, for lookup modules, add a button **Add many at once** that goes to `/m/[moduleKey]/bulk`.
2. The bulk page:
   - **Step 1:** a file picker with the text "One DOI per line, or a CSV/Excel file with DOIs in any column. Up to 100." A sample `.txt` can be downloaded.
   - **Step 2:** a progress bar (poll every 2 s), then a review table with the columns Identifier, Title (or the reason it was skipped), Evidence (the existing `FileInput`, which saves straight to that draft), and a tick box.
   - **Step 3:** **Submit selected**. Show the result next to each row.
   - Drafts that are not submitted stay in the normal list as drafts.

Tests (integration):
- a file with 3 DOIs (1 valid of the owner's, 1 duplicate line, 1 belonging to someone else) gives created 1, not-yours 1, and the duplicate removed
- a file with 101 identifiers is refused
- submit without evidence is refused for that row only

Mock the lookup the way `lookup.test.ts` does. No live Crossref in tests.

---

## Phase 7: IQAC reports by year range and format (item 6, part B)

The format files in `C:\Users\Abhineet Anand\Downloads\BITWISE` show which year type each NAAC sheet uses. Examples:
- Publications, Books, Awards, E-content and FDPs: calendar years
- Consultancy, Funds & Grants and Financial support: financial years
- Students guided and Mentorship: academic years

The module `exportAs` headers already mirror these workbooks.

### Step 7.1: Report definitions

1. Create `packages/shared/src/reports/` containing:
   - `types.ts`:
     ```ts
     export interface ReportFormat { key: 'naac' | 'nirf' | 'nba' | 'full'; name: string; sheets: SheetSpec[] }
     export interface SheetSpec {
       name: string; moduleKey: string;
       yearType: 'CY' | 'FY' | 'AY';           // default year type for this sheet
       titleRows?: string[];                     // may contain {years}, {CY}, {FY}, {AY}
       columns: { header: string; value: string }[]; // value = field key | 'derived:jif' etc | 'owner.name' | 'owner.department' | 'serial' | 'period'
       rowFilter?: { field: string; in: string[] };
     }
     ```
   - `naac.ts`: build it from the existing module `exportAs` maps, so that nothing is defined twice. The year type comes from the module's `periodType`.
   - `full.ts`: every field of every module, for IQAC's own analysis.
   - `nirf.ts` and `nba.ts`: **blocked until IQAC sends the NIRF Data Capture and NBA SAR formats.** Leave a stub that throws "format not provided yet". Year types to expect:
     - NIRF: publications by CY; sponsored research and consultancy by FY
     - NBA: academic years (CAY, CAYm1, CAYm2)

### Step 7.2: Server

1. `GET /api/reports/:format?from=2022&to=2024&yearType=auto|CY|FY|AY&departments=<ids>&modules=<keys>`
   - `auto` = each sheet's own `yearType`.
   - Admin sees everything. HOD sees their own department only. The other offices see their workbooks, as in the current allow-list in `routes/export.ts`.
   - Keep the PII rules (admin only, with a reason).
2. `fetchExportRows` (`export/excel.ts`) takes `{ yearColumn: 'cy_year'|'fy_year'|'ay_year', from, to, departmentIds? }` instead of the cycle.
   - It counts only approved records.
   - Records missing that year type (a year-only record) are included only when the sheet's year type equals the module's own `periodType`.
3. Fill the derived columns (rankings, validity) as in step 3.4. Fill title placeholders from the range.
4. `GET /api/reports/:format/summary?...` returns the row count per sheet, for the preview.
5. Keep the old `/api/export/:workbook` working, calling the new code with the default range, until the UI has switched. Then remove it.

### Step 7.3: Web

Replace `apps/web/src/components/admin/ExportsPanel.tsx` with a **Reports** tab:
1. **Format** (NAAC / Full data; NIRF and NBA greyed out with "format file needed").
2. **From year** and **To year**.
3. **Year type**: "As each sheet needs (recommended)", CY, FY or AY.
4. **Departments**: all, or pick.
5. A preview table of sheet → number of rows.
6. **Download Excel**.

Give HOD users the same page, limited to their department.

Tests: a 2021 FY record and a 2024 CY record with different ranges; HOD scoping; derived columns filled.

---

## Phase 8: Researcher metrics: Scopus ID + ResearcherID (item 10)

### Step 8.0: Things the university must arrange first (ask the user; do not start 8.3 without them)

1. **Elsevier API key.** BIT registers at dev.elsevier.com with the institution's account and gets an API key. If the server is not on the campus network, Elsevier also issues an **institutional token**.
2. **Self-citation exclusion.** This needs Elsevier's **Citation Overview** API, which Elsevier enables per institution. The library asks Elsevier to enable it.
   - Without it, DARP shows Scopus's h-index and citations *including* self-citations, labelled as such.
3. Put the keys in `apps/api/.env.local` as `ELSEVIER_API_KEY` and `ELSEVIER_INSTTOKEN` (optional). Add both, empty, to `.env.example`. Never commit real keys.
4. Check the endpoint paths and parameters below against the current docs at dev.elsevier.com before coding.

### Step 8.1: Profile fields

In `packages/shared/src/modules/profile.ts`, add a section "Research IDs":
- `scopusAuthorId`: text, pattern `^\d{10,11}$`, with the help text "From your Scopus author page URL (authorId=…)".
- `researcherId`: text, pattern `^[A-Z]{1,3}-\d{4}-\d{4}$`, with the help text "Your Web of Science ResearcherID, e.g. AAB-1234-2020".
- `orcid`: optional, pattern `^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$`.
- WoS numbers, typed by the faculty member per D7:
  - `wosDocuments` (number)
  - `wosCitationsExclSelf` (number, "Sum of times cited without self-citations")
  - `wosHIndex` (number)
  - `wosAsOf` (date)
  - `wosEvidence` (file: a screenshot of the WoS profile metrics, 2 MB)

### Step 8.2: Storage

```ts
export const researcherMetrics = pgTable('researcher_metrics', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  source: text('source').notNull(),               // 'scopus' | 'wos'
  asOf: date('as_of').notNull(),
  documents: integer('documents'), citations: integer('citations'),
  citationsExclSelf: integer('citations_excl_self'),
  hIndex: integer('h_index'), hIndexExclSelf: integer('h_index_excl_self'),
  raw: jsonb('raw'),
}, (t) => [uniqueIndex('researcher_metrics_once').on(t.userId, t.source, t.asOf)]);
```

This keeps history, so the trend can be shown later. Saving the profile's WoS numbers also writes a `source: 'wos'` row.

### Step 8.3: Scopus client

Create `apps/api/src/server/researchers/scopus.ts`. Send the headers `X-ELS-APIKey` and `X-ELS-Insttoken` (when set) and `Accept: application/json`.

1. **Author metrics.** `GET https://api.elsevier.com/content/author/author_id/{id}?view=METRICS` gives h-index, document count, cited-by count and citation count.
   - Also check that the author's name matches the profile name, using the existing name matcher in `lookup/`. If it does not match, store nothing and show "This Scopus ID belongs to <name>".
2. **Document list.** `GET https://api.elsevier.com/content/search/scopus?query=AU-ID({id})&field=eid,dc:identifier,citedby-count&count=25&start=N`, page by page.
3. **Without self-citations.** `GET https://api.elsevier.com/content/abstract/citations?scopus_id={up to 25 ids, comma separated}&citation=exclude-self`, which gives per-document totals.
   - `citationsExclSelf` = the sum.
   - `hIndexExclSelf` = the h-index computed from those per-document counts. Write `hIndex(counts: number[])` in `packages/shared/src/format.ts` and unit-test it.
   - A 401 or 403 means the API is not enabled: leave both null and keep going.
4. **Schedule.**
   - Each night at 04:00 IST (use the same IST helper as `patentIndex.ts`), refresh about 1/30 of the faculty who have a Scopus ID, the ones refreshed longest ago, so that everyone is refreshed once a month within Elsevier's weekly quotas.
   - Add an admin button "Refresh now" for one person.
   - Space the calls at least 200 ms apart, and back off on HTTP 429.
5. Tests: mock `fetch`. Cover the name mismatch, the 403 on citations (nulls stored), the paging, and `hIndex([10,8,5,4,3]) === 4`.

### Step 8.4: Quality signal

Shown on the faculty profile (to the faculty member, their HOD and IQAC) and as a sortable IQAC table "Research quality" under Reports.

Numbers shown (always show the numbers, not just a label):

| Signal | How it's computed |
|---|---|
| Scopus documents | Scopus API |
| WoS documents | typed by the faculty member |
| WoS share | WoS documents ÷ Scopus documents (Scopus is the superset; capped at 100%) |
| Citations per paper (no self-citations) | Scopus citations excluding self ÷ Scopus documents (NA if not enabled) |
| h-index | Scopus (excluding self-citations if available) and WoS |
| Q1+Q2 share | from the faculty member's approved DARP publications in the selected range, using `rankingsFor` (the best of the SJR and JIF quartiles) |

Label, with thresholds IQAC can edit (stored in a settings row; the defaults are below):
- **Quality-leaning:** WoS share ≥ 50% **and** Q1+Q2 share ≥ 50%.
- **Volume-leaning:** Scopus documents ≥ 10 **and** Q1+Q2 share < 25% **and** citations per paper < 2.
- **Balanced:** everything else. **Not enough data:** fewer than 3 documents.

Put a one-line note under the label: "Citation habits differ by subject; compare within a department."

---

## Phase 9: Declutter page by page (UI)

Phase 1.4 already made everything light and bigger. Now remove clutter. Each change below is small. Check each page at 1280px and 390px wide.

1. **Sidebar** (`components/shell/Sidebar.tsx`):
   - Remove the count badges.
   - Remove the "Signed in as" header; the top bar already shows the user.
   - Show the module filter box only for IQAC and admin.
   - Move the IQAC contact details to the instructions page.
   - Keep the groups, with readable headings in sentence case.
2. **Module list** (`app/(app)/m/[moduleKey]/page.tsx`):
   - Remove the status chips and keep the Status dropdown, which now has only Draft / Approved / Returned.
   - Remove the "Reference" line (NAAC ref · bodies).
   - Keep the subtitle to one sentence.
   - Show at most **5 columns**: the module's first 3 `listColumns`, Year, Status. Show "Entered by" only for non-owners, and drop "Last updated".
   - Move the Nil declaration under a small "Nothing to report this year?" link that opens it.
3. **New record and form** (`new/page.tsx`, `RecordForm.tsx`):
   - Remove the info notice above the form.
   - Remove the locked strip's explanation sentence (keep Year and Department as plain text).
   - Shorten the lookup help to one line: "Type the DOI and press Fetch details."
   - Change the "Change"/"Undo" text links into small secondary buttons (44px high).
   - Use a single-column layout below 1024px.
   - Shorten every module field `help` to 80 characters or less (`grep -n "help:" packages/shared/src/modules/*.ts`).
4. **Record page** (`[id]/page.tsx`):
   - At the top, show one status line, e.g. "Approved on 12 Oct 2026" or "Returned: <remark>".
   - Below it, the form, then the ranking card (publications).
   - Put the "Changed or typed by you" table, Edit history and Workflow history inside collapsed `<details>` sections.
   - Remove the right sidebar.
5. **Dashboard:**
   - Remove the generated subtitle sentence, the "22 typed fields, 51 counters" text, the sub-lines under each module row and the lock icons on the tiles.
   - Keep 4 tiles and the "My modules" table.
6. **Admin:**
   - Accounts table: Name, Email, Role, Department and Actions (the rest goes into an expandable row).
   - Audit table: When, Who, What and Record.
7. **Consistency:**
   - Replace the local `ProgressPill` (dashboard) and `CHIP_TONE` (module page) with `StatePill`.
   - Replace the raw `<button>` and `<input>` elements in Sidebar, Topbar, AdminConsole tabs and JournalListsPanel with the `ui` components.
   - Replace hand-written uppercase labels with `Eyebrow`.
8. Run the existing Playwright suite against the test DB. Many selectors that use text will need updating; change the selectors, not the behaviour.

---

## Final checks (after every phase, and once more at the end)

1. `npm run typecheck && npm run lint && npm run build`: no new errors.
2. Server tests on `darp_test`: all pass.
3. Browser walk-through on the test DB. Follow the method in the handoff memory: stop the DARP window, start with the darp_test env, reseed with `LOOKUP_OFFLINE=1`, and restore afterwards.
   - **Faculty:** add a publication by DOI and check the ranking card; edit it after approval and check the history; bulk upload 3 DOIs; add a patent as Applied; add an award with a 2-year validity; change the profile year range.
   - **HOD:** return a record, see it come back in "Corrected after return", click "Looks fine".
   - **IQAC:** upload a JCR CSV and an MJL list; download a NAAC report for 2022–2024 with automatic year types; open it and check the year types per sheet, the Indexing column and IF/NA.
4. Tell the user which new migrations to apply to `darp`, and which data scripts are waiting for their go-ahead:
   - `approve-pending`
   - `backfill-years`
   - `drop-stored-rankings`
   - `patent-status-rename`
   - the `awardValidity` list insert

## Inputs still needed from the university

| Needed for | What |
|---|---|
| Phase 3 | A JCR CSV export (latest year, all editions) from the library, and the four Master Journal List downloads (SCIE, SSCI, AHCI, ESCI). |
| Phase 7 | The NIRF Data Capture formats and the NBA SAR table formats. The NAAC formats are already in `Downloads\BITWISE`. |
| Phase 8 | The Elsevier API key (+ institutional token if off-campus) and Elsevier's approval for the Citation Overview API (self-citation exclusion). |
| Phase 8 | Whether IQAC accepts the default quality-signal thresholds. |
