# Plan: Phase 2 QA fixes (2026-10-29)

From the manual test of Phase 2. Each point names the cause found in the code and the fix.

| QA | What was seen | Cause | Fix |
|---|---|---|---|
| 1 | Top bar still says “NAAC Cycle 4 · 2022–2024” | The top bar prints the name of the default year range, and the seeded range is still called that | Remove the range name from the top bar. Replace the remaining “this cycle” wording (module lists, tile notes, dashboard) with plain wording |
| 2 | Where are the filters to extract data, for every role? | Not built yet | Phase 7 (IQAC reports by year range in NAAC, NIRF and NBA formats, with filters). No change now |
| 3, 11 | “Nothing to report … for” offers only 2022, 2023, 2024; what is it for? | The years came from the default range | Offer the last ten years (plus any year already declared), named the way the module counts years: “2024” for calendar-year modules, “FY 2024-25” and “AY 2024-25” for the others. Reword the help text so the purpose is clear, and list the years already declared |
| 4, 5, 10 | Cannot find Admin → Year ranges | The Administration page has no link anywhere: it only opens by typing `/admin` | Add “Administration” to the sidebar and to the account menu, for IQAC (role admin) only |
| 6 | Range 2022–2024 shows “FY 2022-25” | A financial year is named by the year it starts, so 2022 to 2024 covers FY 2022-23, 2023-24 and 2024-25 (1 Apr 2022 to 31 Mar 2025). The label squeezed that into “FY 2022-25” | Labels say “FY 2022-23 to 2024-25” and “AY 2022-23 to 2024-25”. The year picker states the exact dates each year type covers |
| 7, 8 | The profile page is cluttered by the range and the computed tiles | Totals were shown as 57 tiles on the profile | The profile shows only the person’s details and the figures they declare. The dashboard gets a “My numbers” card with a “Show my numbers” button; it opens a compact table (one row per figure: in the chosen years, and since joining) with the From/To years inside. Analytics are designed in the last phase |
| 9, 12 | Works | — | — |
| 13 | A patent dated only by its latest stage is hard for IQAC to count | One date (the latest stage) decided the year | Count each stage by its own date: patents filed (date filed), published (date published, including those granted later) and granted (date granted). A patent filed in 2022, published in 2023 and granted in 2025 counts once in each of those years. The Faculty and DRIE workbooks get the filed, published and granted dates as columns |

## Steps

1. Shell: remove `cycleName` from the top bar; add the Administration link (sidebar and account menu) for role admin.
2. Wording: drop “this cycle” from tile notes, module list headings and dashboard text.
3. Nil declaration: `declarableYears()` returns the last ten years plus declared years; the schema payload carries the module’s year type; the picker labels FY and AY years in full.
4. Labels: `withCycleYears` writes `FY 2022-23 to 2024-25`; the range text lists the dates for CY, FY and AY.
5. Profile: remove the range filter, the computed totals and the “Where each number comes from” table.
6. Dashboard: a “My numbers” card (faculty and HOD). The button loads `/api/profile/rollups?from&to` and shows one row per figure.
7. Patents: a counter may name its own date field (`dateField`). New counter “Patents filed”; “published” counts every patent with a publication date; “granted” every patent with a grant date. Add export columns for the three dates.
8. Tests: unit tests for the counters by stage date, the FY label and the declarable years; update the Phase 2 manual test.
