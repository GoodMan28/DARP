# Plan: filter, sort, hide fields and export on every module page (2026-10-30)

## The requirement

On every module's list page (Publications, Patents, Awards… all 25), add an Airtable-style toolbar:
**Hide fields · Filter · Sort · Group · Export**. The filter is a builder of conditions ("Where *field*
*operator* *value*"), joined by *and* / *or*, with condition groups ("any of the following are true…"). Export
downloads exactly what the page shows.

**The Reports page stays exactly as it is, for every role.** This is a separate, lighter tool for looking at and
pulling out records from one module.

## What it looks like in DARP

```
 Publications                                                        [Add many at once] [Add record]
 ┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
 │ [⊘ Hide fields (2)] [≡ Filter (3)] [⇅ Sort] [▤ Group] [⤓ Export]        [🔍 search…] [status chips]│
 ├──────────────────────────────────────────────────────────────────────────────────────────────────┤
 │  In this view, show records                                                                      │
 │  Where  [Year of publication ▾] [is between ▾] [2022] and [2024]                         [🗑]     │
 │  and    ┌ Any of the following are true… ─────────────────────────────────────────── [+] [🗑] ┐   │
 │         │ Where [Indexing ▾]   [contains any of ▾] [SCIE ✕] [SSCI ✕]                  [🗑]    │   │
 │         │ or    [Quartile (SJR) ▾] [is any of ▾]   [Q1 ✕] [Q2 ✕]                      [🗑]    │   │
 │         └───────────────────────────────────────────────────────────────────────────────────┘   │
 │  and    [Department ▾] [is ▾] [Computer Science & Engg. ▾]                              [🗑]     │
 │  + Add condition    + Add condition group                                                         │
 └──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

It sits on top of what the page has today. Search, the status chips and the year menu stay and combine with the
filter (all must hold).

## What can be filtered, and how

**Columns offered:**
- every field of the module, by its form label;
- the record's own facts: **Entered by**, **Department**, **Status**, **Year** (in CY, FY or AY), **Last updated**;
- the worked-out columns: **Indexing**, **Quartile (SJR)**, **Impact Factor**, **JIF quartile**, **Valid until**,
  **Project period**.

**Never offered:** Aadhaar and PAN (encrypted), and fields hidden from the person (masked or "sensitive" for anyone
but the owner and IQAC). These are not filterable, sortable or exportable here, as on the list today.

**Operators, by kind of field:**

| Kind | Operators |
|---|---|
| Text, DOI, e-mail, link | contains · does not contain · is · is not · starts with · is empty · is not empty |
| Dropdown | is · is not · is any of · is none of · is empty · is not empty |
| Multi-choice | has any of · has all of · has none of · is empty |
| Number, amount | = · ≠ · < · ≤ · > · ≥ · is between · is empty |
| Date | is · is before · is after · is between · in the last N days · is empty |
| Year | is · is before · is after · is between |
| Tick box | is ticked · is not ticked |
| File | has a file · has no file |
| Indexing (worked out) | contains any of · contains none of (Scopus, SCIE, SSCI, AHCI, ESCI) |
| Quartile, JIF quartile | is any of (Q1–Q4, NA) |
| Impact Factor | ≥ · ≤ · is between · is NA |
| Valid until | is valid today · has expired · is lifetime · is before / after a date |

The value box follows the field:
- a dropdown field offers its own options (including IQAC's dropdown lists);
- Department lists the departments;
- Entered by searches people in the caller's scope;
- dates use a date picker.

**Structure:** top-level conditions plus condition groups, one level deep, exactly as in the screenshot. Each level
has its own *and* / *or*. At most 20 conditions in all.

## How it works underneath

1. **One filter description, shared by page and server.**
   - `packages/shared/src/views.ts` holds the types (`ViewState = { filter, sort[], hidden[], groupBy }`), the
     operator table above, and a zod check.
   - The whole view is kept in the page address (`?view=…`, compact and URL-safe). Reloading, the browser's Back
     button, a bookmark or a link sent to a colleague all reopen the same view.
2. **Filtering is done by the database, never in the browser**, so it works on 10,000 records as on 10, and paging
   still works. `server/records/viewFilter.ts` turns the description into SQL:
   - **Fields:** only keys the module's config declares are accepted. A made-up field name is refused, and a value
     is always passed as a parameter, never pasted into SQL.
   - **Numbers and dates:** compared as numbers and dates, guarded so a bad stored value is treated as empty
     rather than causing an error.
   - **Worked-out columns:**
     - Indexing, quartile and Impact Factor are matched through the journal tables by ISSN and year, the same way
       the list works them out today.
     - Validity is matched from the date and years.
3. **Always inside the person's own scope.** The filter is added to `scopeFilter()`, never instead of it. A faculty
   member filtering Publications still sees only their own papers, and a HOD only their department's.
4. **Sort:** up to three keys, on any field or worked-out column (today only a few columns can be sorted).
5. **Group:** by a dropdown field, Department, Status, Year or Entered by. The list shows a heading row per group
   with its count, collapsed or open; paging is by group.
6. **Hide fields:** a list of the module's columns to tick on or off, plus **Show all**. The first column stays.

## Export

**Export ▾** offers **Excel (.xlsx)** and **CSV**:
- **What:** exactly the rows matching the filter, search, status and year, in the current sort and grouping, with
  only the shown columns, across all pages (up to 10,000 rows).
- **The file:**
  - column headings are the form labels;
  - values appear as on the page (dates, amounts, "NA");
  - a second sheet, **About this export**, states the filter in words ("Year of publication is between 2022 and
    2024, and (Indexing contains SCIE or Quartile is Q1)"), who made it and when.
- **Rules:**
  - PAN and Aadhaar are never in it.
  - Every export goes into the Activity log with the module, the filter and the number of rows.
  - Statuses are what the page shows. The Reports page remains the place for the "approved only" official formats.

## Saving views (optional, see the decisions below)

**Save view** stores a named view per person per module, such as "My Q1/Q2 papers 2022–24", in a new
`saved_views` table. A **Views ▾** menu reopens one. IQAC could also save shared views that everyone with access to
the module sees.

## Steps

| # | Step | Where |
|---|---|---|
| 1 | View types, operators per field kind, validation, the "filter in words" sentence | `packages/shared/src/views.ts` |
| 2 | Filter → SQL, with every operator, the worked-out columns and the scope | `apps/api/src/server/records/viewFilter.ts` |
| 3 | `listRecords` takes the view: filter, multi-key sort, group counts; the route reads `?view=` | `records/service.ts`, `routes/modules/records.ts` |
| 4 | Export route: `GET /api/modules/:key/records/export?view=…&format=xlsx\|csv`, audited, rate-limited | `routes/modules/export.ts` |
| 5 | Toolbar and popovers: Hide fields, Filter builder (conditions, groups, and/or), Sort, Group, Export, all keyboard-usable | `apps/web/src/components/views/*` |
| 6 | Module list page: toolbar, URL state, grouped rows, filter count badge, "Clear filters" | `app/(app)/m/[moduleKey]/page.tsx` |
| 7 | (If chosen) saved views: migration, routes, Views menu | `saved_views` |
| 8 | Tests (below), manual test sheet `docs/MANUAL-TEST-VIEWS.md` | |

**Tests:**
- every operator on each kind of field;
- *and* / *or* and groups;
- a field name not in the config is refused, and an injection attempt in a value does nothing;
- scope still applies (a faculty member's filter never returns a colleague's record);
- PII never filterable or exported;
- the export holds exactly the listed rows and columns;
- the address round-trips the view;
- worked-out columns (Indexing contains SCIE, Quartile Q1, valid today).

## Decisions (taken 2026-10-30)

1. **Saved views:** named views per person, plus IQAC-shared views that everyone with access to the module sees.
   Step 7 is in.
2. **Group:** built now, with the rest.
3. **Export statuses:** what the page shows. The Reports page stays the approved-only official route.
4. **Row limit:** 10,000 per export.
