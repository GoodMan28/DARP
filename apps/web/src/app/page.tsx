import Link from 'next/link';
import Image from 'next/image';
import { Lockup, UtilityBar } from '@/components/shell/Brand';
import { MODULE_LIST, GROUP_ORDER } from '@darp/shared/modules';
import { plural } from '@darp/shared/format';

// Rendered per request so the CSP nonce from src/middleware.ts reaches Next's
// inline hydration scripts. A prerendered page cannot carry a per-request nonce.
export const dynamic = 'force-dynamic';

const STEPS = [
  {
    n: '01',
    title: 'Faculty enter their own records',
    body: 'Academic year and department are pre-filled from your account and locked, so every record is attributed correctly the first time. Evidence files attach to the record they support.',
  },
  {
    n: '02',
    title: 'Totals compute themselves',
    body: 'Publication counts, PI and Co-PI project counts, grant value and scholars guided appear on your profile as read-only tiles — none of them hand-tallied.',
  },
  {
    n: '03',
    title: 'Offices verify, IQAC signs off',
    body: 'The owning dean’s office verifies each record; IQAC approves and exports. The workbooks that go to NAAC are generated, in their original layout, from the same records.',
  },
];

const FILMSTRIP = [
  { src: '/brand/campus-lab.jpg', w: 280 },
  { src: '/brand/campus-hpc.jpg', w: 230 },
  { src: '/brand/campus-heritage.jpg', w: 260 },
  { src: '/brand/campus-convocation.jpg', w: 270 },
  { src: '/brand/campus-grounds.jpg', w: 260 },
];

