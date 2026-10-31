# Manual test: Phase 2 QA fixes (2026-10-29)

Plan: `docs/PLAN-p2-qa-fixes-2026-10.md`. Password for every demo account: `DarpDemo!2026Pass` (addresses end in `@demo.bitmesra.ac.in`).

| # | Sign in as | Steps | Expected |
|---|---|---|---|
| 1 | any | Look at the top bar and the page footer | No “NAAC Cycle 4 · 2022–2024” anywhere. The top bar shows only DARP, the breadcrumb and your name |
| 2 | `iqac` | Look at the sidebar, under Overview | An **Administration** link. The account menu (your name, top right) also has Administration |
| 3 | `verma` | Look at the sidebar and the account menu | No Administration link |
| 4 | `iqac` | Administration → **Year ranges** tab | The list of saved ranges, Default marked, and a form to add one. Add `Test 2019 to 2020` (2019, 2020) → Save; press Make default; then delete it (confirm in the box) |
| 5 | `verma` | Patents → bottom of the page, “Nothing to report in Patents for” | The year list runs from this year back ten years (2026 … 2017). The help text says what it is for |
| 6 | `verma` | Funds & Grants → the same box | The years read “FY 2026-27 … FY 2017-18”, because grants count by financial year |
| 7 | `verma` | Patents: tick the box for 2019 | “Declared for 2019” and “Declared so far: 2019”. Untick it again |
| 8 | `verma` | My profile | Only “My details” and “Figures you declare”. No From/To boxes, no computed tiles |
| 9 | `verma` | Overview (dashboard) → “My numbers” → **Show my numbers** | A table: one row per figure, with “In 2024–2026” (or the default range) and “Since joining” side by side, grouped by module. **Hide** closes it |
| 10 | `verma` | In My numbers, set From 2022 and To 2024 | The “In 2022–2024” column changes; “Since joining” does not. The line above explains: FY 2022-23 to 2024-25 runs 1 Apr 2022 – 31 Mar 2025 |
| 11 | `verma` | Look at a financial-year figure, e.g. “Research projects as PI” | Labels no longer say “FY 2022-25”; the range is written out as FY 2022-23 to 2024-25 |
| 12 | `verma` | My numbers → Patents | Three rows: **Patents filed**, **Patents published**, **Patents granted** |
| 13 | `verma` | Add a patent: status Granted, filed 05-05-2021, published 10-03-2023, granted 20-01-2025, evidence → Save. In My numbers choose 2023 to 2023 | Published counts it (2023); Filed and Granted do not. Choose 2021 to 2021: Filed counts it. Choose 2025 to 2025: Granted counts it |
| 14 | `iqac` | Export the Faculty or DRIE workbook | The Patents sheet has the columns Patent Filed Date, Patent Published Date and Patent Granted Date |
| 15 | `hodcse` | Overview | “My profile” card with “Open my profile”, and the “My numbers” card |
| 16 | `dofa` | Overview | “My modules” lists the faculty modules as well as DoFA’s own, and the “My numbers” card is there: every post is held by a professor |
| 17 | `iqac` (also `dofa`, `drie`, `dugs`, `cdc`) | My profile (account menu, top right) | An **Account** card with a professor’s name (e.g. Prof. K. Banerjee), department and joining date, then My details, Figures you declare and “Edit my details” |
| 17a | `dugs` | Patents | Only Prof. V. Narayan’s own patents (DUGS does not oversee patents). `drie` sees every patent, its own included, but has no Return button on its own |
| 17b | `hodcse` | Faculty Profile | The CSE roster now includes Prof. A. Chakraborty (DRIE) and Prof. K. Banerjee (IQAC), who teach in CSE |
| 18 | `verma` | My profile | The same Account card, then My details and Figures you declare, with “Edit my details” |
