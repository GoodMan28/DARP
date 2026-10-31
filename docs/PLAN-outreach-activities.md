# Plan: Outreach Activities (faculty profile special requirement, 2026-10-30)

## The requirement

Faculty record eight kinds of academic service: PhD thesis reviews, invited talks, PhD viva voce, membership of a
Board of Studies / Academic Council / other academic body, question paper setting, journal paper reviews, industry
visits, and chairing or co-chairing a session. Every entry has a type, the name of the event, the organisation and
the year.

## Decisions

1. **One module, "Outreach Activities".** The type is a dropdown, and the form shows only the extra fields that type
   needs, using the same show-if mechanism as Patents and Students Guided. One module rather than eight because:
   - the eight types share most fields (event, organisation, year, evidence);
   - eight modules would mean eight sidebar entries and eight near-identical forms;
   - IQAC can still count or filter any one type.
2. **The types are a fixed list, not an IQAC-editable dropdown.** Each type's extra fields depend on its exact
   wording. "Other (specify)" covers anything else.
3. **"Do these all have to be outside the college?" No.**
   - An invited talk or an industry visit is outside BIT by nature.
   - A PhD viva, thesis review, BoS/AC seat, question-paper setting or session chair can be at BIT or elsewhere.
   - A required **"Where"** field (At BIT / Outside BIT) records which, defaulting in the help text to outside. Reports
     can then count only outside activities as outreach in the strict sense, or count all of them.
   - The organisation field is labelled "Name of the organisation", with BIT itself allowed.
4. **Year** (calendar year), as asked, with an optional date for anything with one day (a talk, a viva).
5. **Evidence** (invitation, appointment letter or certificate) is optional. The faculty member is trusted, as
   elsewhere.
6. **Counting:** "Outreach activities, {CY}" and "… since joining BIT", plus the same for outside-BIT only, appear in
   My numbers. The NAAC format files have no sheet for these, so they appear in the Full data report only, until
   IQAC adds a sheet to a format.

## Fields

| Field | Shown for | Notes |
|---|---|---|
| Type of activity | all | the eight types + Other (specify) |
| Specify the activity | Other | |
| Name of the event / programme | all except journal review and BoS/AC | e.g. the conference, the seminar series |
| Name of the journal | Journal paper review | |
| Publisher | Journal paper review | |
| Number of papers reviewed | Journal paper review | in that year, for that journal |
| Body | BoS / AC / other body | Board of Studies, Academic Council, Other academic body |
| Name of the body / programme | BoS / AC / other body | e.g. "BoS in Computer Science" |
| Member from (year) / to (year) | BoS / AC / other body | to may be blank (still a member) |
| Title of the talk | Invited talk | |
| Mode | Invited talk, Viva, Session chair | Online / In person |
| Role | Thesis review, Viva | External examiner / Internal examiner |
| Role | Session chair | Chair / Co-chair |
| Name of the candidate's degree programme | Thesis review, Viva | e.g. PhD in Mechanical Engineering. No candidate names (privacy) |
| Course / paper | Question paper setter | |
| Examination | Question paper setter | e.g. B.Tech end-semester, 2025 |
| Purpose of the visit | Industry visit | |
| Name of the organisation | all | university, journal's society, company… |
| Where | all | At BIT / Outside BIT |
| Year | all | calendar year, not in the future |
| Date | all, optional | |
| Evidence | all, optional | letter, invitation or certificate, PDF/JPG/PNG up to 2 MB |

Duplicate guard: type + event or journal + organisation + year.

## Steps

1. `packages/shared/src/modules/outreach.ts`, added to `MODULE_LIST` (25 modules; group Faculty, CY; owners: every
   faculty member; DoFA verifies; HOD/DoFA/IQAC view).
2. Counters: `outreach.count` and `outreach.count.outside`, each for the range and since joining (4 more; 67 in all).
3. Tests: module-count tests (24 → 25), counter totals, and one integration test (each type saves with only its own
   fields; Other needs the specification; a field of another type is not stored).
4. Manual test sheet: `docs/MANUAL-TEST-OUTREACH.md`.
