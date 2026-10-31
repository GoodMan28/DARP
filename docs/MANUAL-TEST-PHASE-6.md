# Manual test: adding many records at once (Phase 6)

## Before you start

1. The migration is already applied (`npm run db:migrate -w @darp/api`, which you ran).
2. Sign in as **verma**. The password is `DarpDemo!2026Pass`.
3. The test files are in `docs/test-files/`.

**What it does:** in **Publications**, **Books, Chapters & Conference Papers** and **Patents** there is now an
**Add many at once** button. You upload a file of DOIs, ISBNs or patent numbers. DARP fetches each one, the same
way "Fetch details" does, about one a second.

**Every line becomes a draft** except one you have already added. The faculty member is trusted: when the check
finds something, the draft is still made, and the finding is shown beside it:
- not found;
- your name is not on it;
- the register could not be reached;
- it belongs in another module. Its draft is then made in that module.

You can attach evidence on any draft, or click its title to open it and complete it.
**Save and return to the upload** brings you back. Then tick the ones you want to add and press
**Submit selected**.

**Which numbers are real:** the papers, chapters and patents in the test files are real. Each has an author or
inventor named **Anil Kumar Verma**, so they match the `verma` demo account. These Anil Kumar Vermas are at
other institutes, so every draft also shows the point "listed with another institution, not BIT Mesra". That is
correct.

---

## Part 1: Publications

| Test | What to do | What you should see |
|---|---|---|
| 1. The button | Publications | Next to **Add record**, a button **Add many at once** |
| 2. The page | Press it | "Step 1: choose your file", a dashed box to drop a file on, **Download a sample file**, and "What happens next" in four steps |
| 3. Upload | Drop `bulk-publications.txt` on the box | A progress bar ("2 of 6 checked…"), then **Checked 6**. The file has 7 DOI lines, but one is the first paper again in capitals, so it is counted once |
| 4. The summary | Look above the table | **3 drafts made · 1 not found · 1 belongs in another module · 1 your name is not on it** |
| 5. Every row has a draft | Look down the table | All 6 rows have a tick box, a title link and **Choose file** |
| 6. Found and yours | The first three rows | **Draft made**, with the paper's title: "Bioaugmentation…", "Innovations in CAZyme…", "Exploring the potential of microalgae…" |
| 7. Not yours | `10.1016/j.future.2024.05.005` | **Your name is not on it**, with the title "Robustness evaluation of large-scale…" and "Open the draft, add your name to the authors and attach evidence" |
| 8. Not found | `10.1016/j.future.2099.999999` | **Not found**, with the link "Open the draft to fill it in" |
| 9. Wrong module | `10.1109/cvpr.2016.90` | **Belongs in another module**: "This DOI is a conference paper… The draft was made under Books, Chapters & Conference Papers." The title is "Deep Residual Learning for Image Recognition" |
| 10. Open and come back | Click the title in the "Your name is not on it" row | The draft opens, filled in from the publisher. At the top: **Back to the upload**. At the bottom: **Save and return to the upload** (main button), **Save and submit**, and **Cancel** |
| 11. Complete it | In the authors, add `A. K. Verma`. Press **Save and return to the upload** | You are back on the same upload table. That row is still a draft, now with your name in it |
| 12. The other module | Click the title in the "Belongs in another module" row | It opens under **Books, Chapters & Conference Papers** (see the breadcrumb). **Save and return to the upload** brings you back to the Publications upload |
| 13. Not found, by hand | Click "Open the draft to fill it in" (row 5). Type a title, journal, year and authors (with your name). **Save and return to the upload** | Back on the upload. The row now shows your title |
| 14. Evidence | On the first row, **Choose file** and pick any PDF | "Evidence attached." The row is ticked for you |
| 15. One refused, one through | Also tick the **second** row (no evidence), press **Submit selected (2)** | Row 1 turns **Approved**: "Submitted and approved." Row 2: "Not submitted: Evidence … is required. Open it to finish". The other rows are untouched |
| 16. Any row can be submitted | Attach a PDF to the row from test 11, tick it, **Submit selected** | **Approved** |
| 17. Your name still needed | Tick a "Your name is not on it" draft where you did not add your name, with evidence, **Submit selected** | "Not submitted: Your name (Dr. Anil Kumar Verma) must be in the author list…". Open it, add the name, and it goes through |
| 18. Nothing is lost | Reload the page | The same table comes back: the address keeps the upload |
| 19. Drafts stay | Publications list, and Books, Chapters & Conference Papers list | The drafts you did not submit are there as **Draft**. The conference paper's draft is in the Books list |
| 20. Already added | **Upload another file**, drop `bulk-publications.txt` again | Every row now says **Already added**, with a link to the record. These have no tick box and no evidence box |
| 21. Excel | Upload `bulk-publications.xlsx` | Read like the text file: the three papers, all **Already added**. Row 2 of the sheet holds its DOI only in a link, and is still found |
| 22. Your last uploads | **Upload another file** | Under the drop box, "Your last uploads" lists your files. Click one to reopen it |

## Part 2: Books, Chapters & Conference Papers

| Test | What to do | What you should see |
|---|---|---|
| 23. CSV with titles | Books… → **Add many at once** → `bulk-books.csv` | The title column is ignored. Two **drafts made**: "Potential of Genetic Engineering Methods for Enhanced Biofuel Production" and "Biomass, Bioenergy, and Biofuels" (both Springer chapters) |
| 24. A journal article | `10.1016/j.btre.2020.e00525` | If you did test 20, **Already added** (it is in your Publications). Otherwise, **Belongs in another module**, with its draft made under Publications |
| 25. An ISBN | `9780262035613` (Deep Learning, MIT Press) | **Your name is not on it**, with a draft "Deep Learning" to complete |

## Part 3: Patents

| Test | What to do | What you should see |
|---|---|---|
| 26. Patent numbers | Patents → **Add many at once** → `bulk-patents.txt` | 4 checked (the repeated number counts once). Two **drafts made**: "A SYSTEM AND METHOD FOR AI-DRIVEN INTERVIEW SIMULATION…" and "HIGH STRENGTH ANNEALED STEEL…" |
| 27. A granted patent | `599883` | **Already added**, if you saved test 2 of the patent test sheet (application 202331060280). Otherwise **Your name is not on it**, with a draft |
| 28. Not in the Journal | `202431999999` | **Not found**, with a draft holding the number. Open it to choose the status (for example **Applied**) and type the details |

## Part 4: files that are refused

| Test | What to do | What you should see |
|---|---|---|
| 29. Too many | Upload `bulk-too-many.txt` | Refused straight away: "This file has 101 different numbers; at most 100 can be added at once. Split it into smaller files." |
| 30. Nothing in it | Upload any text file with no DOI | "No DOI was found in this file…" |
| 31. Wrong type | Upload a PDF | "Upload a .txt, .csv or .xlsx file." |
| 32. Not for every module | Open Awards & Recognition | No **Add many at once** button: only the three modules that fetch their details have it |

**Notes:**
- Text in the file that is not a number of the right kind is skipped without a message. That covers headings,
  titles, serial numbers, and numbers in the wrong format such as `TEMP/E-1/…` or `12AB`.
- A **preprint** DOI (for example arXiv) gets no draft. It has not been peer reviewed, so it cannot be entered
  in any module.
