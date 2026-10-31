# Plan: fixes from the Phase 1 manual QA (2026-10-29)

**Status (2026-10-29): steps 1 to 5, 6a and 7 are built and tested (276 server tests, browser run on a test copy). Step 6b (HOD enters other faculty modules) is not built. Migrations 0007 and 0008 and the scripts `db:approve-pending` and `db:year-to-date` are not yet run on `darp`. Manual tests: `docs/MANUAL-TEST-P1-QA-FIXES.md`.**

These are the problems found while testing Phase 1 by hand. Each one has:

* what is wrong,
* why it happens (the file and line),
* how to fix it, step by step,
* where else the same problem appears,
* how to test it.

Do the steps in order. Run the tests after each group (see "How to test safely" at the end).

Decisions answered on 2026-10-29:

* D-S8: faculty see only their own department's MoUs.
* D-Q7: keep "Looks fine", improved.
* D-Q9: delete with a reason.
* D-Q6.2: the HOD's own profile and an "Open my profile" button, with the profile scope as it is now. Whether HODs also enter other records is to be confirmed (Step 6b).

---

## Summary

| # | Problem found in QA | Kind | Group |
|---|---|---|---|
| Q1 | After a record is saved, the browser asks "Leave site? Changes you made may not be saved" | Bug | A |
| Q2 | Funds & Grants shows the period as "FY 2027-28" whatever the duration is | Confusing label | B |
| Q3 | A year is asked where a date would be better (decided per module) | Design | B |
| Q4 | Duration accepts free text ("7 years") | Validation | B |
| Q5 | The return remark is plain text only | Feature | C |
| Q6.1 | The HOD can return Vandana's paper, but she is missing from the HOD's Faculty Profile list | Bug | D |
| Q6.2 | A HOD has no profile of their own; needs an "Open my profile" button | Design gap | D |
| Q6.3 | A Funds & Grants record that DRIE returned to S. Mahato is shown to HOD CSE | Expected, but explained badly | D |
| Q6.4 | "Open and fix" is shown to people who cannot fix the record | Bug | A |
| Q7 | Is "Looks fine" still needed, now that resubmissions are approved straight away? | Decision | E |
| Q8 | The HOD, offices and IQAC cannot see a record's edit history | Bug | A |
| Q9 | An approved record cannot be deleted | Decision | E |
| Q10 | IQAC cannot see "Delete" even on a draft or returned record | Bug | E |
| Q11 | Some records still show "Verified" | Leftover data | E |

Second review (2026-10-29): the user confirmed Q8 (edit history), clarified Q6.2 (profiles), added Q10 and Q11, and asked for Group B (year or date) to be written out as decided.

Other problems of the same kind found while checking the code are listed as **S1 to S8** under each group.

---

## Group A: bugs to fix first (small and safe)

### Q1. "Leave site?" pops up after saving

**Why it happens:** `apps/web/src/components/form/RecordForm.tsx`

* Lines 112–116 add a `beforeunload` handler that reads the `dirty` state.
* Line 209 calls `setDirty(false)`, and line 210 then navigates straight away with `window.location.href = …`.
* React has not re-rendered between those two lines, so the handler still sees `dirty === true`. The browser therefore shows its own "Leave site?" box, even though the record was saved.

**There is a second problem:** sidebar and breadcrumb links are Next.js client-side links. These never fire `beforeunload`, so typed data is lost silently when someone clicks a link.

**Fix:**

1. Replace the `dirty` state with a ref (`dirtyRef`) and keep a small `dirty` state only for display. Set `dirtyRef.current = false` before navigating.
   * Better still, navigate with `router.push(...)` and then call `router.refresh()`. This removes the full page reload, so `beforeunload` never fires on a successful save.
2. Add a reusable `ConfirmDialog` component in `apps/web/src/components/ui/ConfirmDialog.tsx`:
   * built on the native `<dialog>` element,
   * with a title, one sentence of body text, and two buttons: "Leave without saving" (danger) and "Stay on this page" (primary, focused first),
   * closes on Esc,
   * follows the light theme.
