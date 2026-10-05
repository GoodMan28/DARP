import Link from 'next/link';
import Image from 'next/image';
import { Lockup, UtilityBar } from '@/components/shell/Brand';
import { StatePill } from '@/components/ui';
import { MODULE_LIST } from '@darp/shared/modules';
import { ROLE_SHORT } from '@darp/shared/roles';
import type { Role } from '@darp/shared/modules/types';

// Rendered per request so the CSP nonce from src/middleware.ts reaches Next's
// inline hydration scripts. A prerendered page cannot carry a per-request nonce.
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Entry guidelines · DARP' };

const SECTIONS = [
  { id: 'who', label: 'Who fills in what' },
  { id: 'add', label: 'Adding a record' },
  { id: 'evidence', label: 'Evidence rules' },
  { id: 'states', label: 'What the states mean' },
  { id: 'years', label: 'Which years to report' },
  { id: 'faq', label: 'Common questions' },
  { id: 'help', label: 'Getting help' },
];

const STATE_NOTES: Array<{ status: string; note: string }> = [
  { status: 'draft', note: 'Yours alone. Not counted anywhere, not visible to the offices.' },
  { status: 'submitted', note: 'With the dean’s office. Counted on your profile; locked against editing.' },
  { status: 'verified', note: 'The office has checked it against the evidence. Waiting for IQAC.' },
  { status: 'approved', note: 'Signed off by IQAC and included in the exported workbook.' },
  { status: 'returned', note: 'Sent back with a remark. Editable again — fix what the remark asks for and resubmit.' },
];

const FAQ = [
  {
    q: 'My co-author has already entered our paper. What do I do?',
    a: 'Nothing. It is counted for the department once. Ask them to list you in the authors field if you are missing from it.',
  },
  {
    q: 'A profile total looks wrong. Can I edit it?',
    a: 'No — the tiles are computed, not typed. Correct the underlying record and the total follows. That is what keeps the NAAC, NIRF and QS extracts consistent with one another.',
  },
  {
    q: 'I have nothing to report in a module.',
    a: 'Open it and mark “Nothing to report this cycle”. An empty module and a completed-but-empty one look different on your head of department’s dashboard.',
  },
  {
    q: 'Why does it ask for my Aadhaar?',
    a: 'The NAAC faculty annexure requires it. DARP stores it encrypted and shows only the last four digits. Only IQAC can produce an unmasked export, only with a written reason, and every such request is logged.',
  },
];

