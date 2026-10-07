# DARP — Manual Test Cases

Hands-on checks that the website works, written from the implementation plan
(`Project Info/implementation`, especially `11-acceptance-checklist.md` and the journeys in
`09-testing.md`) and checked against the code as it is today. Every label in quotes is the exact
text on screen.

Mark each case **Pass**, **Fail** or **Blocked** in the last column. A case marked
**(known issue Kn)** is expected to fail until that issue is fixed; see [Known issues](#known-issues).

---

## 0 · Before you start

### 0.1 Start the app

1. Start Docker Desktop and make sure the `darp-db` container is running.
2. In the repo root run `npm run dev`. Keep this terminal visible: password-reset links are printed here.
3. Open **http://localhost:3000**. Use `localhost` and not `127.0.0.1`: the site only accepts
   writes from the address in `APP_URL`, so `127.0.0.1` makes every save fail.

### 0.2 Start from known data

The demo data can drift as you test. To get back to a clean starting point:

```
npm run db:seed:demo -- --clear
npm run db:seed:demo
```

Do **not** run `npm run test` while testing by hand. The integration tests wipe the records tables.

### 0.3 Accounts

Every demo account uses the password **`DarpDemo!2026Pass`**.

| Sign in as | Role | Department |
|---|---|---|
| `verma@demo.bitmesra.ac.in` | Faculty | CSE |
| `mahato@demo.bitmesra.ac.in` | Faculty | CSE |
| `ranjan@demo.bitmesra.ac.in` | Faculty | EEE |
| `kujur@demo.bitmesra.ac.in` | Faculty | ME |
| `hodcse@demo.bitmesra.ac.in` | Head of Department | CSE |
| `hodme@demo.bitmesra.ac.in` | Head of Department | ME |
| `dofa@demo.bitmesra.ac.in` | DOFA — Dean of Faculty Affairs | — |
| `drie@demo.bitmesra.ac.in` | DRIE — Dean of Research, Innovation & Entrepreneurship | — |
| `dugs@demo.bitmesra.ac.in` | DUGS / DPGS — Dean of UG & PG Studies | — |
| `cdc@demo.bitmesra.ac.in` | CDC — Career Development Centre | — |
| `iqac@demo.bitmesra.ac.in` | IQAC Administrator | — |

The real admin account `iqac@bitmesra.ac.in` (password in `apps/api/.env.local`) is not needed for
these tests.

### 0.4 Things that will trip you up

- **Two people at once.** Use a normal window and a private window, or two browsers. Signing in as the
  *same* account somewhere else signs the first one out; this is intended.
- **Sign-in limit.** At most 10 sign-ins per minute. If you see "Too many requests. Try again in Ns.",
  wait that long.
- **Shared network limit.** On your own machine every tester counts as the same network address. 20
  wrong passwords within 15 minutes, from anyone, blocks *all* sign-ins for 15 minutes with "Too many
  failed attempts from this network. Try again later." Run the lockout tests once, carefully.
- **The admin console has no link.** Type `http://localhost:3000/admin` in the address bar.
- **"Security check failed. Reload the page and try again." on every save** after you reopened the
  browser means you hit known issue K4. Sign out, then sign in again.

### 0.5 Test values

| What | Valid | Invalid |
|---|---|---|
| Aadhaar (Verhoeff checksum) | `234567890124`, `987654321012` | `234567890125` (bad checksum), `134567890124` (starts with 1) |
| PAN | `ABCDE1234F` | `ABCDE12345` |
| DOI | `10.1016/j.future.2026.107812` | `hello` |
| ISSN | `0167-739X` | `12345` |
| URL | `https://example.org/course` | `www.example.org` |
| A password that satisfies the rules | `Blue-Kettle-4821` | see AUTH-07 |

---

## Known issues

These were found while preparing this document, by reading the code. Each is confirmed by the test
named next to it, which is expected to **fail** until the issue is fixed.

| # | Issue | Test |
|---|---|---|
| ~~K1~~ | **Fixed (Oct 2026).** Evidence uploads failed with "Invalid field." and files were never linked to their record. Uploads now work, files are attached to the record on save, and the form shows a download link. | EVD-01 – EVD-07 |
| K2 | **A HOD's lists show every department's records**, not just their own. Opening another department's row gives a 404. Faculty likewise see every department's MoUs. | ROLE-12, ROLE-14 |
| K3 | **IQAC saving a verified or approved record resets it.** "Save as draft" sets it back to Draft, and "Save and submit" back to Submitted, so the verification is lost. | WF-09 |
| K4 | **Saves fail after you reopen the browser.** The session lasts 8 hours across browser restarts, but the security token cookie is deleted when the browser closes and is never re-issued. | SES-07 |
| K5 | **"My profile" for HOD, DOFA and IQAC shows someone else's profile.** It loads the first profile they are allowed to see. | PROF-07 |
| K6 | **A returned Faculty Profile cannot be resubmitted** unless Aadhaar and PAN are typed again. They come back blank, so "Save and submit" says they are required. | PROF-06 |
| K7 | **Exports are plain sheets, not the original workbooks.** No `.xlsx` templates are in the repo, so the export writes column headers only, without the original layout, instructions or dropdowns. The Competitive Exams grand total is not computed. | EXP-07, EXP-08 |
| K8 | **Missing features in the UI**: <br>• no Delete button <br>• no "Submit" action on the record page (use "Save and submit") <br>• no evidence download <br>• no link to the admin console <br>• no admin "view as" <br>• no screen for the unmasked export (URL only) <br>• no screen to reveal a single Aadhaar/PAN <br>• no screen for "since joining" baselines | REC-08, ADM-09 |
| K9 | **Years outside the cycle are accepted silently.** A 2019 publication is filed under 2024 and counted, where the plan said such a year should be refused or flagged. | VAL-12 |
| K10 | **Sign-in small gaps:** <br>• "Keep me signed in" does nothing. <br>• After being sent to sign in, you always land on the dashboard, not the page you asked for. <br>• No confirmation is shown after a password reset. <br>• "Forgot password" shows the same "Check your e-mail" notice even when the request was refused. | AUTH-14 |
| K11 | **Smaller UI defects:** <br>• ~~The verification queue card disappears instead of saying "Nothing waiting".~~ Fixed. <br>• "Nothing to report" declarations do not count in the department completion table. <br>• The unsaved-changes warning does not fire when you click a sidebar link. <br>• The error summary is not focused after a failed save. | DASH-08, NIL-03, REC-07, UX-04 |
| K12 | **Validation gaps:** <br>• A field's own minimum year is ignored; only 1950–2100 is enforced. <br>• The ₹5,000 minimum on Financial Support is not enforced. <br>• An end date before its start date is accepted. | VAL-07, VAL-13, VAL-14 |
| K13 | **No e-mail is sent.** Password-reset links are printed in the API terminal only. This is fine for testing; e-mail needs setting up before go-live. | AUTH-09 |

---

## 1 · Smoke test (10 minutes)

Run this first after any change. If any step fails, stop and investigate before the full run.

| ID | Do this | You should see | Result |
|---|---|---|---|
| S-01 | Open http://localhost:3000 | Landing page, heading "One place for every accreditation number." | |
| S-02 | "Sign in to DARP" → sign in as `verma` | "Good to see you, Dr A. K. Verma" | |
| S-03 | Sidebar → Publications | List with 2+ records and the status chips | |
| S-04 | "Add record" → fill every field marked * (Doi `10.5555/darp-smoke-1`, Year `2023`) → "Save and submit" | "Your record was saved."; the new row says Submitted | |
| S-05 | In a private window sign in as `drie` → open that record → "Verify record" | Status becomes Verified | |
| S-06 | Sign in as `iqac` → open the record → "Approve record" | Status becomes Approved | |
| S-07 | As `iqac` go to `/admin` → "Exports" → "Export" on Research & Innovation | A file `DARP-drie-<date>.xlsx` downloads and opens in Excel | |
| S-08 | User menu (top right) → "Sign out" | Back on the sign-in page; `/dashboard` sends you to sign in | |

---

## 2 · Public pages

| ID | Do this | You should see | Result |
|---|---|---|---|
| PUB-01 | Open `/` signed out | Heading "One place for every accreditation number."; buttons "Sign in to DARP" and "Read the instructions"; a "Twenty-four modules…" section; the footer says "Accounts are created by IQAC; there is no self-registration." No cycle number such as "NAAC Cycle 4" is hard-coded on the page. | |
| PUB-02 | "Read the instructions" | Heading "Entry guidelines". The "On this page" links (Who fills in what, Adding a record, Evidence rules, What the states mean, Which years to report, Common questions, Getting help) each jump to their section. | |
| PUB-03 | Signed out, open `/dashboard`, `/profile`, `/m/publications` and `/admin` | Each sends you to the sign-in page | |
| PUB-04 | Look at the browser tab title on `/`, `/login` and `/instructions` | "DARP · Accreditation Data Portal · BIT Mesra", "Sign in · DARP", "Entry guidelines · DARP" | |

---

## 3 · Signing in and passwords

For AUTH-05 to AUTH-08, first create a throwaway account (ADM-02): name **Test Faculty One**,
e-mail **testfac1@bitmesra.ac.in**, role Faculty, department CSE. Note its temporary password.

| ID | Do this | You should see | Result |
|---|---|---|---|
| AUTH-01 | Sign in as `verma` with the right password | Dashboard, "Good to see you, Dr A. K. Verma"; the top bar shows "Faculty · CSE" | |
| AUTH-02 | Sign in as `verma` with a wrong password | "E-mail or password is incorrect." | |
| AUTH-03 | Sign in as `nobody@demo.bitmesra.ac.in` with any password. In dev tools → Network, compare how long this login request takes against AUTH-02. | Exactly the same message as AUTH-02, and roughly the same time, so nobody can tell which e-mails exist | |
| AUTH-04 | Press "Sign in" with both boxes empty, then again with `not-an-email` | "Some fields need attention." | |
| AUTH-05 | **Lockout.** Sign in as `testfac1` with a wrong password 5 times, then once with the *right* temporary password. | Attempts 1–5: "E-mail or password is incorrect." Attempt 6: "This account is temporarily locked. Try again in 15 minutes." | |
| AUTH-06 | **Unlock by reset.** As `iqac`, `/admin` → Accounts → Test Faculty One → "Reset password". Sign in as `testfac1` with the new temporary password. | Signing in works. Unlocking does not need the 15-minute wait. | |
| AUTH-07 | **First sign-in.** Continue from AUTH-06. | You land on "Set your password" with "Your account was created by IQAC with a temporary password. Choose your own before continuing." Typing `/dashboard` in the address bar brings you back here. | |
| AUTH-08 | **Password rules.** On that page, put the temporary password in "Current password" and try each "New password" below. | <br>• `Short1!` → "Password must be at least 12 characters." <br>• `administrator` → "That password is too common." <br>• `Xtestfac1-2026!` → "Password must not contain your e-mail address." <br>• `Test-Kettle-2026` → "Password must not contain your name." <br>• `alllowercaseletters` → "Use a mix of upper case, lower case, digits and symbols (at least three of the four)." <br>• a different "Confirm new password" → "Both entries must match." <br>• a wrong "Current password" → "That is not your current password." <br>• the temporary password as the new one → "Choose a password you have not used here before." | |
| AUTH-09 | Set the new password `Blue-Kettle-4821` → "Save password" | Lands on the dashboard. Sign out; the temporary password no longer works and the new one does. | |
| AUTH-10 | **Forgot password.** Sign out → "Forgot password?" → enter `testfac1@bitmesra.ac.in` → "Send reset link" | "Check your e-mail … The link expires in 30 minutes." The `npm run dev` terminal prints a line containing `password reset issued` with a link `/reset?token=…`. | |
| AUTH-11 | Open `http://localhost:3000` + that link → set a new password twice → "Set password" | "Choose a new password" page; afterwards you are on the sign-in page and the new password works | |
| AUTH-12 | Open the same reset link again | "This reset link is invalid or has expired." | |
| AUTH-13 | Request a reset for `nobody@bitmesra.ac.in`. Then open `/reset` with no token. | The same "Check your e-mail" notice, but **no** link in the terminal. Then "This link is incomplete". | |
| AUTH-14 | Signed out, open `/m/publications`, then sign in **(known issue K10)** | Expected: you land on Publications. Today: you land on the dashboard. | |

---

## 4 · Sessions and signing out

| ID | Do this | You should see | Result |
|---|---|---|---|
| SES-01 | Sign in as `verma` → user menu → "Sign out" → press the browser Back button, then reload | The sign-in page; no record data is visible after the reload | |
| SES-02 | Sign in as `verma` in window A, then as `verma` in a private window B. Reload window A. | Window A goes to the sign-in page, because one account has one session | |
| SES-03 | As `testfac1`, user menu → "Change password" | The page says "Changing your password signs you out of every other device." After saving you stay signed in here. (SES-02 already shows that only one session exists at a time.) | |
| SES-04 | While `testfac1` is signed in, as `iqac` → `/admin` → Accounts → "Deactivate" Test Faculty One. In the testfac1 window, click any link. Then try to sign in again. | Sent to sign in; signing in gives "E-mail or password is incorrect." "Reactivate" lets them in again. | |
| SES-05 | **Idle timeout (30 minutes).** Sign in, leave the tab untouched for 31 minutes, then click a link. To test faster, put `SESSION_IDLE_MINUTES=2` in `apps/api/.env.local` and restart `npm run dev`; remove it afterwards. | Sent to the sign-in page | |
| SES-06 | Dev tools → Application → Cookies → `http://localhost:3000` | `darp_session`: HttpOnly ✓, SameSite Lax. `darp_csrf`: **not** HttpOnly, which is intended. (Secure is only set on the real HTTPS site.) | |
| SES-07 | Sign in, close the **whole** browser, reopen it and go to `/m/publications` → open a draft → "Save as draft" **(known issue K4)** | Expected: saves. Today: still signed in, but "Security check failed. Reload the page and try again." | |

---

## 5 · Roles and access

### 5.1 What each role sees

Sign in as each account and compare the sidebar under "Signed in as …". Click "Overview" and a few
modules.

| ID | Account | Sidebar should list | "Add record" appears in | Result |
|---|---|---|---|---|
| ROLE-01 | `verma` (faculty) | <br>• **Faculty:** Faculty Profile, Awards & Recognition, Awards for Extension Activities, Financial Support, FDPs Attended, QS Academic Reputation Contacts <br>• **Research:** all 8 <br>• **Students:** Students Guided, Student Mentorship <br>• **Teaching:** E-content <br>• **Department:** MoUs & Activities | Every module except MoUs & Activities | |
| ROLE-02 | `hodcse` (HOD) | Everything faculty sees, plus Student Workshops & Training, FDPs Organised, Curriculum Feedback, EDP/MDP Revenue. **Not** Quality Assurance or Competitive Exams. | MoUs, Workshops, FDPs Organised, Curriculum Feedback, EDP/MDP only | |
| ROLE-03 | `dofa` | The 6 Faculty modules, Students Guided, FDPs Organised, EDP/MDP Revenue, Quality Assurance Activities | Quality Assurance Activities only | |
| ROLE-04 | `drie` | The 8 Research modules and MoUs & Activities | None | |
| ROLE-05 | `dugs` | Student Mentorship, E-content, Student Workshops & Training, Curriculum Feedback | None | |
| ROLE-06 | `cdc` | Students Qualifying Competitive Exams | That module | |
| ROLE-07 | `iqac` | All 24 modules | All 24 | |

### 5.2 Access is enforced on the server, not just hidden

| ID | Do this | You should see | Result |
|---|---|---|---|
| ROLE-08 | Type `/admin` as `verma`, `drie` and `hodcse`; then as `iqac` | The first three go back to the dashboard. `iqac` sees "Administration" with the tabs Accounts, Master lists, Cycle, Audit log, Exports. | |
| ROLE-09 | As `cdc`, type `/m/publications`. As `verma`, type `/m/exams` and `/m/quality`. | A 404 page ("This page could not be found.") | |
| ROLE-10 | As `drie`, type `/m/publications/new` | "This module is not yours to add to"; no form | |
| ROLE-11 | **Another person's record by URL.** As `verma`, open one of their records and copy the address. As `mahato`, paste it. | 404. Mahato cannot see Verma's record. | |
| ROLE-12 | **HOD department scope (known issue K2).** As `hodcse` → Publications. | Expected: only CSE records (Verma, Mahato). Today: rows by Ranjan (EEE) and Kujur (ME) are listed too, and clicking one gives a 404. | |
| ROLE-13 | As `hodcse`, open a Verma record | It opens read-only, with no Save buttons | |
| ROLE-14 | As `verma` → MoUs & Activities **(known issue K2)** | Expected: only CSE's MoUs, read-only. Today: every department's. | |
| ROLE-15 | As `drie` → Publications | Records from every department (CSE, EEE, ME). Deans see institute-wide, which is correct. | |
| ROLE-16 | As `verma`, type `/m/doesnotexist` and `/m/publications/00000000-0000-0000-0000-000000000000` | 404 for both | |

---

## 6 · Adding and editing records

Use `verma` → Publications unless stated otherwise.

| ID | Do this | You should see | Result |
|---|---|---|---|
| REC-01 | "Add record" | Title "Add a publications record". A locked strip shows Reporting period, Department (CSE) and Entered by (Dr A. K. Verma), with "Pre-filled from your account and locked…". These three cannot be changed. | |
| REC-02 | Fill only "Paper title" → "Save as draft" | "Your record was saved."; the new row's status is Draft. A draft may be incomplete. | |
| REC-03 | Open that draft → "Save and submit" without filling the rest | A red summary "Some fields need attention." listing each missing field, and "… is required." under each field. Everything you typed is still there. | |
| REC-04 | Fill all required fields (DOI `10.1016/j.future.2026.107812`, Year `2023`, …) → "Save and submit" | Status Submitted. Opening it shows "This record is submitted, so it is read-only…", with no Save buttons. | |
| REC-05 | Open a different draft → change a field → "Save as draft" → reopen | The change is kept, and "Last updated" has changed | |
| REC-06 | Open a draft → change something → "Cancel" | Back to the list, and the change is **not** saved | |
| REC-07 | Type into a new form, then: (a) reload the tab, (b) click "Back to list", (c) click a sidebar module **(c is known issue K11)** | (a) and (b): the browser asks whether to leave. (c): expected the same; today it leaves silently and the typing is lost. | |
| REC-08 | Look for a way to delete a draft **(known issue K8)** | Expected per the plan: an owner can delete their draft or returned record. Today: there is no Delete button. | |
| REC-09 | Note the dashboard tiles, submit one draft, return to the dashboard | "Still with me" goes down by 1 and "Awaiting verification" goes up by 1 | |

---

## 7 · Field checks

Each row: enter the value, press "Save as draft" (format checks run on drafts too), and read the
message under the field.

| ID | Module → field | Enter | You should see | Result |
|---|---|---|---|---|
| VAL-01 | Publications → Doi | `hello` | "Enter a valid DOI, for example 10.1016/j.future.2026.107812" | |
| VAL-02 | Publications → Doi | `https://doi.org/10.1016/J.FUTURE.2026.107812` on a second record after REC-04 | Treated as the same DOI and refused as a duplicate (see DUP-02) | |
| VAL-03 | Publications → ISSN number of Journal | `12345` | "ISSN looks like 0167-739X." | |
| VAL-04 | Publications → Year of publication | `1949`, then `2101` | "Year looks too early." / "Year looks too far ahead." | |
| VAL-05 | Books & Chapters → ISBN | `abc` | "Enter a valid ISBN." | |
| VAL-06 | QS Academic Reputation Contacts → e-mail and phone | `abc`; `123` | "Enter a valid e-mail address."; "Enter a valid phone number." | |
| VAL-07 | Publications → Year of publication | `1955` **(known issue K12)** | Expected: refused, because the field's minimum is 1960. Today: accepted. | |
| VAL-08 | E-content → URL | `www.example.org` | "Enter a full link starting with http:// or https://" | |
| VAL-09 | Funds & Grants → any amount (money) | type `4,82,000` | The box keeps digits only: `482000`. In the list or record it shows as 4,82,000 (Indian grouping). | |
| VAL-10 | Funds & Grants → amount | `99999999999` | "That amount looks too large." | |
| VAL-11 | Faculty Profile → PAN No. / AADHAAR No. | `ABCDE12345`; `234567890125`; `134567890124` | "PAN looks like ABCDE1234F."; "Enter a valid 12-digit Aadhaar number." for both Aadhaar values | |
| VAL-12 | Publications → Year of publication | `2019` **(known issue K9)** | Expected: refused or flagged as outside the cycle (2022–2024). Today: saved and filed under 2024. | |
| VAL-13 | Financial Support → amount | `4000` **(known issue K12)** | Expected: refused (the help text says the minimum is ₹5,000). Today: accepted. | |
| VAL-14 | Financial Support → purpose "Conference/Workshop/Seminar/Symposium, etc" → end date before start date **(known issue K12)** | Expected: refused. Today: accepted. | |
| VAL-15 | Any long text field | Keep typing past its limit | Typing stops at the limit | |

---

## 8 · Workflow: submit, verify, return, approve, unlock

| ID | Do this | You should see | Result |
|---|---|---|---|
| WF-01 | As `drie`, open the dashboard | A "Verification queue" card with a Publications row and a "To verify" count ≥ 1. Clicking it opens the list filtered to Submitted. | |
| WF-02 | Open Verma's submitted record (REC-04) | Buttons "Verify record" and "Return to owner" | |
| WF-03 | "Verify record" | Status Verified. "Workflow history" shows "Submitted → Verified" by the DRIE. | |
| WF-04 | Still as `drie`, on that verified record | "Return to owner" is offered. **No** "Approve record", because only IQAC approves. | |
| WF-05 | As `iqac`, open it → "Approve record" | Status Approved; a new row in the history | |
| WF-06 | As `verma`, open it | Read-only; Verma cannot change an approved record | |
| WF-07 | As `iqac` → "Unlock record" | Status back to Verified | |
| WF-08 | **Return needs a reason.** As `drie`, on another submitted record → "Return to owner" → leave the box empty → "Return with this remark". Then type `The ISSN does not match the journal.` and press it again. | First: "Say what needs correcting — the owner only sees this remark." Then the status becomes Returned. | |
| WF-09 | **(known issue K3)** As `iqac`, open an Approved record → "Save as draft" | Expected: it stays Approved (an admin edit is only logged). Today: it becomes **Draft**. | |
| WF-10 | As `verma` → Publications | The returned row has a red line "Returned for correction: The ISSN does not match the journal. Open and fix" | |
| WF-11 | Open it | A red notice "Returned for correction" with the remark; the form is editable | |
| WF-12 | Change a field → "Save as draft" | It stays **Returned**, and the remark is still shown | |
| WF-13 | "Save and submit" | Submitted; the red notice is gone; the history keeps the remark | |
| WF-14 | **Each office verifies only its own modules.** As `hodcse`, submit a new MoU. Then as `dofa` look for it; then as `drie` open it. | DOFA has no MoUs module. DRIE sees it and can verify. | |
| WF-15 | Repeat WF-14 for the other HOD and office modules | <br>• FDPs Organised (`hodcse`) → verified by `dofa` <br>• Student Workshops (`hodcse`) → `dugs` <br>• Quality Assurance Activities (`dofa`) → `iqac` <br>• Competitive Exams (`cdc`) → `iqac` | |

---

## 9 · Duplicates and one-per rules

| ID | Do this | You should see | Result |
|---|---|---|---|
| DUP-01 | As `mahato`, add a Publication with the same DOI Verma used in REC-04 | A summary naming the owner: "This doi is already recorded (entered by Dr A. K. Verma). Each item is entered once — ask them to add you…", and "Already recorded in this cycle." under Doi | |
| DUP-02 | Same as DUP-01, with the DOI in capitals or prefixed `https://doi.org/` | Still caught | |
| DUP-03 | As `verma` → Faculty Profile → "Add record" → fill → save | "Your profile already exists for this cycle. Edit it instead of adding a second one." | |
| DUP-04 | As `hodcse` → Curriculum Feedback → add a second answer | "Curriculum feedback is one answer per department per cycle. Edit the existing answer instead." | |
| DUP-05 | As `mahato`, enter the same Funds & Grants project Verma entered (same title, agency and year), with role Co-PI | Refused as a duplicate. **Decision for IQAC:** a Co-PI can never record a project its PI already entered, so Co-PI counts stay at zero. Note the result for discussion. | |

---

## 10 · Form behaviour and dropdown lists

| ID | Do this | You should see | Result |
|---|---|---|---|
| FORM-01 | Students Guided → "Add record" → change "Status after passing" to each value | <br>• "Employed": Name of Employer, Pay package at appointment, Offer letter <br>• "Higher Studies": Name of institution enrolled in, Program enrolled in, Admission letter / ID card <br>• "Competitive exams": Exam given, Registration Number of such exam, Scorecard <br>• "None of the above": none of these | |
| FORM-02 | Choose "Employed", fill Name of Employer, switch to "Higher Studies", fill it, "Save as draft", reopen, switch back to "Employed" | Name of Employer is empty. Hidden values are not stored. | |
| FORM-03 | Books & Chapters: switch between Book and Book chapter | The chapter-title field only appears for a book chapter | |
| FORM-04 | QS Academic Reputation Contacts: set consent to "Consent received" | A required consent date and the evidence field appear | |
| FORM-05 | Curriculum Feedback (`hodme`): choose "E. Feedback not collected" | "Links to the documents" disappears | |
| FORM-06 | Competitive Exams (`cdc`): choose "Other examinations conducted by the State / Central Government Agencies" | An extra exam-name field appears and is required | |
| FORM-07 | **IQAC edits a dropdown.** As `iqac` → `/admin` → "Master lists" → List `indexingTypes` → add `Test Index` → "Add". As `verma`, reload a Publications form. | "Test Index" is in the Indexing dropdown | |
| FORM-08 | Add `Test Index` again; then "Deactivate" it and add it once more | "That value is already in this list."; then "That value exists but is deactivated. Reactivate it instead of adding it again." It is gone from the Publications dropdown. | |
| FORM-09 | Move a value with the up and down arrows | The dropdown order on the form changes the same way | |

---

## 11 · Lists, search and filters

| ID | Do this | You should see | Result |
|---|---|---|---|
| LIST-01 | As `drie` → Publications → type part of a paper title in "Search" | The list filters itself after half a second: "Showing 1–n of N matching records" | |
| LIST-02 | Click the "Submitted" chip; click it again | It filters to Submitted, then clears | |
| LIST-03 | Use "Status" and "Reporting period" → "Apply" → "Clear filters" | The filter works, then everything is back | |
| LIST-04 | Search `zzzz` | "No record matches these filters" with a "Clear filters" button | |
| LIST-05 | Copy a filtered list's address into a new tab | The same filtered view | |
| LIST-06 | As `verma` → QS Academic Reputation Contacts → search for a contact's e-mail | No result. Personal fields are never searchable. | |
| LIST-07 | In a list with more than 20 records (as `iqac`, or after adding records) | "Page 1 of 2" with "Previous" and "Next" | |

---

## 12 · "Nothing to report" (nil return)

Use `testfac1`, which has no records.

| ID | Do this | You should see | Result |
|---|---|---|---|
| NIL-01 | Open Patents | "No patents recorded in this cycle" with "Add the first record", and a checkbox "Nothing to report in Patents this cycle" | |
| NIL-02 | Tick it | "Declared. IQAC sees this module as complete with no records." On the dashboard's "My modules", Patents shows "· nothing to report" and status Submitted. Untick it and the declaration goes away. | |
| NIL-03 | Tick it again. As `drie`, check the "Completion by department" row for CSE **(known issue K11)**. | Expected: the declaration counts toward CSE's modules covered. Today: it is ignored. | |

---

## 13 · Dashboards

| ID | Do this | You should see | Result |
|---|---|---|---|
| DASH-01 | As `verma` | Tiles "My records", "Still with me", "Awaiting verification", "Approved by IQAC". The numbers agree with the status chips in the modules. | |
| DASH-02 | "My modules" table | Columns Module / Records / With me / Status; status words Not started / In progress / Submitted / Verified / Approved | |
| DASH-03 | "Continue data entry" | Opens a module form | |
| DASH-04 | As `drie` | Tiles "Awaiting my verification", "Awaiting IQAC approval", "Departments", "Institute completion"; the "Verification queue"; a "Completion by department" table saying "Aggregates only — no record contents are shown here." | |
| DASH-05 | As `hodcse` | The department card is "My department" and shows CSE only | |
| DASH-06 | As `iqac` | The queue shows both "To verify" and "To approve" | |
| DASH-07 | As `iqac` → `/admin` → "Cycle" → set a "Deadline" → "Save dates". Then open any dashboard. | "The cycle dates were saved and logged." The dashboard shows "Data entry closes DD-MM-YYYY. Records still in draft after that date are not counted." Clear the deadline afterwards. | |
| DASH-08 | As `dugs`, verify or return everything in their queue **(known issue K11)** | Expected: "Nothing waiting — Every submitted record has been dealt with." Today: the card disappears. | |

---

## 14 · Profile and computed totals

| ID | Do this | You should see | Result |
|---|---|---|---|
| PROF-01 | As `verma` → user menu → "My profile" | "My profile" with the cards "My details", "Computed totals", "Figures you declare", "Where each number comes from" | |
| PROF-02 | Look at Aadhaar and PAN in "My details" | Shown only as `XXXX-XXXX-1234` and `XXXXX1234X`. Searching the page (Ctrl+F) for the full number finds nothing. | |
| PROF-03 | "Computed totals" | Read-only; each group has an "open module →" link to the module it comes from | |
| PROF-04 | Note "Publications 2022–2024". Add a publication as a draft, then submit it. | The draft does **not** change the total. After submitting it goes up by 1, at once. | |
| PROF-05 | "Figures you declare": change a number → "Save" → reload | "Saved", and the value is kept after the reload | |
| PROF-06 | **(known issue K6)** As `dofa`, return Verma's Faculty Profile (if it is Approved, have `iqac` "Unlock record" first; if it is a Draft, have Verma submit it first). As `verma`, open it and "Save and submit" without touching Aadhaar or PAN. | Expected: submits, keeping the stored numbers. Today: "AADHAAR No. is required." / "PAN No. is required." | |
| PROF-07 | **(known issue K5)** As `hodcse`, then `dofa`, then `iqac`, open "My profile" | Expected: an empty profile or a "not applicable" message. Today: "My details" shows another person's profile. | |

---

## 15 · Personal data (Aadhaar, PAN, student contacts)

| ID | Do this | You should see | Result |
|---|---|---|---|
| PII-01 | As `verma`, open your Faculty Profile record | The Aadhaar and PAN boxes are empty and marked "Protected". Leaving them empty on "Save as draft" keeps the stored values. | |
| PII-02 | As `verma` → Students Guided → open one | The student's e-mail and phone are shown in full to the owner | |
| PII-03 | As `dofa` (verifier) and `hodcse`, open the same record | The e-mail looks like `a•••@domain` and the phone like `••••••3210` | |
| PII-04 | **Unmasked export.** As `drie`, open `http://localhost:3000/api/export/drie?includePii=1&reason=Needed for NAAC submission` | Refused: "A written reason is required to export unmasked personal data, and only IQAC may do it." | |
| PII-05 | As `iqac`, open `/api/export/faculty?includePii=1` (no reason) | The same refusal | |
| PII-06 | As `iqac`, open `/api/export/faculty?includePii=1&reason=Needed for NAAC submission` | The workbook downloads with full Aadhaar/PAN. `/admin` → "Audit log" shows a highlighted `pii.reveal` row and an `export.generate` row. | |
| PII-07 | `/admin` → "Audit log" → find a Faculty Profile update | Aadhaar and PAN appear only as `[ciphertext]` or `[redacted]` | |

---

## 16 · Evidence files

| ID | Do this | You should see | Result |
|---|---|---|---|
| EVD-01 | As `verma` → Patents → "Add record" → "Attach documents (published/grant certificate)" → "Choose file" → a small PDF | The file name appears as a link; "Save as draft" keeps it | |
| EVD-02 | Choose a file larger than 5 MB | "That file is larger than 5 MB." (checked in the browser) | |
| EVD-03 | Rename a `.txt` file to `.pdf` and upload it | "The file contents do not match its extension." | |
| EVD-04 | Upload a `.docx`, `.svg` or `.html` | "Only PDF, JPG and PNG files are accepted." | |
| EVD-05 | Click the file link, as the owner and then as `drie` (the verifier) on the same record | It downloads as a file, never opens as a web page | |
| EVD-06 | As `mahato`, paste the download address of Verma's file (`/api/evidence/<id>`) | Refused (not found) — files follow the record's permissions | |
| EVD-07 | Submit the patent; as `drie` open it | The attached file is listed and downloadable on the read-only record | |

---

## 17 · Excel export

| ID | Do this | You should see | Result |
|---|---|---|---|
| EXP-01 | As `iqac` → `/admin` → "Exports" → "Export" on each of the 6 workbooks | 6 files named `DARP-<workbook>-YYYY-MM-DD.xlsx`, and each opens in Excel | |
| EXP-02 | In the app, count Publications that are Verified or Approved. Open the DRIE export → publications sheet. | Row count matches. No Draft, Submitted or Returned record appears; check one known draft title is absent. | |
| EXP-03 | Make a Seed Money record with amount `450000`, have `drie` verify it, export DRIE | The amount column (in lakhs) shows `4.5` | |
| EXP-04 | Faculty workbook, normal export | Aadhaar and PAN are masked | |
| EXP-05 | Type the export address directly: <br>• as `drie`: `/api/export/drie` and `/api/export/dofa` <br>• as `verma`: `/api/export/faculty` <br>• as `hodcse`: `/api/export/hod` | <br>• `drie`: works, then refused <br>• `verma`: refused <br>• `hodcse`: works with CSE rows only (refusals appear as a short JSON message) | |
| EXP-06 | `/admin` → "Audit log" | One `export.generate` entry per export | |
| EXP-07 | **(known issue K7)** Open an export next to the original workbook | Expected: same layout, instructions and dropdowns. Today: plain header-only sheets. **IQAC must sign off that the export is acceptable.** | |
| EXP-08 | **(known issue K7)** Competitive Exams workbook | Expected: per-exam totals and a grand total. Today: not computed. | |

---

## 18 · Administration

| ID | Do this | You should see | Result |
|---|---|---|---|
| ADM-01 | `/admin` → "Accounts": try the search box, "All roles" and "Deactivated only" | The list narrows correctly; "{n} of {m} accounts" updates | |
| ADM-02 | "New account" → Full name `Test Faculty One`, e-mail `testfac1@bitmesra.ac.in`, Role Faculty, no Department → "Create account". Then choose CSE → "Create account". | First: "Choose the department this account belongs to." Then "Temporary password issued", showing the password once, and "Done". The row shows "Must change password". | |
| ADM-03 | Create another account with the same e-mail | A clear refusal, with no second account created | |
| ADM-04 | "Edit" an account → change the department → "Save changes" | Saved; the user sees the new department in the top bar after signing in again | |
| ADM-05 | Find your own row | Marked "(you)", and its "Deactivate" button is disabled | |
| ADM-06 | "Cycle" tab | <br>• "NAAC Cycle 4 · 2022–2024", "Active cycle" <br>• CY 01-01-2022 → 31-12-2024 <br>• FY 01-04-2022 → 31-03-2025 <br>• AY 01-07-2022 → 30-06-2025 | |
| ADM-07 | "Audit log": filter by Actor = Dr A. K. Verma, then by Action, then a date range | Only matching rows. Today's sign-ins, saves, transitions and exports are listed with time and IP. There is no button to edit or delete an entry. | |
| ADM-08 | Check the sign-in record: in Accounts, "Last sign-in" for `verma` | Today's date and time | |
| ADM-09 | **(known issue K8)** Look for a link to Administration anywhere in the app, and for a way to "view as" another user | Expected per the plan: admin reaches the console from the app, and has a read-only, audited "view as". Today: neither exists. | |

---

## 19 · Security checks in the browser

Open dev tools with F12.

| ID | Do this | You should see | Result |
|---|---|---|---|
| SEC-01 | Network tab → reload `/dashboard` → click the first (document) request → Response headers | `content-security-policy`, `x-frame-options: DENY`, `x-content-type-options: nosniff`, `referrer-policy: same-origin`. `strict-transport-security` appears only on the real HTTPS site. | |
| SEC-02 | Click any `/api/...` request | `cache-control: no-store, …` | |
| SEC-03 | Application → Cookies → delete `darp_csrf` → save any draft | "Security check failed. Reload the page and try again." (sign out and in to recover) | |
| SEC-04 | Open `http://127.0.0.1:3000/login` and try to sign in | "Security check failed…". Writes from any address other than the real site are refused. | |
| SEC-05 | Signed in, open `/api/modules/doesnotexist/records` | A short JSON error, with no stack trace, file paths or SQL | |
| SEC-06 | Page source (Ctrl+U) on the profile page | No 12-digit number anywhere | |

---

## 20 · Usability and accessibility

| ID | Do this | You should see | Result |
|---|---|---|---|
| UX-01 | Dev tools → device toolbar → 390 px wide → visit the dashboard, a list, a form and the profile | Everything usable; no sideways scrolling of the page | |
| UX-02 | Press Tab once on any signed-in page | A "Skip to main content" link appears | |
| UX-03 | **Keyboard only:** add and submit a Publication without touching the mouse | Possible: Tab, Space and Enter reach every field and "Save and submit" | |
| UX-04 | Submit an incomplete form **(focus part is known issue K11)** | Errors appear under each field **and** in a summary at the top; clicking a summary link jumps to the field. Expected: keyboard focus moves to the summary. Today: it does not. | |
| UX-05 | Look at the status pills | Every status has a word (Draft, Submitted…), not only a colour | |
| UX-06 | Look at dates and money anywhere | Dates are DD-MM-YYYY; money uses Indian grouping, e.g. 4,82,000 | |
| UX-07 | Sidebar → "Filter modules" → type `pat`, then `zzz` | Only Patents; then "No module matches “zzz”." | |

---

## 21 · All 24 modules

For each module: sign in as the creator, **add** a record with every required field, **edit** it,
check it in the **list**, "Save and submit", have the verifier **verify** it, then have `iqac`
**approve** it. Finally check it appears in the **export** (where an export column exists).

| # | Module | Create as | Verify as | Also check | Add | Edit | List | Verify | Export |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Faculty Profile | `verma` (has one; use `testfac1`) | `dofa` | One per person (DUP-03); Aadhaar/PAN masked | | | | | |
| 2 | Publications | `verma` | `drie` | DOI duplicate guard | | | | | |
| 3 | Patents | `verma` | `drie` | Status "Published" / "Awarded/Granted" changes the counters | | | | | |
| 4 | Books & Chapters | `verma` | `drie` | Chapter title only for chapters | | | | | |
| 5 | Funds & Grants | `verma` | `drie` | PI / Co-PI counters; DUP-05 | | | | | |
| 6 | Consultancy & Corporate Training | `verma` | `drie` | Number of trainees only for corporate training; **both** tables of the sheet fill on export | | | | | |
| 7 | Fellowships & Travel Grants | `verma` | `drie` | — | | | | | |
| 8 | Seed Money | `verma` | `drie` | Export shows **lakhs** (EXP-03) | | | | | |
| 9 | Research & Innovation Awards | `verma` | `drie` | Appears in the Faculty, DRIE **and** HOD workbooks | | | | | |
| 10 | Awards & Recognition | `verma` | `dofa` | Export pulls PAN and designation from the profile | | | | | |
| 11 | Awards for Extension Activities | `verma` | `dofa` | — | | | | | |
| 12 | Financial Support | `verma` | `dofa` | Dates only for conferences; VAL-13, VAL-14 | | | | | |
| 13 | FDPs Attended | `verma` | `dofa` | Two faculty at the same FDP collide (note for IQAC) | | | | | |
| 14 | Students Guided | `verma` | `dofa` | Conditional fields (FORM-01/02); contacts masked to others | | | | | |
| 15 | QS Academic Reputation Contacts | `verma` | `dofa` | Consent status recorded (FORM-04) | | | | | |
| 16 | Student Mentorship | `verma` | `dugs` | One mentor per roll number | | | | | |
| 17 | E-content | `verma` | `dugs` | URL format (VAL-08) | | | | | |
| 18 | MoUs & Activities | `hodcse` | `drie` | Exports to the DRIE and HOD workbooks | | | | | |
| 19 | Student Workshops & Training | `hodcse` | `dugs` | — | | | | | |
| 20 | FDPs Organised | `hodcse` | `dofa` | Separate from FDPs Attended | | | | | |
| 21 | Curriculum Feedback (1.4.1) | `hodme` (the demo data already has one per department: edit it) | `dugs` | One per department (DUP-04); option E hides links | | | | | |
| 22 | EDP/MDP Revenue | `hodcse` | `dofa` | One per financial year; amount in words in the export | | | | | |
| 23 | Quality Assurance Activities (6.5.2) | `dofa` | `iqac` | One per year | | | | | |
| 24 | Students Qualifying Competitive Exams (5.2.1) | `cdc` | `iqac` | "Other examinations…" needs a name; grand total (EXP-08) | | | | | |

---

## 22 · Publications: automatic fetch, approval on submission, checks afterwards

Publications are **approved when submitted** — they never wait for DRIE or IQAC. DRIE and IQAC check afterwards: rows with something unconfirmed carry a **Check** marker, and they can return an approved publication. Quartile and Scopus indexing come from Elsevier's public Scopus list, fetched by the server (Administration → Journal lists shows it; "Refresh now" fetches again).

| ID | Do this | You should see | Result |
|---|---|---|---|
| LOOK-01 | As `verma` → Publications → "Add record" → paste `10.1109/access.2023.3237542` → "Fetch details" | Title, journal (IEEE Access), year 2023, ISSN 2169-3536, volume, pages, citation filled and "Fetched · locked"; Indexing **Scopus**, Quartile **Q1**, Quartile source "SJR 2023 · Scopus list" | |
| LOOK-02 | Read the notes under "Fetch details" | "Your name (Dr A. K. Verma) must be in the author list before you can submit…" — Verma is not an author of this paper | |
| LOOK-03 | "Save and submit" straight away | Refused: the author-list message under "Name of the author/s", and "Attach evidence…" under Evidence | |
| LOOK-04 | "Save as draft" instead | Saved as Draft — the name rule applies only to submitting | |
| LOOK-05 | Add ", A. K. Verma" to the author list, attach a PDF as Evidence, "Save and submit" | Status **Approved** immediately | |
| LOOK-06 | As `drie` → Publications → status "Approved" | That row shows a yellow **Check** marker | |
| LOOK-07 | Open it as `drie` | "Approved automatically — points to check: Dr A. K. Verma is not in the author list the publisher registered — the name was added by hand."; the evidence link downloads; "Return to owner" is offered | |
| LOOK-08 | "Return to owner" with a remark | Status Returned; Verma sees the remark | |
| LOOK-09 | As `verma`, fix and "Save and submit" again | Status **Submitted** (goes to DRIE), not straight back to Approved | |
| LOOK-09b | As `drie`, open it | The button reads **"Verify and approve"** (note: no IQAC approval follows). Pressing it → status **Approved**; IQAC's dashboard shows nothing to approve for Publications | |
| LOOK-10 | Fetch a DOI whose journal is not in Scopus (e.g. `10.1016/j.matpr.2021.01.001`, Materials Today: Proceedings) | Indexing and Quartile are **empty and editable** — choose them yourself; Quartile source stays empty and locked; evidence is then required | |
| LOOK-11 | Fetch `hello`, then `10.9999/nope` | "That does not look like a valid DOI."; then "No published record was found…" and every field editable | |
| LOOK-12 | A paper where you are a real author (an account named after a real BIT author, e.g. `Dr Vandana Bhattacharjee` for the DOI in LOOK-01) | Approved on submission with **no** evidence needed and no Check marker; the record says "Checked automatically" | |
| LOOK-13 | Books & Chapters → fetch `10.1007/978-981-19-0475-2_1` | "Book chapter", book title "Innovations in Computational Intelligence and Computer Vision" (not the series name). Books still go to DRIE unless every check passes | |
| LOOK-14 | As `iqac` → `/admin` → "Journal lists" | "Automatic: Scopus list from Elsevier" shows the November 2024 list and its counts; "Refresh now" works | |
| LOOK-15 | Patents → Country India → number `IN202331012345A` → save | Stored as `202331012345`; `TEMP/E-1/…` is refused with an explanation. Patents still go to DRIE | |

## After testing

1. Reset the data (section 0.2) so the next tester starts clean.
2. As `iqac`, deactivate `testfac1` if you will not reset.
3. Give the failed IDs, with a screenshot each, to the developer.