3. Add a `useLeaveGuard(dirtyRef)` hook in `apps/web/src/components/form/useLeaveGuard.ts`:
   * Listen for clicks in the capture phase on `document`. Look for the nearest `a[href]` that is same-origin, not `target=_blank`, and not a download link.
   * If the form is dirty, call `preventDefault()`, open the `ConfirmDialog`, and on confirm do `router.push(href)`.
   * Also handle the browser Back button: push a guard state with `history.pushState`, listen for `popstate`, and show the same dialog.
4. Keep `beforeunload` only for **closing the tab or reloading the page**.
   * Browsers do not allow a custom dialog for these two cases. Only the browser's own box can appear there, so it stays for them alone.
   * It must never fire after a save (step 1 makes sure of that).
5. Replace `window.confirm` in `apps/web/src/components/admin/JournalListsPanel.tsx:168` with `ConfirmDialog` so the app has one look.
6. Turn the inline "Delete this record?" notice in `DeleteRecord.tsx` into `ConfirmDialog` as well.

**Same problem elsewhere:**

* **S1.** Every module uses `RecordForm`, and so does the Faculty Profile, so this one fix covers all 24 modules.
* `ResetForm`, `ChangePasswordForm` and `LoginForm` have no leave guard, which is fine: they hold nothing worth protecting.

**Test:**

* **Unit:** the hook ignores external links and `_blank` links.
* **Playwright:**
  1. Type into a field, click a sidebar link: the dialog appears. "Stay" keeps what was typed; "Leave" navigates.
  2. Save a record: no browser box, and the list shows "Saved".
  3. Fetch DOI details, then save: no box.

---

### Q6.4. "Open and fix" is shown to everyone

**Why it happens:** in `apps/web/src/app/(app)/m/[moduleKey]/page.tsx`, lines 333–345 add the red "Returned for correction … Open and fix" row for every returned record. They do not check who is looking.

* The HOD, the office and faculty viewing MoUs all get a "fix" link they cannot use.
* The server is correct: it refuses the edit. The page is simply offering something it should not.

**Fix:**

1. In the list, if `row.isMine` is true, keep the current row: the remark plus "Open and fix".
2. Otherwise show a neutral grey row: "Returned to the owner by «role» on «date»: «remark». Waiting for them to correct it." with an "Open" link.
   * To do this, add `returnedByRole` and `returnedAt` to `RecordListRow`, taken from the latest `record_transitions` row whose `toStatus` is `returned`.
   * Fill them in `listRecords` (`apps/api/src/server/records/service.ts:87`) with one extra query for the ids on the page. Do not run one query per row.
3. On the record page `[id]/page.tsx:118-123`, change the "Returned for correction" notice:
   * If the viewer is not the owner, title it "Returned to the owner".
   * Never say "Correct the fields below" to a viewer who cannot edit. This is partly done; check the wording.
4. Fix the wording of the read-only notice at `[id]/page.tsx:125-133`. It tells every non-owner to use "Return to owner", even people who cannot return the record.
   * If the viewer can return it, keep the text.
   * If not, say "You are viewing this record; only its owner can change it."
   * Use the same `rail.includes('return')` condition that decides whether the button is shown.

**Same problem elsewhere:**

* **S2.** The "Still with me / With me" counts on the dashboard come from records the viewer owns. They are correct; no change needed.
* **S3.** On department modules (MoUs, workshops, FDP organised, EDP/MDP, feedback) the owner is a HOD. Check that a second HOD in the same department does not see "Open and fix". The `isMine` rule covers it.

**Test:**

* **Integration test:** `listRecords` returns `returnedByRole`.
* **Playwright:**
  1. As `drie`, return S. Mahato's grant.
  2. As `hodcse`, open Funds & Grants: a grey row and no "fix".
  3. As `mahato`: a red row with "Open and fix".

---

### Q8. Edit history is shown to the owner only

**Why it happens:** `apps/api/src/server/records/service.ts:286` sends `edits: mine ? await recordEditsFor(id) : []`. Here `mine` means the owner or IQAC.

**Fix:**

1. Send the edits to everyone who may read the record. `getRecord` has already passed `canReadRecord` by this point, so use `edits: await recordEditsFor(id)`.
2. Keep sensitive values hidden. `diffRecord` already hides PAN and Aadhaar changes and writes "file replaced" for evidence. Check that this also holds for the profile's `sensitive` fields when a HOD or the DoFA reads them.
3. On the record page, show the "Edit history" panel to every viewer.
   * Show it open by default for reviewers (anyone who is not the owner), because that is what they came to see.
   * Keep it closed for the owner.