export default function InstructionsPage() {
  const byOwner = (role: Role) => MODULE_LIST.filter((m) => m.ownerRoles.includes(role));

  const ownerRows: Array<{ role: Role; modules: string; verifier: string }> = (
    ['faculty', 'hod', 'dofa', 'cdc'] as Role[]
  ).map((role) => {
    const mods = byOwner(role);
    const verifiers = [...new Set(mods.flatMap((m) => m.verifierRoles))].map((r) => ROLE_SHORT[r]);
    return {
      role,
      modules: mods.map((m) => m.name).join(', '),
      verifier: verifiers.join(' / ') || '—',
    };
  });

  return (
    <div className="bg-surface">
      <UtilityBar />

      <header className="flex h-20 items-center border-b border-line px-4 md:px-10">
        <Lockup height={46} />
        <nav className="ml-auto flex items-center gap-6 text-sm">
          <Link href="/" className="text-ink hover:text-primary">Home</Link>
          <Link href="/instructions" className="border-b-2 border-primary pb-1 font-semibold text-primary">
            Instructions
          </Link>
          <Link
            href="/login"
            className="rounded-sm bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover"
          >
            Sign in
          </Link>
        </nav>
      </header>

      <div className="border-b border-line bg-surface-2 px-4 py-8 md:px-10">
        <div className="text-2xs text-ink-faint">
          <Link href="/" className="text-primary hover:underline">Home</Link>
          {' '}›{' '}Instructions
        </div>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight">Entry guidelines</h1>
        <p className="mt-2 max-w-3xl text-sm text-ink-muted">
          How to enter your records, what evidence each module needs, and who verifies what.
          Issued by the Internal Quality Assurance Cell.
        </p>
      </div>

      <div className="flex gap-10 px-4 py-8 md:px-10">
        {/* table of contents */}
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-6">
            <div className="mb-3 text-2xs font-bold uppercase tracking-wider text-ink-faint">
              On this page
            </div>
            <nav className="flex flex-col gap-2 text-sm">
              {SECTIONS.map((s, i) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className={`border-l-2 pl-3 ${
                    i === 0 ? 'border-primary font-semibold text-primary' : 'border-line text-ink-muted hover:text-ink'
                  }`}
                >
                  {s.label}
                </a>
              ))}
            </nav>
            <div className="mt-7 flex flex-col gap-2">
              <Image
                src="/brand/campus-convocation.jpg"
                alt=""
                width={214}
                height={150}
                className="h-[150px] w-full rounded-sm object-cover"
              />
              <Image
                src="/brand/campus-heritage.jpg"
                alt=""
                width={214}
                height={104}
                className="h-[104px] w-full rounded-sm object-cover"
              />
            </div>
          </div>
        </aside>

        {/* body */}
        <div className="min-w-0 flex-1">
          <section id="who" className="scroll-mt-6">
            <h2 className="text-lg font-bold tracking-tight">Who fills in what</h2>
            <p className="mb-4 mt-2 max-w-[74ch] text-sm leading-relaxed text-ink-muted">
              Every record is entered once, by the person who owns it. If a paper has two BIT authors,
              only one of you enters it — DARP will refuse the second copy and tell you who already has it.
            </p>
            <div className="overflow-hidden rounded-sm border border-line">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="w-36 border-b border-line bg-surface-2 px-3 py-2 text-left text-2xs font-bold uppercase tracking-wider text-ink-muted">
                      Role
                    </th>
                    <th className="border-b border-line bg-surface-2 px-3 py-2 text-left text-2xs font-bold uppercase tracking-wider text-ink-muted">
                      Enters
                    </th>
                    <th className="w-36 border-b border-line bg-surface-2 px-3 py-2 text-left text-2xs font-bold uppercase tracking-wider text-ink-muted">
                      Verified by
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ownerRows.map((r) => (
                    <tr key={r.role}>
                      <td className="border-b border-line px-3 py-2 align-top font-semibold">
                        {ROLE_SHORT[r.role]}
                      </td>
                      <td className="border-b border-line px-3 py-2 align-top text-ink-muted">{r.modules}</td>
                      <td className="border-b border-line px-3 py-2 align-top text-ink-muted">{r.verifier}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="border-b border-line px-3 py-2 align-top font-semibold">DRIE · DUGS/DPGS</td>
                    <td className="border-b border-line px-3 py-2 align-top text-ink-muted">
                      Nothing of their own — these offices verify records submitted by others
                    </td>
                    <td className="border-b border-line px-3 py-2 align-top text-ink-muted">—</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 align-top font-semibold">IQAC</td>
                    <td className="px-3 py-2 align-top text-ink-muted">
                      Accounts, dropdown lists, the cycle and its deadline
                    </td>
                    <td className="px-3 py-2 align-top text-ink-muted">
                      Approves everything, and has the final word
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section id="add" className="mt-10 scroll-mt-6">
            <h2 className="text-lg font-bold tracking-tight">Adding a record</h2>
            <p className="mb-4 mt-2 max-w-[74ch] text-sm leading-relaxed text-ink-muted">
              Open the module from the left navigation, then <strong>Add record</strong>. Reporting period,
              department and your name are filled in from your account and cannot be edited — that is how
              a record is attributed without anyone re-typing it.
            </p>
            <div className="grid gap-3.5 md:grid-cols-3">
              {[
                ['STEP 1', 'Fill the required fields', 'Fields marked with a red asterisk are required before you can submit. You can Save as draft at any point with the form half-finished.'],
                ['STEP 2', 'Attach the evidence', 'PDF, JPG or PNG up to 5 MB. The file stays attached to the record, so nobody has to hunt through a shared drive at submission time.'],
                ['STEP 3', 'Submit for verification', 'The record goes to the owning dean’s office. Until it is returned to you, it is locked — that is what stops figures changing after they are counted.'],
              ].map(([step, title, body]) => (
                <div key={step} className="rounded-sm border border-line p-4">
                  <div className="font-mono text-2xs font-bold text-gold-500">{step}</div>
                  <div className="mb-1.5 mt-1.5 text-sm font-semibold">{title}</div>
                  <div className="text-xs leading-relaxed text-ink-muted">{body}</div>
                </div>
              ))}
            </div>
          </section>

          <section id="evidence" className="mt-10 scroll-mt-6">
            <h2 className="text-lg font-bold tracking-tight">Evidence rules</h2>
            <p className="mb-4 mt-2 max-w-[74ch] text-sm leading-relaxed text-ink-muted">
              Only PDF, JPG and PNG files are accepted, up to 5 MB. The portal checks the file’s actual
              contents, not just its name, and stores it outside the web root — an uploaded file can only
              be read back through an authorised download.
            </p>
            <div className="overflow-hidden rounded-sm border border-line">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="w-56 border-b border-line bg-surface-2 px-3 py-2 text-left text-2xs font-bold uppercase tracking-wider text-ink-muted">
                      Module
                    </th>
                    <th className="border-b border-line bg-surface-2 px-3 py-2 text-left text-2xs font-bold uppercase tracking-wider text-ink-muted">
                      What to attach
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {MODULE_LIST.filter((m) => m.fields.some((f) => f.type === 'file')).map((m) => (
                    <tr key={m.key}>
                      <td className="border-b border-line px-3 py-2 align-top">{m.name}</td>
                      <td className="border-b border-line px-3 py-2 align-top text-ink-muted">
                        {m.fields.filter((f) => f.type === 'file').map((f) => f.label).join('; ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section id="states" className="mt-10 scroll-mt-6">
            <h2 className="text-lg font-bold tracking-tight">What the states mean</h2>
            <div className="mt-3 flex flex-col gap-2.5">
              {STATE_NOTES.map((s) => (
                <div key={s.status} className="flex flex-wrap items-baseline gap-3">
                  <span className="w-24 shrink-0"><StatePill status={s.status} /></span>
                  <span className="text-sm text-ink-muted">{s.note}</span>
                </div>
              ))}
            </div>
          </section>

          <section id="years" className="mt-10 scroll-mt-6">
            <h2 className="text-lg font-bold tracking-tight">Which years to report</h2>
            <p className="mb-4 mt-2 max-w-[74ch] text-sm leading-relaxed text-ink-muted">
              The workbooks do not agree on what a “year” means, so DARP applies the right window per
              module automatically. You never choose it.
            </p>
            <div className="overflow-hidden rounded-sm border border-line">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="w-44 border-b border-line bg-surface-2 px-3 py-2 text-left text-2xs font-bold uppercase tracking-wider text-ink-muted">
                      Window
                    </th>
                    <th className="border-b border-line bg-surface-2 px-3 py-2 text-left text-2xs font-bold uppercase tracking-wider text-ink-muted">
                      Modules
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(['CY', 'FY', 'AY'] as const).map((p) => (
                    <tr key={p}>
                      <td className="border-b border-line px-3 py-2 align-top font-semibold">
                        {p === 'CY' ? 'Calendar year' : p === 'FY' ? 'Financial year (Apr–Mar)' : 'Academic year (Jul–Jun)'}
                      </td>
                      <td className="border-b border-line px-3 py-2 align-top text-ink-muted">
                        {MODULE_LIST.filter((m) => m.periodType === p).map((m) => m.name).join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section id="faq" className="mt-10 scroll-mt-6">
            <h2 className="text-lg font-bold tracking-tight">Common questions</h2>
            <div className="mt-3 border-t border-line">
              {FAQ.map((f) => (
                <div key={f.q} className="border-b border-line py-3.5">
                  <div className="mb-1 text-sm font-semibold">{f.q}</div>
                  <div className="text-sm leading-relaxed text-ink-muted">{f.a}</div>
                </div>
              ))}
            </div>
          </section>

          <section id="help" className="mt-10 scroll-mt-6">
            <h2 className="text-lg font-bold tracking-tight">Getting help</h2>
            <p className="mt-2 max-w-[74ch] text-sm leading-relaxed text-ink-muted">
              Write to <strong>iqac@bitmesra.ac.in</strong> or call extension 2411, Monday to Friday,
              10:00–17:00. Accounts are created by IQAC — there is no self-registration. If you cannot
              sign in, contact the cell rather than creating a second account.
            </p>
          </section>
        </div>
      </div>

      <footer className="flex flex-wrap gap-2 bg-brand-900 px-4 py-4 text-2xs text-brand-300 md:px-10">
        <span>Internal use only · Entry guidelines</span>
        <span className="ml-auto">© Birla Institute of Technology, Mesra</span>
      </footer>
    </div>
  );
}