export default function Home() {
  const groups = GROUP_ORDER
    .map((g) => ({ group: g, modules: MODULE_LIST.filter((m) => m.group === g) }))
    .filter((g) => g.modules.length > 0);

  return (
    <div className="bg-surface">
      <UtilityBar />

      <header className="flex h-20 items-center border-b border-line px-4 md:px-10">
        <Lockup height={46} />
        <nav className="ml-auto flex items-center gap-6 text-sm">
          <Link href="/" className="border-b-2 border-primary pb-1 font-semibold text-primary">Home</Link>
          <Link href="/instructions" className="text-ink hover:text-primary">Instructions</Link>
          <Link
            href="/login"
            className="rounded-sm bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover"
          >
            Sign in
          </Link>
        </nav>
      </header>

      {/* hero */}
      <section className="relative h-[420px] overflow-hidden bg-brand-900 md:h-[520px]">
        <Image
          src="/brand/hero-building.jpg"
          alt="The main academic building at BIT Mesra"
          fill
          priority
          sizes="100vw"
          className="object-cover object-[center_40%]"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(100deg, rgba(15,13,54,.95) 0%, rgba(18,16,64,.86) 32%, rgba(24,21,84,.5) 62%, rgba(24,21,84,.14) 100%)',
          }}
        />
        <div className="relative max-w-3xl px-4 pt-16 md:px-10 md:pt-20">
          <div className="flex items-center gap-2.5">
            <span className="h-0.5 w-6 bg-gold-500" />
            <span className="text-2xs font-bold uppercase tracking-[0.16em] text-gold-200">
              NAAC · NIRF · QS
            </span>
          </div>
          <h1 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-white md:text-[2.5rem]">
            One place for every accreditation number.
          </h1>
          <p className="mt-4 max-w-xl text-md leading-relaxed text-brand-100">
            Six emailed workbooks are retired. Enter each publication, patent, grant and award once —
            DARP attributes it to your department and computes every total the accreditation bodies
            ask for, across every reporting cycle.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="/login"
              className="rounded-sm bg-white px-7 py-3 text-sm font-bold text-primary hover:bg-brand-50"
            >
              Sign in to DARP
            </Link>
            <Link
              href="/instructions"
              className="rounded-sm border border-white/50 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10"
            >
              Read the instructions
            </Link>
          </div>
        </div>
      </section>

      {/* how it works */}
      <section className="px-4 pt-14 md:px-10">
        <div className="flex items-start gap-5">
          <Image
            src="/brand/campus-grounds.jpg"
            alt=""
            width={60}
            height={60}
            className="mt-0.5 hidden h-[60px] w-[60px] shrink-0 rounded-full object-cover ring-1 ring-line sm:block"
          />
          <div>
            <div className="text-2xs font-bold uppercase tracking-[0.14em] text-ink-faint">How it works</div>
            <h2 className="mt-2 text-2xl font-bold tracking-tight">Three steps, one source of truth.</h2>
            <p className="mb-8 mt-1.5 max-w-xl text-sm text-ink-muted">No one re-types anyone else’s record.</p>
            <div className="grid gap-6 md:grid-cols-3">
              {STEPS.map((s) => (
                <div key={s.n} className="border-t-[3px] border-maroon-700 pt-4">
                  <div className="font-mono text-xs font-bold text-gold-500">{s.n}</div>
                  <h3 className="mb-2 mt-2 text-md font-semibold">{s.title}</h3>
                  <p className="text-sm leading-relaxed text-ink-muted">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* campus filmstrip — no captions, imagery as texture */}
      <section className="pt-14">
        <div className="flex gap-3.5 overflow-hidden px-4 md:px-10">
          {FILMSTRIP.map((f) => (
            <Image
              key={f.src}
              src={f.src}
              alt=""
              width={f.w}
              height={190}
              className="h-[190px] shrink-0 rounded-lg object-cover"
              style={{ width: f.w }}
            />
          ))}
        </div>
        <div className="flex gap-1.5 px-4 pt-4 md:px-10">
          <span className="h-1.5 w-1.5 rounded-full bg-maroon-700" />
          <span className="h-1.5 w-1.5 rounded-full bg-ink-400" />
          <span className="h-1.5 w-1.5 rounded-full bg-ink-400" />
          <span className="h-1.5 w-1.5 rounded-full bg-ink-400" />
          <span className="h-1.5 w-1.5 rounded-full bg-ink-400" />
        </div>
      </section>

      {/* modules */}
      <section className="px-4 pt-14 md:px-10">
        <h2 className="text-xl font-bold tracking-tight">
          Twenty-four modules, grouped as they appear in the portal
        </h2>
        <p className="mb-5 mt-1.5 text-sm text-ink-muted">Access depends on your role.</p>
        <div className="grid gap-3.5 md:grid-cols-3">
          {groups.map((g) => (
            <div key={g.group} className="rounded-sm border border-line bg-surface-2 px-5 py-4">
              <div className="mb-2 text-sm font-semibold">
                {g.group}{' '}
                <span className="font-normal text-ink-faint">· {plural(g.modules.length, 'module')}</span>
              </div>
              <div className="text-xs leading-7 text-ink-muted">
                {g.modules.map((m) => m.name).join(' · ')}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* footer */}
      <footer className="mt-14 bg-brand-900 px-4 pt-10 text-brand-200 md:px-10">
        <div className="grid gap-10 pb-8 md:grid-cols-4">
          <div>
            <Lockup height={38} tone="dark" showProduct={false} />
            <p className="mt-4 text-xs leading-relaxed">
              Mesra, Ranchi — 835215
              <br />
              Jharkhand, India
            </p>
          </div>
          <div>
            <div className="mb-3 text-2xs font-bold uppercase tracking-wider text-white">Portal</div>
            <div className="text-xs leading-8">
              <Link href="/login" className="hover:text-white">Sign in</Link>
              <br />
              <Link href="/instructions" className="hover:text-white">Instructions</Link>
            </div>
          </div>
          <div>
            <div className="mb-3 text-2xs font-bold uppercase tracking-wider text-white">Resources</div>
            <div className="text-xs leading-8">
              Entry guidelines
              <br />
              Reporting periods
              <br />
              Definitions &amp; glossary
            </div>
          </div>
          <div>
            <div className="mb-3 text-2xs font-bold uppercase tracking-wider text-white">Support</div>
            <div className="text-xs leading-8">
              iqac@bitmesra.ac.in
              <br />
              Extension 2411
              <br />
              Mon–Fri, 10:00–17:00
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-white/10 py-4 text-2xs text-brand-300">
          <span>Internal use only · Accounts are created by IQAC; there is no self-registration.</span>
          <span className="ml-auto">© Birla Institute of Technology, Mesra</span>
        </div>
      </footer>
    </div>
  );
}
