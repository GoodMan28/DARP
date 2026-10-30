# Patent test numbers (Phase 4)

## Before you start

1. Sign in as **verma**. The password is `DarpDemo!2026Pass`.
2. Go to **Patents → Add record**.
3. For each test below, type the number in the patent number box and press **Fetch details**.

**You will always see "your name must be in the inventor list".** That is normal: Verma did not invent these
patents. To save one, add your own name to the inventors and attach any small PDF.

---

## How a patent moves, and what DARP can find

| Stage | What it means | Can DARP fetch it? |
|---|---|---|
| **Applied** | The patent was filed at the Patent Office | **No.** Typed by hand |
| **Published** | The Patent Office Journal printed the application, usually about 18 months after filing | **Yes** |
| **Granted** | The Journal printed the grant, with a patent number such as 586509 | **Yes** |

**Why "Applied" is never found:** under Indian patent law, a new application is kept secret for 18 months.
It is printed only when that time is up, or earlier if the applicant asks for early publication. Until then it
is in no public place, so DARP has nothing to read.

So, for an Applied patent:
1. Choose status **Applied**.
2. Type the details from the **filing receipt**: number, title, inventors and filing date.
3. Attach the receipt.

DARP checks the Journal every night. Once the application is printed there, the record moves to **Published** by
itself, and later to **Granted**. You do not need to edit it again.

---

## Part 1: numbers that are found

| Test | Type this | What you should see |
|---|---|---|
| 1. A published patent | `202531089595` | Status **Published**. Filed 19-09-2025, published 26-09-2025. Patent number **NA**, because it is not granted yet. 10 inventors, Dr. Manoj Kumar Dutta first |
| 2. A granted patent, typed by its **patent number** | `599883` | Status **Granted**. DARP saves the **application number** (202331060280) and fills in the patent number 599883 itself. Granted 28-08-2026 |
| 3. A granted patent, typed by its **application number** | `202231054120` | Status **Granted**. Patent number **586509** is filled in. Granted 10-04-2026 |
| 4. An old patent from 2013 | `935/KOL/2013` | Status **Granted**, patent number 436472. **The inventor box is empty**, because DARP reads Journals only from 2019 and this application was printed in 2014. Type the inventors yourself |
| 5. The Journal printed no inventors | `202517134306` | Inventors Pascal Thubert, Carlos Pignataro, Ayan Banerjee, with a note that they were taken from the applicant list |

## Part 2: numbers that are not found or not accepted

| Test | Type this | What you should see |
|---|---|---|
| 6. Not in the Journal | `202499999999` | "No published record found". You fill in everything by hand |
| 7. An Applied patent | `202631000123` (made up). Choose **Applied**, fill in the rest, **Save** | Saves. Patent number shows **NA** |
| 8. A filing receipt number | `TEMP/E-1/12345/2026-KOL`, fill in the rest, **Save** | Not saved: "A TEMP/E-1 number is only a filing receipt…" |
| 9. A wrong number | `12AB`, fill in the rest, **Save** | Not saved: DARP shows the three correct number formats |

## Part 3: rules that protect the data

| Test | What to do | What you should see |
|---|---|---|
| 10. No duplicates | Save test 2, then add `202331060280` again | Not saved: this patent is already recorded |
| 11. Patents update themselves | Delete test 3 if you saved it. Add `202231054120` **without pressing Fetch**: status **Published**, filed 21-09-2022, published 23-09-2022, your name as inventor, any PDF, then **Save**. Then sign in as **iqac** → Administration → **Journal & patent data** → in the Patents row press **Check now** | Within a minute or two the patent becomes **Granted**, with patent number 586509. Verma's Dashboard shows "Updated automatically". The record's edit history says "Updated automatically from the Patent Office Journal" |
| 12. Your own change wins | Change a Published patent's status by hand, then press **Check now** again | DARP does not undo your change |

---

## One known problem

`202441079295` comes from **BITS Pilani's** Hyderabad campus. The Journal wrote its address as "Birla Institute of
Technology, Hyderabad Campus", so DARP mistook it for BIT Mesra.

- **Fixed:** for every Journal issue DARP reads from now on.
- **Not fixed yet:** patents DARP has already read keep the mistake until the old Journals are read again, which
  takes a few hours.
- **What you will see:** this number still shows three inventors "at a BIT Mesra address" for now.
