# Request: API keys for DARP (Scopus and Web of Science)

**For:** the Central Library (who manages BIT's Scopus, Web of Science and JCR subscriptions), and the Registrar /
Purchase section if a new licence is needed.
**From:** the DARP team, for IQAC.

## Why

DARP fills each faculty member's research figures and each journal's ranking automatically, so nobody types them.
Each faculty member's ORCID iD already gives DARP their Scopus Author ID and Web of Science ResearcherID. To fetch
the figures, DARP needs three keys:

| # | Key | From | What DARP gets with it | Cost |
|---|---|---|---|---|
| 1 | **Elsevier API key** (Scopus) | Elsevier, free with BIT's Scopus subscription | Each faculty member's Scopus documents, citations and h-index | No extra cost |
| 2 | **Web of Science Researcher API** key | Clarivate | Each faculty member's WoS documents, citations (with and without self-citations) and h-index | Paid add-on licence |
| 3 | **Web of Science Journals API** key | Clarivate | Each journal's **Impact Factor (JIF)** and **JIF quartile**, from Journal Citation Reports | Paid add-on to BIT's JCR (or InCites) subscription |

Until the keys arrive, DARP still works: faculty type their WoS figures with a screenshot, and IQAC uploads the JCR
list once a year.

**First, please check two things.** The library's e-resources page lists **Web of Science under e-ShodhSindhu**
(INFLIBNET's national consortium), and lists **ScienceDirect but not Scopus**.
- **Web of Science through e-ShodhSindhu** gives BIT users the website. It does **not** include Clarivate's APIs, which
  are licensed separately per institution. Please ask Clarivate (or INFLIBNET, which holds the consortium licence)
  whether BIT can license the two APIs below, and whether **Journal Citation Reports (JCR)** is part of BIT's access.
- **Scopus:** an Elsevier API key returns Scopus figures only for an institution that subscribes to **Scopus**.
  ScienceDirect alone is not enough. Please confirm whether BIT has Scopus access (directly, or through INFLIBNET /
  One Nation One Subscription).

---

## Key 1: Elsevier (Scopus): free, about 15 minutes

Done by the library, from a computer on the BIT campus network.

1. Go to **https://dev.elsevier.com** and click **I want an API key**.
2. Sign in (or create an account) with the **library's official BIT e-mail address**, not a personal one.
3. Click **Create API Key**:
   - **Label:** `DARP – BIT Mesra IQAC`
   - **Website URL:** the DARP address (e.g. `https://darp.bitmesra.ac.in`)
4. Accept the terms. The key (32 letters and digits) appears on the screen.
5. **Two extra requests to Elsevier** (through the library's Elsevier account manager, or "Contact us" on
   dev.elsevier.com):
   - **Institutional token ("insttoken"):** needed only if the DARP server is **outside** the campus network. It
     lets the key use BIT's Scopus subscription from there.
   - **Citation Overview API access:** needed for citations and h-index **without self-citations**. Elsevier
     enables it per institution on request. Without it DARP shows the figures *with* self-citations, marked so.

**Send to DARP:** the API key (and the insttoken, if issued).

---

## Key 2: Clarivate Web of Science Researcher API: paid licence

1. The library asks **Clarivate's account manager for BIT** for a quote for the **Web of Science Researcher API**
   (developer.clarivate.com/apis/wos-researcher). It needs a paid licence.
2. Once licensed, the library (or the DARP team, with the library's approval) signs in at
   **https://developer.clarivate.com** with the BIT account, opens **Web of Science Researcher API**, and registers
   an application named `DARP – BIT Mesra IQAC`.
3. Clarivate approves it (this can take a few days) and shows the **API key**.

Limits: 5 requests a second, 5,000 a day. DARP needs far fewer: about 2 or 3 a day for each 100 faculty members.

**Send to DARP:** the API key.

---

## Key 3: Clarivate Web of Science Journals API (JIF and JIF quartile): paid add-on

1. Ask Clarivate's account manager for the **Web of Science Journals API** (developer.clarivate.com/apis/wos-journal).
   It is an add-on to BIT's **Journal Citation Reports (JCR)** or **InCites** subscription.
2. **Please ask Clarivate to confirm in writing** that the API gives the **JIF quartile** (Q1–Q4) as well as the
   Impact Factor. Clarivate's page names the Impact Factor; DARP needs both.
3. Once licensed, register the application at developer.clarivate.com as in Key 2 and receive the **API key**.

**If this licence is not bought:** no problem. Once a year, after JCR's June release, the library downloads the
JCR list (journal, ISSN, JIF, JIF quartile) as a CSV from jcr.clarivate.com and IQAC uploads it on DARP
(Administration → Journal & patent data). DARP already supports this.

**Send to DARP:** the API key.

---

## How to hand over the keys

- Give them to the DARP administrator **in person or on an encrypted channel**: not on a WhatsApp group or a
  shared e-mail thread. A key is like a password for BIT's subscription.
- DARP keeps them only in its server settings (`ELSEVIER_API_KEY`, `ELSEVIER_INSTTOKEN`, `CLARIVATE_API_KEY`), never
  in its code.
- DARP calls these APIs only for BIT's own faculty, within the providers' published limits.

---

## A message you can send to the library

> Subject: API keys for DARP (IQAC research data portal)
>
> Dear Librarian,
>
> IQAC's DARP portal reads each faculty member's research figures from Scopus and Web of Science automatically,
> using their ORCID iD, so that faculty do not have to type them. We request:
>
> 1. An **Elsevier API key** from dev.elsevier.com, under the library's BIT account (free with our Scopus
>    subscription). Please also request from Elsevier **Citation Overview API** access, for figures without
>    self-citations, and an **institutional token** if the server is off campus.
> 2. Clarivate's free **Web of Science Starter API (Institutional Member Plan)**, for which our Web of Science
>    administrator can apply, and a quote for the paid **Web of Science Researcher API** (faculty h-index and
>    citations without self-citations).
> 3. A quote for Clarivate's **Web of Science Journals API** (journal Impact Factor and JIF quartile), an add-on to
>    our JCR subscription. Please ask Clarivate to confirm it includes the JIF quartile. If we do not buy it, we only
>    need the yearly JCR list as a CSV.
>
> The keys will be kept only in the server's settings and used only for BIT's own faculty.
>
> Regards,
> (name), DARP team, IQAC

---

## If things don't work out: what each option costs per year

**Elsevier and Clarivate do not publish prices** for their subscriptions or APIs. Each institution gets its own
quote, depending on size, the existing contract and the consortium (INFLIBNET). No exact public figure exists to
copy here. The table says what is free, what needs a quote, and the cheapest route for each need.

| What DARP needs | Option | Cost per year | Source |
|---|---|---|---|
| Faculty Scopus figures | Elsevier API key | **Free**, if BIT has Scopus access | dev.elsevier.com |
| | Scopus subscription itself (if BIT has none) | **Quote from Elsevier**; ask also whether INFLIBNET / One Nation One Subscription covers it | not published |
| Faculty Web of Science figures | **Web of Science Starter API, Institutional Member Plan** | **Free** for organisations that subscribe to Web of Science; 5,000 requests a day; includes times cited | developer.clarivate.com/apis/wos-starter |
| | Web of Science Researcher API (h-index, citations without self-citations) | **Quote from Clarivate** (paid licence) | not published |
| Journal Impact Factor and JIF quartile | **JCR list as CSV, once a year**, uploaded on DARP | **Free**, if JCR is part of BIT's access | jcr.clarivate.com |
| | Web of Science Journals API | **Quote from Clarivate** (paid add-on to JCR or InCites) | not published |
| Any of the above, for free | **OpenAlex** (already working in DARP) | **Free**, no key | openalex.org |

### Cheapest route (₹0)

1. **Scopus:** the free Elsevier key, if the library confirms BIT has Scopus access.
2. **Web of Science:** ask Clarivate for the free **Starter API, Institutional Member Plan**. It needs an
   administrator of BIT's Web of Science access to apply.
   - It gives each faculty member's WoS documents and times cited, from which DARP can work out the h-index.
   - It does not give citations without self-citations; those still need the paid Researcher API.
   - DARP would need a short addition to use it. The DARP team will do that once the key arrives.
3. **Impact Factor and JIF quartile:** the yearly **JCR CSV**, if JCR is included in BIT's access.
4. **Meanwhile:** OpenAlex, already working, for every faculty member with an ORCID iD.

### To get exact prices

- Ask the library to request **written annual quotes** from:
  - **Elsevier** (Scopus, only if BIT has no access);
  - **Clarivate** (Web of Science Researcher API; Web of Science Journals API).

  Ask for the price **through INFLIBNET / e-ShodhSindhu** as well as directly. Consortium prices are usually lower.
- For comparison, the Purchase section can look for past orders by other Indian institutes on the **GeM** and
  **CPP (eprocure.gov.in)** portals, searching "Scopus", "Web of Science API" and "Journal Citation Reports".
