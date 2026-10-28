# Manual test: Phase 1 QA fixes (2026-10-29)

Password for every demo account: `DarpDemo!2026Pass`. Accounts: `verma`, `mahato` (CSE faculty), `ranjan` (EEE), `kujur` (ME), `hodcse`, `hodme`, `dofa`, `drie`, `dugs`, `cdc`, `iqac`, all `@demo.bitmesra.ac.in`.

Before you start, the database needs the two new migrations: `npm run db:migrate -w @darp/api`, then restart the servers.

| # | Sign in as | Steps | Expected |
|---|---|---|---|
| **Leave dialog (Q1)** | | | |
| 1 | `verma` | Funds & Grants → Add record. Type a title. Click “Overview” in the sidebar | A small box: “Leave without saving?” with “Stay on this page” and “Leave without saving”. No grey browser box |
| 2 | `verma` | Press “Stay on this page” | You are still on the form and the title is still there |
| 3 | `verma` | Fill the whole form (use a draft) and press “Save as draft” | The list opens with “Your record was saved”. **No** “Leave site?” box |
| 4 | `verma` | Open a form, type something, press the browser Back button | The same “Leave without saving?” box |
| 5 | `iqac` | Admin → Journal lists → Remove on any list | The same clean box (“Remove …?”), not a browser alert |
| **Grants: dates and duration (Q2–Q4)** | | | |
| 6 | `verma` | Funds & Grants → Add record. Look at the top strip | It says “Counted in”, not “Reporting period” |
| 7 | `verma` | Type `7 years` in Duration | Only `7` stays; letters cannot be typed. The label is “Duration (in years)” |
| 8 | `verma` | Duration `3`, Date of sanction `12-02-2025` | A line appears: “Project period: 12-02-2025 to 11-02-2028 (3 years) · FY 2024-25 to FY 2027-28” |
| 9 | `verma` | Try to pick a date after today in “Date of sanction” | The calendar stops at today. If typed by hand, saving says “This date is in the future.” |
| 10 | `verma` | Save the grant. In the list, look at the columns | “Date of sanction” and “Project period”; the period in the list is FY 2024-25 |
| 11 | `hodcse` | MoUs → Add record | “Date of signing the MoU” and “Duration (in years)” (a number). In the list, a “Valid until” column |
| 12 | `verma` | Awards, R&I awards, Extension awards, Fellowships, Financial support → Add record | Each asks for a **date** (award date / date support was received), not a year |
| **Return remark (Q5)** | | | |
| 13 | `drie` | Funds & Grants → open an approved grant → Return to owner | A toolbar: **B**, *I*, • List, 1. List, Link, Preview |
| 14 | `drie` | Type `Please check:` then a bulleted list, make one word bold, press Preview | The preview shows the list with the bold word. Send it |
| 15 | the grant’s owner | Open Funds & Grants | The red row shows the remark with its list and bold, and “Open and fix” |
| 16 | `drie` | Return another record with the text `<script>alert(1)</script>` | It shows as plain text, nothing runs |
| **Who sees what after a return (Q6.3, Q6.4)** | | | |
| 17 | `hodcse` | Funds & Grants → filter Returned | A grey row: “Returned to … by Dean of Research… on …”. **No** “Open and fix” |
| 18 | `hodcse` | Open that record | The title says “Returned to <name>”; no Return button for the returned record |
| 19 | the owner | Funds & Grants → Returned | A red row with “Open and fix” |
| **Edit history (Q8)** | | | |
| 20 | `verma` | Open an approved Consultancy record, change the revenue, “Save changes” | Saved, still approved |
| 21 | `hodcse`, `drie`, `iqac` | Open the same record | “Edit history (1)” is open and shows revenue old → new. PAN/Aadhaar changes (Faculty Profile) show “hidden” |
| **Checked / Return again (Q7)** | | | |
| 22 | `drie` | Return a grant. Then as the owner, fix one field and “Save changes” | — |
| 23 | `drie` | Dashboard | “Corrected after you returned them”: the row lists the fields changed, with “See changes” |
| 24 | `drie` | Press “Return again”, write a remark, send | The record is returned again and leaves the list |
| 25 | `drie` | Return another grant; the owner presses Save without changing anything | The row shows an amber “Resubmitted without changes” |
| 26 | `drie` | Press “Checked — no further action” | The row disappears |
| **Delete (Q9, Q10)** | | | |
| 27 | `verma` | Open your own **approved** record → Delete this record | A box asks for a reason; “Delete” stays disabled until 5+ characters. After deleting, the list says it was deleted |
| 28 | `verma` | Open a **draft** of yours → Delete | A box with no reason field |
| 29 | `iqac` | Open **anyone’s** record (draft, returned or approved) | “Delete this record” is shown. It always asks for a reason |
| 30 | `hodcse`, `drie` | Open someone’s record | No Delete button |
| 31 | `iqac` | Admin → Deleted records | The deleted records with who, when and the reason |
| 32 | `iqac` | Press Restore on one | “The record is back in its owner’s list”; the owner sees it again with its old status |
| **“Verified” leftovers (Q11)** | | | |
| 33 | `iqac` | Any module list | Status filters are only Draft, Approved, Returned. (The old “Verified/Submitted” records in your `darp` database only disappear after `npm run db:approve-pending -w @darp/api`, which I will run only when you say so) |
| **Profiles (Q6.1, Q6.2)** | | | |
| 34 | `hodcse` | Faculty Profile | Everyone in CSE is listed, including people who never saved a profile, marked “Not filled yet” (grey). No other department |
| 35 | `hodcse` | Choose the status “Not filled yet” | Only those people |
| 36 | `hodcse` | Press “Open my profile” (top right of the list, and on the dashboard) | Your own profile page with “Complete my details” |
| 37 | `hodcse` | Fill and save your profile | It appears in the list as “You”. It has no Return button |
| 38 | `dofa`, `iqac` | Faculty Profile | Everyone in every department. Open the HOD’s profile and Return it with a remark: it works |
| 39 | `verma` | Faculty Profile | Only your own |
| **MoUs (S8)** | | | |
| 40 | `hodme` | MoUs → add a draft MoU | — |
| 41 | `verma` (CSE) | MoUs | Only CSE’s MoUs; the ME one is not listed, and its address gives “not found” |
