# Manual test: researcher figures from the ORCID iD (Phase 8)

## Before you start

1. **Run the migration once**, in the DARP folder: `npm run db:migrate -w @darp/api`. DARP will not sign anyone in
   until you do.
2. The password for every demo account is `DarpDemo!2026Pass`.

**How it works now:** the faculty member types only their **ORCID iD**.
- **The IDs:** DARP reads the Scopus Author ID and Web of Science ResearcherID from the ORCID record ("Other IDs" on
  orcid.org). This happens only when the ORCID record is under the account's own name, so nobody can take a
  stranger's IDs.
- **The figures, compared side by side:**

  | Source | Found by | Status |
  |---|---|---|
  | Scopus | the Scopus Author ID | needs BIT's Elsevier key |
  | Web of Science | the ResearcherID | needs BIT's Clarivate key; until then the person types the figures with a screenshot |
  | OpenAlex | the ORCID iD itself | free, **works today** |

- **Where:** My profile shows publications, citations and h-index for each source. Reports → **Research quality**
  shows everyone's (IQAC, DRIE, and HODs for their department).

**A real record to try:** ORCID **0000-0002-2990-4738** (Animesh Ghosh, BIT Mesra) lists ResearcherID M-9975-2013
and Scopus Author ID 35449392500. A demo account will not match that name. To see the whole flow, ask IQAC to set a
test account's name to *Prof. Animesh Ghosh* (Administration → Accounts), or use your own ORCID iD on your own account.

---

## Part 1: from the ORCID iD

| Test | What to do | What you should see |
|---|---|---|
| 1. Nothing yet | Sign in as a faculty member without an ORCID iD → **My profile** | The **Research IDs and figures** card says: add your ORCID iD under Account and DARP reads your IDs from it. The table shows "Add your ORCID iD" under OpenAlex |
| 2. Someone else's ORCID iD | As **verma**, save ORCID `0000-0002-2990-4738` under Account | ORCID says the name does not match. The card says the record is not under your name, so no IDs or figures are read from it |
| 3. Your own | As the account named Animesh Ghosh, save ORCID `0000-0002-2990-4738` | The page reloads. Scopus Author ID **35449392500** and ResearcherID **M-9975-2013**, each marked **from your ORCID record** (not editable here) |
| 4. OpenAlex | Look at the table | OpenAlex column "fetched (today)": Publications **155**, Citations **3,271**, h-index **34** (as on 30 October 2026; these grow over time). "Citations without self-citations" is NA: OpenAlex does not give it |
| 5. The other columns | Same table | Scopus: "Not connected yet (Elsevier key)". Web of Science: "Type them below" |
| 6. Typed WoS figures | Open **Type your Web of Science figures**: Documents, Times cited without self-citations, h-index, As on, a screenshot → Save | The Web of Science column fills in, marked "typed (date)" |
| 7. Fetch now | Press **Fetch now** | "Fetched." The dates update |
| 8. Removing the ORCID iD | Account → ORCID → **Remove** | The page reloads; the two IDs that came from ORCID are gone too |
| 9. No ORCID? Type the IDs | Without ORCID, type a Scopus Author ID and ResearcherID → **Save typed IDs** | Saved, with "Not on your ORCID record: type it, or better, add it to ORCID under Other IDs" |
| 10. The label | Research profile at the bottom | With OpenAlex's 155 works there is enough data, so the label is no longer "Not enough data". Shares still use Scopus and WoS only |

## Part 2: Research quality (Reports)

| Test | What to do | What you should see |
|---|---|---|
| 11. Three sources | **iqac** → Reports → **Research quality** | Columns Publications, Citations and h-index, each as **S · W · O** (Scopus · Web of Science · OpenAlex). Sorted by h-index, highest first. A note says which keys are still missing |
| 12. Refresh one person | **Refresh now** on a row with an ORCID iD | That row's figures update |
| 13. HOD / DRIE / faculty | As **hodcse**, **drie**, **verma** | HOD: own department. DRIE: everyone. Faculty: no Research quality tab |

## Connecting Scopus and Web of Science (once BIT has the keys)

| Source | What BIT arranges | Add to `apps/api/.env.local`, then restart |
|---|---|---|
| Scopus | the library registers at dev.elsevier.com and gets an API key; an institutional token too if the server is off campus; for figures without self-citations, Elsevier enables "Citation Overview" for BIT | `ELSEVIER_API_KEY=…` and, if given, `ELSEVIER_INSTTOKEN=…` |
| Web of Science | a licence for Clarivate's **Web of Science Researcher API** (developer.clarivate.com) and its API key | `CLARIVATE_API_KEY=…` |

After the restart, **Fetch now** fills the Scopus and Web of Science columns from the IDs already read from ORCID.
A Scopus or WoS profile that turns out to belong to someone else stores nothing and names whose it is. (For WoS,
the profile counts as the person's own when it lists their ORCID iD or carries their name.) Once Clarivate is
connected, the "Type your Web of Science figures" box disappears. Every month each person is refreshed from all three
sources automatically.
