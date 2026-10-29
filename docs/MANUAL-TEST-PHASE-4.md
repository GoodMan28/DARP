# Manual test: Phase 4, patent lifecycle and patent number (2026-10-29)

Password for every demo account: `DarpDemo!2026Pass` (addresses end in `@demo.bitmesra.ac.in`).

Before you start, rename the status on your database once (so the list reads Applied, Published, Granted and old “Awarded/Granted” patents become “Granted”):
`npm run db:patent-status -w @darp/api -- --dry-run`, then `npm run db:patent-status -w @darp/api`.

| # | Sign in as | Steps | Expected |
|---|---|---|---|
| 1 | `verma` | Patents → Add record. Look at “Status of Patent” | The choices are **Applied, Published, Granted** |
| 2 | `verma` | Type a patent number that is not in the journal (for example `202499999999`), press Fetch details | “No published record found”: fill in by hand |
| 3 | `verma` | Choose status **Applied** | A “Date filed (Applied)” box shows; published and granted dates are hidden |
| 4 | `verma` | Choose **Published** | A “Date published” box appears. Choose **Granted**: a “Date granted” box appears as well |
| 5 | `verma` | Fill an Applied patent (title, inventors with your name, filing date, evidence) and Save and submit | Saved and approved. “Date of Publish/Grant of patent” shows the filing date, worked out for you (it cannot be typed) |
| 6 | `verma` | Look at “Patent (grant) number” | It shows **NA** (greyed, not typed) until the patent is granted |
| 7 | `verma` | Patents list | Columns: title, application number, **patent number (NA when empty)**, status, date |
| 8 | `verma` | Type a **grant** (patent) number of an Indian patent already read by the portal, Fetch details | The **application** number is saved, not the grant number; the patent number and grant date fill in, status Granted |
| 9 | `verma` | Enter the same patent again using its application number | Refused as a duplicate: one patent is one record |
| 10 | `iqac` | Admin → Journal lists → Patent Office Journal → “Read new issues now” (or wait until 3 AM) | After the issues are read, saved Applied or Published patents move forward by themselves |
| 11 | `verma` | Dashboard, after step 10 | A card “Updated automatically (last 30 days)”, one line per patent, for example “Patent 202331085872 is now Granted (patent no. 512345)” |
| 12 | `verma` | Open that patent → Edit history | A line “Updated automatically from the Patent Office Journal” showing status, dates and patent number |
| 13 | `verma` | Look at the record’s status | Still **approved**. The journal never changes the approval, and never moves a patent backwards |
| 14 | `verma` | Change a patent’s status by hand, then let the journal run | The journal does not overwrite a status you changed |
| 15 | `iqac` | Export the Faculty or DRIE workbook | A “Patent Number” column, with **NA** where the patent is not granted yet |
