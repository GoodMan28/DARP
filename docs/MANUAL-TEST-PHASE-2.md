# Manual test: Phase 2, year types and year ranges (2026-10-29)

Password for every demo account: `DarpDemo!2026Pass` (addresses end in `@demo.bitmesra.ac.in`).

Before you start, run the year backfill once on your database (it re-dates patents and fills the three year types for old records):
`npm run db:backfill-years -w @darp/api -- --dry-run` (counts only), then `npm run db:backfill-years -w @darp/api`.

| # | Sign in as | Steps | Expected |
|---|---|---|---|
| 1 | `iqac` | Admin → **Year ranges** | The old “Cycle” tab is now “Year ranges”. A list of saved ranges with Default marked. No “entry opens” or “deadline” boxes |
| 2 | `iqac` | Add a range: name `Test 2019 to 2020`, first year 2019, last year 2020 → Save | It appears in the list |
| 3 | `iqac` | Press “Make default” on it | It shows “Default”; the old one loses the mark |
| 4 | `verma` | My profile | A From and To pair of year boxes, and “Counting records dated between 2019 and 2020” |
| 5 | `verma` | Change From to 2022 | The two years stay in order (the range becomes 2020 to 2022), the address shows `?from=2020&to=2022`, and the in-period totals change |
| 6 | `verma` | Look at “since joining” totals while changing the years | They do **not** change; only the “in this period” figures do |
| 7 | `verma` | Funds & Grants, Publications, any module | Every record is listed, from every year. Changing the default range hid nothing |
| 8 | `iqac` | Delete the test range (confirm in the box) | Gone. No record changed. If you delete the default, the last three calendar years are used |
| 9 | `verma` | Patents → “Nothing to report” | A year picker beside it. Declare 2023, switch the picker to 2024: it shows 2024 as not declared |
| 10 | `verma` | Funds & Grants → add a grant with sanction date 12-02-2025 | Counted as FY 2024-25 (financial year starts in April) |
| 11 | any | Patents list | After the backfill, a patent is dated by its **publish/grant date**, not its filing date |
| 12 | `iqac` | Export a workbook | Works. Add `?from=2022&to=2024` to the address to limit it to those years |
| 13 | `hodcse` | Faculty Profile | Still lists everyone in CSE; unaffected by the range |
| 14 | `iqac` | Dashboard | No “data entry closes” banner any more |
