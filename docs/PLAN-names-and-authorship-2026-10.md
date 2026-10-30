# Plan: structured names and proof of authorship (2026-10-29)

## Decisions (user, 2026-10-29)

- **Names:** four fields. Prefix (Dr., Prof., Prof. (Dr.), Mr., Ms., Mrs., Er.), First name (required), Middle name and Last name (both optional: some Indian names have no surname). The display name is built from them.
- **Author check:** layered, never blocks submitting.
  1. **Confirmed:** the person's ORCID iD is on the paper.
  2. **Likely:** the name matches a listed author whose affiliation is BIT Mesra.
  3. **Name only:** the name matches, but the affiliation is unknown or elsewhere.
  4. **Needs checking:** no listed author matches, so the owner added their name by hand.

  Levels 3 and 4 need evidence (as now), and DRIE and IQAC see the level on the record.
- **ORCID:** typed by the faculty member, then checked against ORCID's free public record. The name must match, or the iD is not used. A BIT Mesra employment entry on the ORCID record is shown when present.

## Patents

The Patent Office Journal has no author IDs. A patent is **Likely** when the name matches an inventor whose address is BIT Mesra, **Name only** when it matches an inventor elsewhere, and **Needs checking** otherwise. The certificate is always required as evidence.

## Steps

1. **Shared helpers:** `packages/shared/src/names.ts` with `NAME_PREFIXES`, `NameParts`, `composeName` and `splitName`.
2. **Database:**
   - `users` gets `name_prefix`, `first_name`, `middle_name`, `last_name`, `orcid` and `orcid_check` (jsonb).
   - `users.name` stays as the composed display name, so every list and export keeps working.
   - Existing rows: `first_name = name` until IQAC edits them; the demo seed sets the parts.
3. **Accounts:** the IQAC account form gets the four fields. The create and update routes accept them and compose `name`.
4. **Matching** (`lookup/names.ts`):
   - `namesMatch(owner, author)` takes the four parts, or a plain name for old callers.
   - It handles “A. K. Verma”, “Verma A.K.”, “Verma, Anil Kumar”, “Anil Kumar Verma”, two-word surnames and single names.
   - Spelling variants are tolerated as before.
   - An ORCID “other name” also counts as the owner's name.
5. **Levels:**
   - `applyLookup` loads the owner's identity (parts and trusted ORCID) and works out `verification.authorship = { level, detail }`.
   - A namesake with a different ORCID iD is a reason to check.
   - The form's notes say the level after Fetch.
6. **ORCID:**
   - `GET /api/profile/identity`, `POST /api/profile/orcid` and `DELETE /api/profile/orcid`.
   - The check uses `pub.orcid.org/v3.0/{id}/person` and `/employments`, with no key.
   - The iD's checksum (ISO 7064 MOD 11-2) is checked before anything is fetched.
7. **Web:**
   - Profile: the Account card shows Prefix, First, Middle and Last, plus an “ORCID iD” box with the check result.
   - Record page: an “Authorship” line beside the points to check.
8. **Seed:** demo people get full names in parts (for example Dr. Anil Kumar Verma).
9. **Tests:** unit tests for name forms, the ORCID checksum and the levels; integration tests for ORCID-confirmed and namesake cases, with `fetch` stubbed and nothing sent to ORCID.