4. On the "Corrected after you returned them" dashboard list, add a "What changed" link. It opens the record at `#edit-history`. Add that `id` to the `<details>`.

**Same problem elsewhere:**

* **S4.** "Workflow history" is already shown to every reader. Only the edits were held back.

**Test:**

* **Integration test:** `hodcse` reading Vandana's edited paper gets `edits.length > 0`. A profile edit seen by `hodcse` shows no PAN or Aadhaar values.
* **Manual:** as `hodcse`, open an edited paper: the history is visible.

---

## Group B: years, dates and durations (decided 2026-10-29)

Do Group B **together with Phase 2** of `PLAN-university-refinements-2026-10.md` (CY/AY/FY on every record). The year and date fields then change once, and saved records are converted once. Phase 5 (award validity) builds on the award dates set here.

### The rule

Ask for a **date** wherever the event happened on a known day and the proof shows that day. Keep a **year** where the source gives only a year.

A date is better for three reasons:

* **It places the record in the right FY and AY.** FY starts on 1 April and AY on 1 July. The year 2025 alone could be FY 2024-25 or FY 2025-26; the date 12-02-2025 is FY 2024-25 for certain.
* **Validity can be counted from it.** Award validity (Phase 5) and an MoU's expiry need a start day.
* **The proof shows it anyway.** A sanction letter, award certificate or MoU always carries the date, so typing it costs nothing.

### Decided per module

| Module | Field today (key) | New field (key) | Label on the form |
|---|---|---|---|
| Funds & Grants | `sanctionYear` (year) | `sanctionDate` (date) | Date of sanction |
| Awards & Recognition | `awardYear` (year) | `awardDate` (date) | Date of award |
| R&I Awards | `awardYear` (year) | `awardDate` (date) | Date of award |
| Extension awards | `awardYear` (year) | `awardDate` (date) | Date of award |
| Fellowships | `awardYear` (year) | `awardDate` (date) | Date of award |
| MoUs | `signingYear` (year) | `signingDate` (date) | Date of signing the MoU |
| Financial support | `supportYear` (year) | `supportDate` (date) | Date the support was received |

**Kept as a year:**

* Publications (`year`, filled from the DOI): journals often give only a year or month.
* Books & Chapters (`year`, filled from the ISBN): same.
* Students guided (`yearOfPassing`): degrees are counted by passing year.
* Exams (`year`, CDC) and Quality (`year`, DoFA): yearly figures.

**Kept as a financial year:**

* Consultancy (`financialYear`) and EDP/MDP (`financialYear`): the office reports these by FY. EDP/MDP already has start and end dates as well.

### Steps for each module that changes

Do this for each of the 7 modules in the "Decided per module" table:

1. **Field.** In `packages/shared/src/modules/<module>.ts`:
   * Change the field to `type: 'date'`.
   * Rename the key as in the table, and use the new label.
   * Add `notFuture: true` (see step 6) and `periodSource: true` (see step 2).
   * Keep `required: true`, the `section` and the `exportAs` headings exactly as they are.
2. **Which field gives the period.**
   * Add `periodSource?: boolean` to `FieldConfig` in `_types.ts`.
   * In `periodSourceField` (`apps/api/src/server/records/periods.ts:18`), pick the field with `periodSource: true` first, and only then fall back to the current rule (a year field, then the first date field).
   * This matters for Financial support and MoUs, which already have other date fields: the conference dates and `activityDate`. Without the flag the wrong date would decide the period.
3. **Natural key, list and sort.** Replace the old key with the new one in `naturalKey`, `listColumns` and `defaultSort`. For example, in grants: `naturalKey: ['title', 'agency', 'sanctionDate']`.
   * Duplicate checks then compare the full date, so two different awards with the same name in the same year are no longer refused.
