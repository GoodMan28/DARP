# Manual test: Outreach Activities

## Before you start

- If you have not yet run the Phase 8 migration, run it first: `npm run db:migrate -w @darp/api`. Outreach itself
  needs no migration.
- Sign in as **verma**. The password is `DarpDemo!2026Pass`.

**What it is:** one new module, **Outreach Activities**, under Faculty in the sidebar. Choose the type first and the
form shows only the fields that type needs. "Where" records whether it was at BIT or outside: not every kind is
outside (a viva or a BoS seat can be at BIT).

## Part 1: the form follows the type

| Test | What to do | What you should see |
|---|---|---|
| 1. The module | Sidebar → Faculty → **Outreach Activities** → **Add record** | Title "Add an outreach activities record". The **Type of activity** dropdown lists: PhD thesis review, Invited talk, PhD viva voce, Member of a Board of Studies / Academic Council / other academic body, Question paper setter, Journal paper review, Industry visit, Session chair / co-chair, Other (specify) |
| 2. Journal review | Choose **Journal paper review** | Name of the journal, Publisher, Number of papers reviewed. No event name |
| 3. BoS / AC | Choose the Board of Studies type | Body (Board of Studies / Academic Council / Other academic body), Name of the body, Member from / to (year) |
| 4. Invited talk | Choose **Invited talk** | Name of the event, Title of the talk, Mode (In person / Online) |
| 5. Thesis review / viva | Choose **PhD thesis review**, then **PhD viva voce** | Name of the event, Examiner role (External / Internal examiner), Degree programme of the candidate (no candidate name). The viva also asks the Mode |
| 6. Question paper | Choose **Question paper setter** | Name of the event (the examination) and Course / paper |
| 7. Industry visit | Choose **Industry visit** | Name of the event and Purpose of the visit |
| 8. Session chair | Choose **Session chair / co-chair** | Name of the event, Session role (Chair / Co-chair), Mode |
| 9. Other | Choose **Other (specify)** | "Specify the activity" appears and is required |
| 10. Always asked | Any type | Name of the organisation, **Where** (Outside BIT / At BIT), Year, an optional Date, and optional evidence |

## Part 2: saving and counting

| Test | What to do | What you should see |
|---|---|---|
| 11. Required per type | Journal paper review, organisation `IEEE`, Where Outside BIT, Year 2025, nothing else → **Save and submit** | Not saved: Name of the journal and Number of papers reviewed are required |
| 12. Saves | Fill them (IEEE Access, 6) → **Save and submit** | Approved, in the list with type, organisation, Where and year |
| 13. Changing type | Edit it, switch to Invited talk, then back to Journal paper review | Only the review's fields are kept when you save |
| 14. Colleagues | As **mahato**, add the same journal review for 2025 | Saves: two people may review for the same journal |
| 15. At BIT | As verma, add a **PhD viva voce** at BIT Mesra, Where **At BIT**, Year 2025 | Saves |
| 16. Counts | Dashboard → **Show my numbers**, years 2025–2025 | Under Outreach Activities: "Outreach activities…, 2025" = 2 and "Outreach activities outside BIT, 2025" = 1 |

## Part 3: reports

| Test | What to do | What you should see |
|---|---|---|
| 17. Faculty format | Reports → IQAC formats → **Faculty format**, years including 2025 → Download | A new sheet **Outreach** after your format's own sheets, with Name of the teacher, Type of activity, the type's fields, organisation, Where and year |
| 18. DoFA | Sign in as **dofa** → Reports → DoFA one-time format | The same **Outreach** sheet, for every faculty member |
| 19. Full data | Reports → Full data | An "Outreach Activities" sheet |
