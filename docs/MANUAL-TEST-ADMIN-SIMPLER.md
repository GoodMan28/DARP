# Manual test: simpler Administration page and the journal upload box (2026-10-31)

Sign in as `iqac@demo.bitmesra.ac.in` (password `DarpDemo!2026Pass`) → **Administration**.

## A. The page as a whole

| # | Do | Expected |
|---|---|---|
| A1 | Open Administration | Subtitle: “Everything IQAC looks after. Pick a tab: each one says what it is for.” Tabs, in this order: Accounts · Journal & patent data · Year ranges · Reports · Dropdown options · Deleted records · Activity log |
| A2 | Click each tab | One plain line under the tabs says what that tab is for, e.g. Year ranges: “Named spans of years, such as ‘NAAC Cycle 4: 2022 to 2024’…” |
| A3 | Dropdown options (was “Master lists”) | The dropdown names read as words, in A–Z order: “Agency categories (2)”, “Indexing types (5)”…, not `agencyCategories` |
| A4 | Activity log (was “Audit log”) | Same log as before, titled “Activity log” |

## B. Journal & patent data: the status table

| # | Do | Expected |
|---|---|---|
| B1 | Open the tab | First card: **What papers and patents are checked against**. One row each: Scopus, SCImago SJR, SCIE, ESCI, SSCI, AHCI, Impact Factor, Patents. Each row says what it gives, how it gets here, and its status |
| B2 | Read the status column | Scopus ✓ “November 2024 list · 30,293 journals”; SCImago ✓ “2025 edition · uploaded 8 Oct 2026”; the four Web of Science rows ⚠ “Not uploaded”; Impact Factor ⚠ “Not uploaded: Impact Factor shows NA”; Patents ✓ “Up to issue 43/2026…” (or “Reading new issues now…” just after a restart) |
| B3 | “Check now” on Scopus | After a few seconds: “The Scopus list was checked and is up to date.” |

## C. The upload box

| # | Do | Expected |
|---|---|---|
| C1 | Drag the four files from Downloads onto the dashed box together (or click it and select all four) | A table with one row per file. **This file is** is already filled in: SCIE, SSCI, AHCI, ESCI. Year 2026. Journals: SCIE 9,421 · SSCI 3,537 · AHCI 1,799 · ESCI 9,396. Status “Ready”. Button **Upload 4 files** |
| C2 | Also drop `scimagojr 2025.csv` | Recognised as “SCImago Journal Rank (quartiles)”, year **2025** (read from the file name), 32,193 journals |
| C3 | Drop the ESCI file a second time | That row says “Another file here is also ESCI 2026. Remove one of them.” and is not counted in the button. Press **Remove** on it |
| C4 | Drop any unrelated CSV (e.g. `placement.csv`) | “DARP cannot tell what this file is: it has no ISSN column…”. Not uploaded |
| C5 | Rename a copy of the SCIE file to `list.csv` and drop it | **This file is** shows “Choose…” and the status says so. Pick SCIE and it becomes Ready |
| C6 | Open the SCIE CSV in Excel, **Save As → Excel Workbook (.xlsx)**, and drop the .xlsx | Read exactly like the CSV: SCIE (if the name still says SCIE), 9,421 journals |
| C7 | Remove the extras so only the four Web of Science files remain → **Upload 4 files** | Each row goes “Saving … of … ISSNs…”, then “✓ 9,421 journals saved.” etc. Message: “4 files uploaded…”. The status table turns SCIE, SSCI, AHCI, ESCI green with today’s date |
| C8 | Upload the SCIE file again (same year) | Replaces the 2026 SCIE list, not added on top: **Uploaded files** still shows one SCIE 2026 row with the same ISSN count |
| C9 | Open **Uploaded files (n)** at the bottom → Remove on one row → confirm | That list goes back to “Not uploaded” (or to its previous year) in the status table |
| C10 | Open **Where do I get these files?** | Three short step lists: Web of Science (every 3 months), SCImago (once a year), Impact Factor from the library (once a year, after June) |
| C11 | After C7, run Part D of `MANUAL-TEST-DOIS.md` | Indexing shows e.g. “Scopus, SCIE” for A1 and “Scopus, SSCI, AHCI” for A4 |