4. **Exports keep the official columns.** The NAAC, NIRF and office templates ask for a **year**, e.g. "Year of award or sanction (FY 2024, 2023, 2022)". The export therefore writes:
   * the year for CY modules (awards, R&I awards, extension awards): `2025`,
   * the FY start year for FY modules (grants, fellowships, financial support), e.g. `2024` for 12-02-2025, in the same form the column uses today,
   * the AY start year for MoUs.

   Implement this as a new `exportAs` option on the field: `exportFormat: 'periodYear'`. `export/excel.ts` writes the record's period year in that column instead of the raw date. Where a template has its own date column (for example "Date of award" in the awards sheet), write the date there as DD-MM-YYYY.
5. **Convert saved records.** Write `apps/api/scripts/year-to-date.ts`, which runs once inside a transaction.
   * For each changed module, turn the saved year into the **first day of the record's own period**, so no record moves to a different year:

     | Period type | Saved year | Becomes |
     |---|---|---|
     | CY (awards, R&I awards, extension awards) | 2024 | `2024-01-01` |
     | FY (grants, fellowships, financial support) | 2024 | `2024-04-01` (FY 2024-25) |
     | AY (MoUs) | 2024 | `2024-07-01` (AY 2024-25) |

   * Remove the old key from `data`, add the new one, and leave `periodYear` and `periodLabel` unchanged. Check this: they must come out the same.
   * Mark the record: add `estimatedDates: ['awardDate']` to `records.data`.
     * The form shows an amber "Estimated from the year: please enter the exact date" note under that field.
     * The note goes away when the owner saves a date. `updateRecord` drops the key from `estimatedDates` once the field changes.
   * Write one `record_edits` row per record, with the note "Date estimated from the year (October 2026 change)", so the change appears in the edit history.
   * Print the count per module. Run it on `darp_test` first. Run it on `darp` **only after the user says yes.**
6. **No future dates or years.**
   * Add `notFuture?: boolean` to `FieldConfig`.
   * In the shared validator, refuse a `date` after today, or a `year` after the current year, with the message "This date is in the future."
   * Turn it on for every sanction, award, signing, support, publication and passing field.
   * Leave it off for planned end dates (FDP end date, conference end date).
   * On the form, set `max` on the date input to today, so the date picker cannot go further.
7. **Seed and tests.**
   * Update `apps/api/scripts/seed-demo.ts` to write the new date keys.
   * Update `tests/unit/periods.test.ts` and `tests/unit/validate.test.ts`. These are the only places that name the old keys besides the module files.
   * Add new tests:
     * `sanctionDate` `2025-02-12` gives "FY 2024-25"; `2025-04-01` gives "FY 2025-26".
     * Finance support uses `supportDate`, not the conference `startDate`.
     * A future date is refused.
     * The conversion keeps `periodYear` for all three period types.

### Q2. Funds & Grants "FY 2027-28" whatever the duration

**Why it happens:**

* `periods.ts:50-53` uses `sanctionYear` as the period's starting year: 2027 becomes "FY 2027-28".
* The duration is free text and plays no part in it.
* The form's top strip calls this "Reporting period", which reads like the project's own span.
* The year field allows up to 2100, so 2027 was accepted in October 2026.

**Fix:**

1. With the steps above, the FY comes from the sanction **date**, and a future date is refused.
2. Rename the strip label in `RecordForm.tsx:240` from "Reporting period" to **"Counted in"**.
   * After Phase 2 it shows "CY 2025 · FY 2024-25 · AY 2024-25".
3. Add a read-only **"Project period"** line under Duration, e.g. "12-02-2025 to 11-02-2028 (3 years) · FY 2024-25 to FY 2027-28".
   * It is computed from `sanctionDate` plus `durationYears` (Q4). It is not stored.
   * Add `projectPeriod` to `DerivedKey` and compute it in `derivedValues`, like the journal rankings.
   * It is shown in the list and exported as the column "Project period".
4. Do the same for MoUs: a derived **"Valid until"**, computed from `signingDate` plus `durationYears`.
   * Show "Expired" in grey once that date has passed.

**Same problem elsewhere:**

* **S5.** All 14 modules with a `year` field allow up to 2100: awards, books, consultancy, edpmdp, exams, extawards, fellowships, finsupport, grants, mous, publications, quality, riawards and studentsguided. `notFuture` (step 6) closes all of them.

### Q4. Duration should be a number of years only

