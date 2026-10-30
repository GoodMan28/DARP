# Manual test: real DOIs and ISBNs for Fetch details and journal rankings (2026-10-29)

Every identifier below is real. Each was checked against Crossref, DataCite or Open Library, and then run through
the app’s own Fetch on 2026-10-29 as `verma`. “Expected” is what the app returned. Password for every demo
account: `DarpDemo!2026Pass` (addresses end in `@demo.bitmesra.ac.in`).

**Before you start**

- The demo faculty did not write these papers, so every fetch says “Your name (Dr. Anil Kumar Verma) must be in the
  author list”. That is correct. To save one, add `A. K. Verma` (any form works: `Verma A.K.`, `Anil Kumar Verma`) to the authors and attach any small PDF as evidence.
- Your database holds the Scopus list (with SJR quartiles) but **no Web of Science lists and no JCR yet**. So
  Indexing shows only “Scopus” and the Impact Factor shows **NA** until IQAC uploads them (Part C).

## Part A: Publications → Add record → paste the DOI → Fetch details

| # | DOI | Expected fill (locked fields) | Expected ranking card now |
|---|---|---|---|
| A1 | `10.1016/j.future.2024.05.005` | “Robustness evaluation of large-scale machine learning-based reduced order models for reproducing flow fields”; Future Generation Computer Systems; 2024; ISSN 0167-739X; vol 159; pp 243-254; 5 authors (Higashida … Tsubokura) | Indexing **Scopus**; Quartile (SJR) **Q1**; Impact Factor **NA**; JIF quartile **NA** |
| A2 | `10.1109/access.2024.3413674` | “Workflow for Creating Animated Digital Replicas of Historical Clothing”; IEEE Access; 2024; ISSN 2169-3536; vol 12; pp 83707-83718; 4 authors (Kubišta, Linhart, Sedláček, Ubik) | Scopus; **Q1**; NA; NA |
| A3 | `10.1016/j.respol.2024.104986` | “An identity perspective on the diffusion of user innovations in the household sector”; Research Policy; 2024; ISSN 0048-7333; vol 53, issue 4; 2 authors (Xin Yu, Jeroen P.J. de Jong) | Scopus; **Q1**; NA; NA |
| A4 | `10.1017/s000708742300016x` | “Van Leeuwenhoek – the film: remaking memory in Dutch science cinema 1925–c.1960”; The British Journal for the History of Science; 2023; ISSN 0007-0874; vol 56, issue 3; pp 329-349; 1 author (Mieneke te Hennepe) | Scopus; **Q1**; NA; NA |
| A5 | `10.1016/j.aime.2023.100135` | “A gear grinding allowance stochastic simulation model”; Advances in Industrial and Manufacturing Engineering; **2024** (the issue year, though the DOI says 2023); ISSN 2666-9129; vol 8 | Scopus; **Q1**; NA; NA |
| A6 | `10.1155/2023/7137889` | “Odd-Leg Birdcages for Geometric Decoupling in Multinuclear Imaging and Spectroscopy”; Concepts in Magnetic Resonance Part B; 2023; ISSN 1552-5031 | Scopus; **Q3**; NA; NA |
| A7 | `10.1155/2020/8828047` | “Capacitive versus Overlap Decoupling of Adjacent Radio Frequency Phased Array Coil Elements…”; same journal; **2020** | Indexing **NA**, Quartile **NA**. Scopus covered this journal 2002–2018 and again from 2021, **not in 2019–2020** |
| A8 | `10.5120/ijca2024923919` | “Block-level Cloud Tiering System for XFS”; International Journal of Computer Applications; 2024; ISSN 0975-8887; vol 186, issue 35; pp 19-23 | Everything **NA**: not in Scopus or any Web of Science list |

**Year check (Phase 3 step 7).** Open A6 and change the year to **2020**: the card turns to NA, as for A7. Change it to **2018**: Scopus and Q3 come back.

## Part B: special cases

| # | Where | Type this | Expected |
|---|---|---|---|
| B1 | Publications | `10.1016/j.future.2099.999999` (made up) | “No published record was found for this DOI. Check it, or fill in the details by hand and attach evidence”. Nothing is locked |
| B2 | Publications | `https://doi.org/10.1016/J.FUTURE.2024.05.005` (a link, upper case) | Same details as A1. On save the DOI is stored as `10.1016/j.future.2024.05.005` |
| B3 | Publications | Save A1, then add A1’s DOI again (bare or as the B2 link) | Refused as already recorded: one paper is one record |
| B4 | Publications | `10.1109/CVPR.2016.90` (a conference paper) | “This DOI is a conference paper, not a journal article, so it cannot be submitted here. Add it under Books, Chapters & Conference Papers instead”, with a link there |
| B5 | Publications | `10.48550/arXiv.1706.03762` (DataCite, not Crossref) | Found from **DataCite**: “Attention Is All You Need”, 2017. Notes: it is registered as a Preprint, and the journal name must be typed by hand |
| B6 | Books, Chapters & Conference Papers | `10.1016/j.future.2024.05.005` (a journal article) | “This DOI is a journal article… Add it under Publications instead” |

## Part C: Books, Chapters & Conference Papers → Add record → Fetch details

| # | Type this | Expected |
|---|---|---|
| C1 | `10.1109/CVPR.2016.90` | Type **Conference paper**; “Deep Residual Learning for Image Recognition”; conference and proceedings “2016 IEEE Conference on Computer Vision and Pattern Recognition (CVPR)”; 2016; pp 770-778; publisher IEEE; ISBN 9781467388511 |
| C2 | `10.1007/978-3-030-58452-8_13` | Type **Book chapter**; chapter “End-to-End Object Detection with Transformers”; book “Computer Vision – ECCV 2020”; 2020; pp 213-229; Springer International Publishing; ISBN 9783030584511 |
| C3 | `978-3-030-58452-8` (an ISBN that has a DOI) | Type **Book**; “Computer Vision – ECCV 2020”; 2020; Springer; DOI 10.1007/978-3-030-58452-8 filled in |
| C4 | `9780262035613` (an ISBN only) | Type **Book**; “Deep Learning”; 2017; MIT Press; from **Open Library**, with the note “suggestions from Open Library, not the publisher’s own record”, so these fields stay editable |

## Part D: after IQAC uploads the four Web of Science lists

`iqac` → Administration → **Journal & patent data** → drop all four files from your Downloads folder on the
upload box together (“Science Citation Index Expanded (SCIE).csv”, “Social Sciences Citation Index (SSCI).csv”,
“Arts & Humanities Citation Index (AHCI).csv”, “Emerging Sources Citation Index (ESCI).csv”). Each is recognised
from its file name; press **Upload 4 files**.
Then fetch the Part A DOIs again (or reopen saved ones). I checked each ISSN against those four files:

| # | Journal | Indexing expected after upload |
|---|---|---|
| A1 | Future Generation Computer Systems | **Scopus, SCIE** |
| A2 | IEEE Access | **Scopus, SCIE** |
| A3 | Research Policy | **Scopus, SSCI** |
| A4 | British Journal for the History of Science | **Scopus, SSCI, AHCI** (in two Web of Science lists; the order follows the Indexing master list) |
| A5 | Advances in Industrial and Manufacturing Engineering | **Scopus, ESCI** |
| A6 | Concepts in Magnetic Resonance Part B (2023) | **Scopus** only (in no Web of Science list) |
| A7 | the same journal, 2020 paper | NA (Scopus did not cover 2020; no Web of Science list) |
| A8 | International Journal of Computer Applications | NA |

Impact Factor and JIF quartile stay **NA** for all of them until a JCR export from the library is uploaded.
