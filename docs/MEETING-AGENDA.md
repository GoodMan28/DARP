# Meeting agenda: what was built this session (30 Oct 2026)

Demo accounts: `verma` (faculty), `hodcse` (HOD), `dofa`, `drie`, `iqac`. Password `DarpDemo!2026Pass`.
Test sheets for each item are in `docs/MANUAL-TEST-*.md`.

## 1. Demonstrate (about 15 minutes)

| # | Show | Who | Where |
|---|---|---|---|
| 1 | **Award validity**: any number of years, or "Valid for life"; "Valid until" in the list; "still valid today" count | faculty | Awards, Fellowships; Dashboard → My numbers |
| 2 | **Add many at once**: upload a file of DOIs, ISBNs or patent numbers; every line becomes a draft; add evidence; save and return; submit | faculty | Publications → Add many at once |
| 3 | **Reports in IQAC's own format files**: the six Excel formats filled in, with the years of your choice; each level downloads its own | iqac, hod, dofa | Reports |
| 4 | **Filter, sort, group, hide fields, export** on every module page; saved and shared views | iqac | any module list |
| 5 | **Research figures from the ORCID iD**: Scopus ID and ResearcherID read from ORCID; Scopus, Web of Science and OpenAlex side by side | faculty, iqac | My profile; Reports → Research quality |
| 6 | **Outreach Activities**: one form, eight types, fields change with the type | faculty | Faculty → Outreach Activities |
| 7 | **Simpler IQAC administration**: one box for the SCIE/SSCI/AHCI/ESCI lists | iqac | Administration → Journal & patent data |

## 2. Decisions needed from the department

| # | Decision | Why it matters |
|---|---|---|
| 1 | Does BIT have **Scopus** access (the library page lists ScienceDirect, not Scopus)? | Without it there is no Elsevier key |
| 2 | **Elsevier API key** (free with Scopus) and **Citation Overview** (figures without self-citations) | Faculty Scopus figures |
| 3 | **Clarivate**: free **Starter API** for Web of Science subscribers, or the paid **Researcher API** | Faculty Web of Science figures |
| 4 | **JCR**: the yearly CSV from the library, or the paid **Journals API** | Impact Factor and JIF quartile |
| 5 | The **NIRF** (2026 DCS report) and **NBA SAR** formats; the new **NAAC** templates | Those two report formats stay greyed out until then |
| 6 | Quality-label thresholds for "Research profile" (default 50% WoS and Q1/Q2) | Labels faculty as quality- or volume-leaning |
| 7 | The 160 demo records and old drafts in the dev database: clean up before real use? | Data scripts are waiting for a go-ahead |

The request to the library, with step-by-step instructions and costs, is `docs/REQUEST-API-KEYS.md`.
Neither Elsevier nor Clarivate publishes prices: quotes are needed.

## 3. Not yet done

- **Phase 9**, the page-by-page decluttering of the interface (sidebar, module list, form, record page, dashboard).
- Live Scopus and Web of Science figures (waiting for the keys). OpenAlex works now.
- The NIRF and NBA reports (waiting for the formats).

## 4. Before real use

- Run the new database migrations on the real database: `npm run db:migrate -w @darp/api` (already run on the dev one).
- Waiting for approval: `db:approve-pending`, `db:backfill-years`, `db:patent-status`.
- Put the API keys in `apps/api/.env.local` (`ELSEVIER_API_KEY`, `CLARIVATE_API_KEY`) when they arrive.