**Why it happens:**

* `grants.ts:41` declares `duration` as `type: 'text'` with the placeholder "3 years".
* `mous.ts:36` does the same.

**Fix:**

1. Change both to `{ key: 'durationYears', label: 'Duration (in years)', type: 'decimal', min: 0.5, max: 30, step: 0.5 }`.
   * This allows 1.5 years.
   * If `FieldType` has no `decimal`, add it, with validation for numbers that have at most one decimal place.
2. The input is a number box with "years" shown after it. Letters are refused on screen and by the server.
3. Exports keep the heading "Duration" and write "3 years".
4. The conversion script (step 5 above) also reads a number out of the old text:
   * "3 years" → 3, "36 months" → 3, "2.5 yrs" → 2.5, "18 months" → 1.5.
   * If no number can be read (for example "three"), leave the field empty and add `needsInput: ['durationYears']` to the record's data. It works like `estimatedDates`: the form shows "Please enter the duration in years" until the owner saves a value. Count these records in the report.

**Same problem elsewhere:**

* **S6.** FDP attended (days) and the profile's post-doctoral months are already numbers. Only grants and MoUs change.

**Test:**

* **Unit:** "7 years" is refused, 3 and 1.5 are accepted, 0 is refused.
* **Script:** "3 years", "36 months" and "three".
* **Manual:**
  * A grant sanctioned 12-02-2025 for 3 years shows "FY 2024-25" and the project period up to 11-02-2028.
  * Typing a sanction date in 2027 is refused.

---

## Group C: formatting in the return remark

### Q5. Formatted return remarks

**Why it is plain:**

* `apps/web/src/components/records/ActionRail.tsx:139` is a plain `<Textarea>`.
* The server (`apps/api/src/routes/modules/transition.ts:8`) stores up to 1,000 characters of plain text.

**Fix:** a small, safe formatting box. **Never store HTML.**

1. Add a `RemarkEditor` component (`components/records/RemarkEditor.tsx`):
   * the textarea, plus a toolbar with **Bold**, *Italic*, bulleted list, numbered list and Link,
   * the buttons wrap the selected text in simple marks (`**bold**`, `_italic_`, `- item`, `1. item`, `[text](https://…)`),
   * Ctrl+B and Ctrl+I work,
   * a "Preview" tab shows the result.
2. Add a renderer `renderRemark(text): ReactNode` in `packages/shared/src/remark.ts`, or in the web package.
   * It first **escapes** all HTML, then turns only those few marks into elements.
   * Links are allowed only for `http:` or `https:`, with `rel="noopener noreferrer"` and `target="_blank"`.
   * Nothing else is supported, so a remark cannot inject a script.
3. Use `renderRemark` everywhere a remark is shown:
   * the list row (`m/[moduleKey]/page.tsx:340`),
   * the record page notice (`[id]/page.tsx:120`),
   * Workflow history (`[id]/page.tsx:276`),
   * the dashboard corrections list, if it shows remarks.
4. Raise the limit from 1,000 to 2,000 characters in `transition.ts:8`, and show a character count under the box.
5. Old plain remarks display exactly as before, because plain text contains none of these marks.

**Test:**

* **Unit tests for the renderer:**
  * `<script>` comes out as text,
  * `[x](javascript:alert(1))` is not made into a link,
  * bold, italic and lists come out correctly.
* **Manual:** return a record with a bulleted list. The owner sees the list on the list page and on the record.

---

## Group D: who sees which faculty, and the HOD's own profile

### Q6.1 and Q6.2. Who sees which profiles, and the HOD's own profile

**What the user asked for** (clarified 2026-10-29):

* Seeing other people's profiles stays as it is now. A HOD sees the profiles of their own department, just as IQAC sees every profile in the university.
* The one addition is an **"Open my profile"** button for the HOD.

**Who sees which profiles.** This is already how the scope rules work (`scope.ts:28-34`, `permissions.ts:62-71`). Keep it.

| Role | Sees the Faculty Profiles of |
|---|---|
| Faculty | Only their own |
| HOD | Everyone in their own department, as the department's head |
| DoFA (verifies profiles) | Everyone, every department |
| IQAC (admin) | Everyone, every department |
| DRIE, DUGS, CDC | No one (the module is not theirs) |

