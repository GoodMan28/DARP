# Manual test: award validity (Phase 5)

## Before you start

1. Sign in as **verma**. The password is `DarpDemo!2026Pass`.
2. The four modules this covers are **Awards & Recognition**, **Research & Innovation Awards**, **Awards for
   Extension Activities** and **Fellowships & Travel Grants**. Every test works the same way in all four.

**What changed:** each award now has a **Validity (in years)**: any number, such as 1, 2, 5 or 1.5. If the award
never expires, tick **Valid for life** instead, and the years box goes away. DARP works out the last valid day
itself: the date of award plus the years, less one day.

The awards already in your database were saved before validity existed, so for now they say "Validity not
given". DARP does not guess one. The owner picks it the next time they edit the record.

---

## Part 1: the form

| Test | What to do | What you should see |
|---|---|---|
| 1. Validity is asked for | Awards & Recognition → **Add record** | A **Validity (in years)** box next to Date of award, and a **Valid for life** checkbox under it |
| 2. The end date is worked out as you type | Date of award `15-03-2024`, Validity `2` | Under the box: "Valid until: 14-03-2026 (expired)" |
| 3. Any number of years | Validity `5` | "Valid until: 14-03-2029" |
| 4. Half years | Validity `1.5` | "Valid until: 14-09-2025 (expired)" |
| 5. Still valid | Change the date to `01-01-2026`, Validity `1` | "Valid until: 31-12-2026" |
| 6. For life | Tick **Valid for life** | The years box disappears. Under the checkbox: "Valid until: Lifetime". Untick it and the years box comes back |
| 7. Text is refused | Validity `3 years`, press **Save and submit** | Not saved: the box asks for a number |
| 8. Required | Leave Validity empty and **Valid for life** unticked, press **Save and submit** | Not saved: Validity (in years) is required |
| 9. A draft may wait | Same as test 8, but press **Save as draft** | Saves as a draft |

## Part 2: the list and the record page

| Test | What to do | What you should see |
|---|---|---|
| 10. New column | Save test 5 with **Save and submit**, then go back to the list | A **Valid until** column showing 31-12-2026 |
| 11. Expired and old records | Look at the other rows | An expired award shows its date plus "(expired)" in grey. The old demo awards show "Validity not given" in grey |
| 12. Record page | Open the record from test 10 | Under Validity (in years): "Valid until: 31-12-2026" |
| 13. An old award asks for it on edit | Open an old award ("Validity not given") → **Edit** → **Save** with the years box empty | Not saved: Validity (in years) is required. Type a number (or tick Valid for life) and it saves. The list now shows its end date |
| 14. For life in the list | Save an award with **Valid for life** ticked | The list shows "Lifetime" |

## Part 3: My numbers

| Test | What to do | What you should see |
|---|---|---|
| 15. Valid today | Dashboard → **Show my numbers** | Each of the four modules has a row such as "Awards still valid today", with one number across both columns and "on 30/10/2026, whatever the year" under it |
| 16. It counts | After tests 10 and 14, look again | "Awards still valid today" is 2. "Awards … since joining" also goes up by 2 |
| 17. Years don't matter | Change **From/To** to other years | The "still valid today" numbers stay the same. The other rows change |
| 18. Old records still count | Look at "Awards from state/national/international agencies" | The old demo awards still count under their year, even without a validity |

## Part 4: the workbook

| Test | What to do | What you should see |
|---|---|---|
| 19. Export | Sign in as **iqac** → Administration → **Download workbooks** → Faculty workbook → open the **Awards** sheet | Three new columns: **Validity (years)**, **Valid for life** (Yes/No) and **Valid until**. The DoFA and DRIE workbooks have them too, on their award and fellowship sheets |
