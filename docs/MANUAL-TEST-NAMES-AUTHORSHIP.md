# Manual test: names in parts and proof of authorship (2026-10-29)

Plan: `docs/PLAN-names-and-authorship-2026-10.md`. Password for every demo account: `DarpDemo!2026Pass` (addresses end in `@demo.bitmesra.ac.in`).

## Names

| # | Sign in as | Steps | Expected |
|---|---|---|---|
| N1 | `iqac` | Administration → Accounts → Add account | Prefix (None, Dr., Prof., Prof. (Dr.), Mr., Ms., Mrs., Er.), First name (required), Middle name, Last name. No single “Full name” box |
| N2 | `iqac` | Edit Dr. Anil Kumar Verma | Prefix Dr., First Anil, Middle Kumar, Last Verma |
| N3 | `iqac` | Edit Dr Vandana Bhattacharjee (an older account) | The form offers the split: Dr., Vandana, (blank), Bhattacharjee. Save it, and the list shows “Dr. Vandana Bhattacharjee” |
| N4 | `iqac` | Add an account with First name only, e.g. `Ramanathan`, no last name | Saved. The list shows “Ramanathan” |
| N5 | `iqac` | Add an account with an empty first name, or a name with digits | Refused next to the field |
| N6 | `verma` | My profile → Account | Prefix, First name, Middle name and Last name shown separately. The name cannot be edited here (IQAC sets it) |

## Matching the forms a name is published in

Publications → Add record → `10.1016/j.future.2024.05.005` → Fetch details. Then put each of these in the authors box and press Save and submit (with a PDF attached). The “Your name must be in the author list” error should be gone for every one of them:
`A. K. Verma`, `Verma A.K.`, `Verma AK`, `Verma, Anil Kumar`, `Anil Kumar Verma`, `ANIL KUMAR VERMA`.
With `A. P. Verma` or `Sunil Verma` it must still say your name is missing (a different person).

## ORCID iD

| # | Sign in as | Steps | Expected |
|---|---|---|---|
| O1 | `verma` | My profile → ORCID iD → `0000-0002-1825-0098` → Save | “An ORCID iD is 16 characters … its last character is a check digit” (wrong check digit; ORCID is not asked) |
| O2 | `verma` | Type `https://orcid.org/0000-0002-1825-0097` → Save (ORCID’s own example record) | Saved. “Name on ORCID: Josiah Carberry. It does not match your account name, so the iD is not used.” and “BIT Mesra is not listed as your employer” |
| O3 | `mahato` | Type the same iD | Refused: “Another DARP account already uses this ORCID iD” |
| O4 | `verma` | Remove | The box is empty again |
| O5 | you | With **your own** ORCID iD: ask IQAC to set a demo account’s name to yours, sign in, save your iD | “It matches your account name, so the iD is used to confirm authorship”. Then fetch the DOI of one of your papers that lists your ORCID iD: the notes say “Authorship confirmed: your ORCID iD … is on the published record”, and the “name must be in the author list” rule no longer applies |

## Authorship level on a record

| # | Steps | Expected on the record page (right-hand side, “Authorship”) |
|---|---|---|
| L1 | Save a paper with your ORCID iD on it (O5) | **Confirmed by ORCID** (green) |
| L2 | Save a paper whose author list has your name with BIT Mesra as affiliation | **Likely: name and BIT Mesra** (blue) |
| L3 | Save `10.1016/j.future.2024.05.005` after adding `A. K. Verma` to the authors | **Needs checking** (red): “No listed author has Dr. Anil Kumar Verma's name: it was added by hand” |
| L4 | Patents: an inventor with your name and a BIT Mesra address in the Patent Office Journal | **Likely: name and BIT Mesra** |
| L5 | Any of the above | Submitting is never blocked by the level; evidence is still required where it was before |