**Bug 1: Vandana is missing from the HOD's list.** Checked in the dev database (read-only): Dr Vandana Bhattacharjee (CSE) has papers, books, a grant and consultancy, but she has never saved her Faculty Profile, so there is no profile record to list.

Fix: keep the list exactly as it looks now, but build the Faculty Profile list from the **user accounts** rather than from profile records.

1. In `listRecords` for `moduleKey === 'profile'` (`apps/api/src/server/records/service.ts:87`), or in a small new function `listProfiles(actor, params)` that the route calls for the profile module:
   * Start from `users` (active, role faculty or hod) within the caller's scope: the HOD's own department, or everyone for DoFA and IQAC.
   * Left-join each person's profile record.
2. Someone with no profile record appears as a row with their name and department and the status **"Not filled yet"**.
   * Add `'none'` to the status chip set, shown in grey, display-only. It is not a `RecordStatus` and is never stored.
   * Clicking the row opens a short page: "«Name» has not filled in their profile yet."
3. Rows that do have a profile record behave exactly as today: open, return with a remark, edit history.
4. Paging, search and the status filter work on the combined list. Add "Not filled yet" to the status dropdown.

**Bug 2: the HOD has no profile of their own.**

* `profile.ts:13` has `ownerRoles: ['faculty']`, so a HOD cannot create a profile.
* "My profile" (`apps/web/src/app/(app)/profile/page.tsx:26-31`) treats the refusal as "no profile", so the page is empty for a HOD.

Fix:

1. Change `profile.ts` to `ownerRoles: ['faculty', 'hod']`.
   * A HOD's own profile is checked by the DoFA and IQAC.
   * A HOD can **never** return their own profile. The existing `!record.isMine` check on the return button and the owner check in `canTransition` already ensure this. Add a test.
2. Add an **"Open my profile"** button for the HOD:
   * at the top right of the Faculty Profile list page (`m/[moduleKey]/page.tsx`, in `actions`), when `m.key === 'profile'` and the user can own a profile,
   * on the HOD's dashboard (the "My profile" card at `dashboard/page.tsx:198` is shown only when `ownsModules`; show it to a HOD too).

   The button goes to `/profile`, which then works for the HOD exactly as it does for faculty.
3. `managedLink` (`m/[moduleKey]/page.tsx:139`) already uses `m.ownerRoles.includes(user.role)`, so it starts working for HODs once `hod` is an owner. Check that the button text reads "Open my profile".
4. In the list, the HOD's own row says "You" and is opened through "My profile". It has no Return button.

**Earlier answer about HODs entering other records** (D-Q6.2, "HOD is faculty too"): the user's clarification is about the profile. Adding `hod` to the owners of the **other** faculty modules (papers, grants and so on) is kept as a separate step, Step 6b in the order of work. Confirm it with the user before building it; skip it if they meant only the profile.

**Tests:**

* `scope.test.ts`:
  * `hodcse` lists the CSE profiles, Vandana included, as "Not filled yet".
  * `hodcse` does not list ME people.
  * DoFA and IQAC list everyone.
  * Faculty list only themselves.
* `permissions.test.ts`:
  * A HOD may create their own profile.
  * A HOD may not return their own profile.
* Manual:
  1. Sign in as `hodcse` and open Faculty Profile: Vandana is listed as "Not filled yet".
  2. Press "Open my profile", fill it in and save.
  3. Sign in as `dofa`: Prof. R. K. Sinha's profile is listed, and DoFA can return it.

**Same problem elsewhere:**

* **S7.** The dashboard's department completion figure counts only people who have records. Use the same "every active faculty member" list as the denominator, so a department whose faculty have entered nothing does not look complete.

### Q6.3. A record DRIE returned to S. Mahato is shown to HOD CSE

S. Mahato is in CSE, so HOD CSE is **meant** to see the department's Funds & Grants, returned ones included. That part is correct.

What was wrong is how it was presented: the HOD got the owner's red "Returned … Open and fix" row as if it were the HOD's job. Q6.4 fixes this. The HOD then sees a grey "Returned to the owner by DRIE on «date» — waiting for them" row, which is useful (the HOD can chase the faculty member) and not misleading.

