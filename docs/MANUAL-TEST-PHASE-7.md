# Manual test: reports in IQAC's own formats, from every level (Phase 7)

## Before you start

- No migration or setup is needed.
- The password for every demo account is `DarpDemo!2026Pass`. Addresses end in `@demo.bitmesra.ac.in`.
- Reports hold **approved records only**. Drafts are never in a report.

**What it does:** a **Reports** page in the sidebar, for **everyone**. For IQAC it is also the **Reports** tab
of Administration. You choose four things:
1. **What:**
   - **IQAC formats:** your own six Excel files, filled in: Faculty format, DRIE, DoFA, DUGS/DPGS, HODs and
     CDC one-time formats.
   - **Full data:** every field, one sheet per module.
   - NIRF and NBA are greyed out until their format files are provided.
2. **Which years:** from year, to year, and the year type ("As each sheet needs", or one type for every sheet).
3. **Which departments.**
4. A **preview** of the rows per sheet, then **Download Excel**.

**Who gets what:**

| Signed in as | Formats offered | Whose records |
|---|---|---|
| a faculty member (**verma**) | Faculty format | their own |
| a head of department (**hodcse**) | HODs format, Faculty format | their department's |
| **drie** | DRIE one-time format, Faculty format (only DRIE's sheets: publications, patents, books, grants, consultancy, fellowships, seed money, research awards) | everyone's |
| **dofa** | DoFA one-time format, Faculty format (Profile form and DoFA's sheets: students guided, awards, financial support, FDPs, QS contacts) | everyone's |
| **dugs** | DUGS/DPGS one-time format, Faculty format (mentorship, e-content) | everyone's |
| **cdc** | College Dev Council one-time format | everyone's |
| **iqac** | all six | everyone's, or the departments ticked |

---

## Part 1: "last year" in the declared figures

| Test | What to do | What you should see |
|---|---|---|
| 1. The right year | Sign in as **verma** → My profile → **Figures you declare** | The labels say **last year (AY 2025-26)** and **last year (CY 2025)**, no longer AY 2026-27 / CY 2026. Your saved year range ends in 2026, but AY 2026-27 and CY 2026 have not ended yet, so "last year" is the last one that has |
| 2. Saved for that year | Type 3 in "National seminars attended last year (AY 2025-26)" → **Save**. Then sign in as **iqac** → Administration → Year ranges → make "NAAC Cycle 4 · 2022–2024" the default. Back as **verma** | The label now says **AY 2024-25** and shows **0**: the 3 you typed belongs to AY 2025-26, not to another year. Put the default range back to 2024–2026 and the 3 is there again |

## Part 2: your own format files

| Test | What to do | What you should see |
|---|---|---|
| 3. Your layout | **iqac** → Reports → IQAC formats → **Faculty format** → years 2023 to 2025 → **Download Excel** | The file looks like `Faculty format.xlsx`: same sheets, titles, colours, merged cells and dropdowns, filled with the records |
| 4. The years follow the report | In the file, look at the headings | "(data for 2024, 2023, 2022)" now reads **(data for 2025, 2024, 2023)**; "FY 2022-23 to 2024-25" reads **FY 2023-24 to 2025-26**; "Seed money Received - 2022 onwards" reads **2023 onwards** |
| 5. The Profile form | Sheet **Profile** | Column A as in your file. **Each faculty member has a column** (B, C, D…): name, masked PAN and Aadhaar, the profile answers, then every count row filled from their records for 2023–2025, and the figures they declared. "Last year" rows say AY 2025-26 / CY 2025 |
| 6. Two tables on one sheet | Sheet **Consultancy** | The consultancy rows fill the first table. Rows were inserted as needed, so the **Revenue generated from corporate training** table moved down intact below them |
| 7. Columns DARP adds | Sheets **Awards**, **Fellowship**, **Patents**, **Publications** | To the right of each table: Validity (years), Valid for life (Yes/No), Valid until (awards and fellowships); the published and granted dates and patent number (patents); Quartile (SJR), Impact Factor and JIF quartile (publications) |
| 8. About sheet | Last sheet | Years in each type, year type, departments, rows written, who made it and when |
| 9. HODs format | IQAC formats → **HODs format** → Download | **Student Workshops**: table A filled; table B's four totals in column I beside their questions. **Feedback**: **Yes** under the department's classification, No under the others, the links below. **EDP-MDP**: one column per financial year, headed "2023-24", "2024-25"…, with the earnings in words |
| 10. Speed | Any download | A few seconds at most |

## Part 3: every level

| Test | What to do | What you should see |
|---|---|---|
| 11. Faculty | Sign in as **verma** → **Reports** (now in the sidebar) | "Download your own records…". Workbook list: **Faculty format** only. Step 3 says **Your own records only**. The file has only Verma's records, and the Profile sheet has one column: his |
| 12. HOD | **hodcse** → Reports | Workbooks: **HODs format** first, then **Faculty format**. The Faculty format holds every CSE faculty member: one Profile column each, and their rows in every sheet |
| 13. DRIE | **drie** → Reports → **Faculty format** | Only DRIE's sheets (Seed money, Research awards, Patents, Publications, Books, Consultancy, Fellowship, Funds & Grants), for every faculty member. No Profile, Awards or FDPs sheets |
| 14. DoFA | **dofa** → Reports → **Faculty format** | The **Profile** form plus DoFA's sheets (Students guided, Awards, Extension awards, Financial support, FDPs, QS contacts), for every faculty member. No Publications or Patents |
| 15. Not someone else's file | As **drie**, look at the Workbook list | No DoFA, DUGS, HODs or CDC format |
| 16. PAN and Aadhaar | As **iqac**, tick **Include full PAN and Aadhaar numbers** and give a reason | The Profile form shows full numbers. Nobody else has this box |

## Part 4: Full data (unchanged)

| Test | What to do | What you should see |
|---|---|---|
| 17. Full data | Any level → **Full data** → Download | One sheet per module you look after, every field by its form label, with Name, Department and Year. Faculty get their own records only |

## For IQAC: installing a newer format file

If IQAC changes a format, put the new file in place with:

```
npm run templates:install -w @darp/api -- "C:\path\to\Faculty format.xlsx" faculty
```

The keys are `faculty`, `drie`, `dofa`, `dugs`, `hod` and `cdc`. The command copies the file into
`apps/api/templates/`. It changes one thing: dropdowns that cover a whole column are cut to row 2,000.
Your files' dropdowns ran to row 1,048,576, which made every download take about a minute.
