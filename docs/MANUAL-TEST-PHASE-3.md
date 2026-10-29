# Manual test: Phase 3, journal rankings (2026-10-29)

Password for every demo account: `DarpDemo!2026Pass` (addresses end in `@demo.bitmesra.ac.in`).

Rankings are worked out from the journal's ISSN when they are needed. They are never stored on a paper.
The Web of Science lists (SCIE, SSCI, AHCI, ESCI) and the Impact Factor come from files IQAC uploads (Admin → Journal lists). Your database may not hold them yet; upload the four Master Journal List CSVs to see "SCIE" and so on. Without a JCR export, the Impact Factor shows **NA**.

| # | Sign in as | Steps | Expected |
|---|---|---|---|
| 1 | `iqac` | Admin → Journal lists | Cards for the automatic Scopus list, SJR, Web of Science lists, JCR (Impact Factor) and the Patent Office Journal, each with “Loaded lists” |
| 2 | `iqac` | Upload the four Web of Science CSVs (choose the list name SCIE, SSCI, AHCI or ESCI each time) | Each shows its journal count in “Loaded lists” |
| 3 | `iqac` | Upload a JCR export (Impact Factor) if you have one | A “JIF <year>” row with counts. Without one, skip |
| 4 | `iqac` | Remove a loaded list (Remove) | A clean confirmation box, not a browser alert. After removing, papers show the next newest list or NA |
| 5 | `verma` | Publications → Add record. Type an ISSN in the journal ISSN box, e.g. `0167-739X` | A card “Journal ranking (latest lists)”: Indexing, Quartile (SJR), Impact Factor (WoS), JIF quartile (WoS). Anything not found shows **NA** |
| 6 | `verma` | A journal that is in two indexes | Indexing shows **all**, e.g. “Scopus, SCIE”, not just one |
| 7 | `verma` | Change the paper's year in the form | The card follows: SJR is for that year; a journal Scopus did not cover that year shows NA |
| 8 | `verma` | Publications list | A column with the ranking summary (e.g. “Q1 SJR · IF 5.2”). Records carry no stored quartile, so it follows the lists as they are updated |
| 9 | `verma` | Open a saved paper | The same ranking card, using the **latest** lists loaded |
| 10 | `iqac` | Upload a newer list year (or remove one) and reload `verma`'s paper | The ranking changes with the lists. No record was edited |
| 11 | `verma` | My profile | New counters for papers in Scopus, in WoS and in Q1/Q2 journals, for the chosen years and since joining |
| 12 | `iqac` | Export the Faculty or DRIE workbook with publications | Columns for Indexing, Quartile (SJR), Impact Factor (WoS) and JIF quartile (WoS), filled when exported |
| 13 | `verma` | Publications → Add record, no ISSN | The ranking card shows NA, not an error |