**Same problem elsewhere:**

* **S8. Faculty see every department's MoUs.**
  * `mous.ts` lists `'faculty'` in `viewRoles`.
  * `scopeFilter` (`apps/api/src/server/records/scope.ts:34`) gives anyone in `viewRoles` every record, across all departments.
  * The result: every faculty member can read every department's MoUs. It looks unintended.
  * **Fix:** for `scope: 'department'` modules, a faculty viewer sees only their own department's records. In `scopeFilter`, and in `canReadRecord` in `permissions.ts:69`, add before the office rule: `if (actor.role === 'faculty' && m.scope === 'department') return and(base, eq(records.departmentId, actor.departmentId))`.
  * Add a security test.
  * **DECISION D-S8: decided 2026-10-29, recommended option chosen** (own department only). The alternative is to keep MoUs visible institute-wide on purpose.

---

## Group E: workflow decisions

### Q7. Keep "Looks fine"?

What happens today:

1. A record is returned.
2. The owner corrects it and resubmits, and it is approved at once.
3. It appears in "Corrected after you returned them" on the reviewer's dashboard.
4. "Looks fine" removes it from that list.

**DECISION D-Q7: decided 2026-10-29, recommended option chosen** (**keep it, but make it clearer**).

* Without it, a return means nothing: the faculty member could resubmit without changing a single thing, the record would be approved, and nobody would notice. This list is the only second look left now that approval is automatic.
* Rename the button **"Checked — no further action"**.
* Next to it, in the same row, offer **"Return again"**, which opens the remark box.
* Show "What changed" (Q8). Even better, show the changed fields inline in the row (the latest edit's labels, e.g. "Changed: Journal name, Year"), so most checks need no click.
* If the owner resubmits **without changing any field**, flag the row "Resubmitted without changes" in amber. `updateRecord` already knows the diff; save a boolean `unchangedResubmit` alongside `correction_for_user_id`.
* Optional: items older than 30 days drop off by themselves, so the list never becomes a backlog.

### Q9. Deleting any of your own records (decided: yes, with a reason)

What happens today: `permissions.ts:79-82` lets the owner delete only a draft or returned record. IQAC may delete anything.

**New rules:**

| Who | Which records | Reason needed? |
|---|---|---|
| Owner | Their own, **any** status | Only for an approved record (5–300 characters, e.g. "Entered twice", "Wrong module", "Not my paper") |
| IQAC | Anyone's, any status | **Always**, because it is someone else's record. The owner sees the reason in the record's history |
| HOD and offices | None | They return the record instead |

**Steps:**

1. In `permissions.ts`, change `canDeleteRecord`:
   * admin → true;
   * owner → true for any status;
   * everyone else → false.
2. Add `deleteNeedsReason(actor, r)`, which returns `actor.role === 'admin' && !isOwner || r.status === 'approved'`.
   * The DELETE route (`service.ts:575`) reads `reason` from the request body and refuses a missing or short one when it is needed.
3. Keep it a soft delete, as today: `deletedAt` is set and the row stays.
   * Also insert a `record_transitions` row (to status `deleted`, with the reason as its remark) and an audit log entry.
   * The record drops out of every list, total and export immediately.
4. Add **Admin → Deleted records**: who deleted it, when, why, and its module and owner, with a **Restore** button.
   * Restore clears `deletedAt` and writes a "restored" transition.
   * The record returns with the status it had before.
5. On the record page, show "Delete this record" in the `ConfirmDialog` from Q1, with the reason box when it is needed.

### Q10. IQAC cannot see "Delete" (bug)

**Why it happens:** the server already allows IQAC to delete any record (`canDeleteRecord` returns true for admin). The **page** hides the button.

* `[id]/page.tsx:64` defines `ownOpen = editable && record.isMine && (draft or returned)`.
* `[id]/page.tsx:244` shows `DeleteRecord` only when `ownOpen`.
* `isMine` is false for IQAC on someone else's record, so the button never appears.

This is not because the records are demo data.

**Fix:**

1. Add `canDelete: boolean` to `RecordDetail` (`packages/shared/src/contracts.ts`), filled in `getRecord` from `canDeleteRecord(actor, m, ownership)`.
2. Add `deleteNeedsReason: boolean` alongside it.
3. The page shows the Delete button when `record.canDelete`, and no longer uses `ownOpen` for this.
4. The rule then lives in one place, the server, and the page simply follows it.

**Same problem elsewhere:** check the page for other buttons decided by `isMine` instead of a server flag. The "Open and fix" link (Q6.4) is one. Use a server flag wherever a rule exists.

**Test:** as `iqac`, open Verma's draft: "Delete" is shown, it asks for a reason, and the record disappears from Verma's list.

### Q11. Some records still show "Verified"

**What it means:** nothing any more. Before Phase 1 a record went Submitted → Verified (by the office) → Approved (by IQAC). Now every record is approved on submit.

The dev database `darp` (checked read-only on 2026-10-29) still holds old-flow records that never finished that path:

* **47 `verified`**, across 21 modules,
* **2 `submitted`**, both in Books,
* almost all of them created by the demo seed.

The clean-up script `npm run db:approve-pending -w @darp/api` was written for exactly this but has not been run on `darp`.

**Fix:**

1. With the user's OK, run `npm run db:approve-pending -w @darp/api` on `darp`.
   * It turns every `submitted` and `verified` record into `approved` and records why in its history.
   * Run it on `darp_test` first.
2. Update `seed-demo.ts` so it creates only `draft`, `approved` and `returned` records. Otherwise a reseed brings "Verified" back.
3. Remove the old code paths that keep the old states alive:
   * the `verify` and `approve` actions in `WorkflowAction` and `canTransition` (`permissions.ts`),
   * `verify` and `approve` in the record page's action list (`[id]/page.tsx:76,80`) and in `ActionRail.tsx`,
   * `submitted` and `verified` in `COUNTED_STATUSES` and `CHECKED_STATUSES` (`service.ts:191`),
   * the dashboard sum `totals.approved + totals.submitted + totals.verified`, which becomes `totals.approved`,
   * the two extra keys in `statusCounts`, from the UI only.
4. Keep the database enum values. Removing values from a Postgres enum is risky, and old rows in the history still name them.
   * Add a test that no service function produces `submitted` or `verified`.
5. The export and counters then count `approved` only.

## Order of work

| Step | Items | Size | Needs |
|---|---|---|---|
| 1 | Q1 leave dialog, Q6.4 fix link, Q8 edit history for reviewers | Small | — |
| 2 | Q5 formatted remarks | Small | — |
| 3 | Q7 "Checked" + "Return again" + unchanged flag | Small | — |
| 4 | Q9 delete any status with a reason, Q10 IQAC delete button, IQAC restore | Medium | — |
| 5 | Q11 remove the old Verified/Submitted paths; fix the seed | Small | The user's OK to run `db:approve-pending` on `darp` |
| 6a | Q6.1 every faculty member in the profile list, Q6.2 HOD's own profile + "Open my profile", S7, S8 MoU scope | Medium | — |
| 6b | HOD enters their own papers, grants and so on (other faculty modules) | Medium | Confirm with the user |
| 7 | Group B: dates, durations, `notFuture`, project period, MoU valid-until, conversion script | Medium | Do with Phase 2; the user's OK to run `year-to-date.ts` on `darp` |

After each step, give the user a manual test list, as was done for Phase 1.

## Data notes (dev database `darp`, checked read-only on 2026-10-29)

* Status counts (not deleted): 38 draft, 65 approved, 16 returned, 47 verified, 2 submitted. The last two groups are the Q11 leftovers.
* Vandana has **no profile record**, which is why she is missing from the HOD's list (Q6.1).
* No script has been run on `darp`. `db:approve-pending` and `year-to-date.ts` both wait for the user's OK.

## How to test safely

* Integration tests wipe the database they run on. Run them only against `darp_test`:
  * set `DATABASE_URL` and `DATABASE_URL_OWNER` to `…/darp_test`,
  * check with grep before running `npm test -w @darp/api`.
* Browser checks: use the test copy on ports 3100/4100 pointed at `darp_test`, then reseed with `LOOKUP_OFFLINE=1 npx tsx scripts/seed-demo.ts`.
* Never run the conversion scripts (`year-to-date.ts`, `approve-pending`) on `darp` without asking the user first.
