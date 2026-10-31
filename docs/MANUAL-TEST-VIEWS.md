# Manual test: filter, sort, group, fields and export on every module page

## Before you start

1. **Run the migration once** (for saved views only; everything else works without it):
   `npm run db:migrate -w @darp/api`. Until then the **Views** menu shows an error.
2. The password for every demo account is `DarpDemo!2026Pass`.
3. The Reports page is unchanged for every role. This is a separate tool on each module's own page.

**What it is:** above every module's list there is a toolbar: **Fields · Filter · Sort · Group · Export · Views**.
Search, the status chips and the year menu still work, and combine with it. The whole view is kept in the page
address, so a refresh, Back, a bookmark or a link to a colleague reopens it.

---

## Part 1: Filter

Sign in as **iqac** → **Fellowships & Travel Grants**.

| Test | What to do | What you should see |
|---|---|---|
| 1. The builder | **Filter** | "In this view, show records" and **Add condition** / **Add condition group**, as in the Airtable picture |
| 2. A number | Add condition: **Financial support (amount in INR)** · **>** · `1000000` → **Apply the filter** | The list shrinks. A sentence under the toolbar says "Where Financial support (amount in INR) > 1000000". The Filter button shows a **1** badge |
| 3. A choice | Add a condition: **Stature of fellowship** · **is any of** · tick **International** → Apply | Only international records |
| 4. and / or | Two conditions: the second row's "and" can be changed to **or** | "or" shows records matching either; "and" both |
| 5. A group | **Add condition group**: Where **Name of the national…** **contains** `INSA` or Where **Awarding Agency** **contains** `DST`, group set to **or**; plus an outer condition on amount | Reads like "Any of the following are true…", as in your picture |
| 6. Dates | A **Date of award** condition: **is before** a date, **is between** two dates, **is in the last** `365` **days** | Each works. A date box is a date picker |
| 7. Empty | **Valid until** is not a field to compare as empty, but **Validity (in years)** **is empty** works | Lifetime awards appear |
| 8. Worked out | **Valid until** · **is valid today** / **has expired** / **is for life** | The right awards |
| 9. Publications | Publications → conditions on **Indexing** (has any of SCIE, SSCI…), **Quartile (SJR)** (is any of Q1, Q2), **Impact Factor** (≥ 5), **JIF quartile** | Only papers whose journal matches, from the lists loaded in Administration |
| 10. Record facts | Conditions on **Entered by**, **Department**, **Status**, **Reporting year**, **Financial year**, **Last updated** | Work like the fields |
| 11. Stays in your own records | Sign in as **verma** → Fellowships, filter **Entered by** contains a colleague's name | No records: a filter never reaches records you may not see. A HOD sees only their department's |
| 12. Clear | **Clear** in the filter box, or **Reset the view** | Back to every record |
| 13. Not offered | Open the field list in a condition (Profile module as IQAC is a roster: no toolbar). In **Students Guided** or **Faculty Profile (as a faculty member)** | PAN, Aadhaar and masked contact details are not in any list |

## Part 2: Sort, Group, Fields

| Test | What to do | What you should see |
|---|---|---|
| 14. Sort | **Sort** → **Add a sort**: **Financial support** · **Z → A, high → low** → Apply | Biggest first; numbers sort as numbers (900,000 above 50,000), dates as dates |
| 15. Three sorts | Add a second and third sort | "then by" each in order. A fourth cannot be added |
| 16. Group | **Group** → **Department** → Apply | A heading row per department with its number of records, even when the list has several pages. Also by Status, Reporting year, Entered by, or a dropdown field |
| 17. Fields | **Fields** → tick extra fields (for example **Purpose of the grant**), untick others → Apply | The table shows exactly those columns. **Show the usual fields** puts them back |

## Part 3: Export

| Test | What to do | What you should see |
|---|---|---|
| 18. Excel | With a filter, sort and chosen fields open, **Export → Excel (.xlsx)** | `DARP-fellowships-<date>.xlsx` holding exactly the rows of the list **on every page**, in its order, with the chosen fields. First columns: S. No., Entered by, Department, Status, Year |
| 19. About sheet | Open the file's second sheet, **About this export** | The filter in words ("Where Financial support (amount in INR) > 1000000"), the number of records, who made it and when |
| 20. CSV | **Export → CSV** | Same rows. It opens in Excel with accents correct |
| 21. Dates and numbers | In the Excel file | Dates are real dates, amounts are numbers you can add up |
| 22. Safe cells | A record whose text starts with `=` | Shown as plain text, not run as a formula |
| 23. Limit | A module with more than 10,000 matching records | The panel and the About sheet say "the first 10,000" |
| 24. Logged | **iqac** → Administration → **Activity log** | An "export.generate" entry per export, with the module, the filter in words and the row count |

## Part 4: Views

| Test | What to do | What you should see |
|---|---|---|
| 25. Save | With a view open → **Views** → name it → **Save** | It appears in the list, marked "yours" |
| 26. Open | Reset the view, then **Views** → click its name | The view comes back |
| 27. Share (IQAC) | As **iqac**, tick **Share with everyone** → Save | Every other role that can open this module sees it, marked "shared by IQAC", and cannot delete it |
| 28. Delete | The bin icon on your own view (IQAC may delete a shared one) | It disappears |
| 29. Nothing to save | With no filter, sort, group or fields chosen | Save is disabled: "Set a filter, sort, grouping or fields first." |
| 30. Share a link | Copy the address of a filtered list, open it as another user in the same module | The same view, but only their own records, within their access |

## Notes

- **Sorting by worked-out columns** (Indexing, quartiles, Impact Factor, Valid until) is not offered: they are
  worked out from the journal lists, not stored. You can filter on them.
- **Faculty Profile as HOD or IQAC** is a roster of people (including those who have not filled it in), so it has
  no toolbar. Faculty see the toolbar on their own profile record.
- A condition left half-filled (no value yet) is ignored when you apply.
