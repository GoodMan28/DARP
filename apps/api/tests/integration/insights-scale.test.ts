import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { truncateAll, closeDb, db } from '../helpers/db';
import { makeUser } from '../helpers/factories';
import { records, users, departments } from '@/server/db/schema';
import { collegeInsights, departmentInsights } from '@/server/rollups/insights';
import type { SessionUser } from '@/server/auth/session';

/*
 * Phase 8 of the visual-insights plan: the figures are worked out live (no cache), so they must stay quick at
 * the size of a real institute: 300 faculty, 3,000 papers, each with five authors matched by name.
 */
const FIRST = ['Anil', 'Sunita', 'Rakesh', 'Priya', 'Vikram', 'Meena', 'Sanjay', 'Kavita', 'Rohit', 'Neha', 'Amit', 'Pooja', 'Suresh', 'Anita', 'Deepak'];
const LAST = ['Verma', 'Rao', 'Mahato', 'Nair', 'Singh', 'Kumar', 'Sharma', 'Ranjan', 'Kujur', 'Prasad', 'Mishra', 'Gupta', 'Das', 'Sinha', 'Jha', 'Munda', 'Oraon', 'Tirkey', 'Lakra', 'Soren'];

let iqac: SessionUser;
const PEOPLE = 300; const PAPERS = 3000;

beforeAll(async () => {
  await truncateAll();
  iqac = await makeUser({ role: 'admin' });
  const depts = await db.select().from(departments);
  const people = Array.from({ length: PEOPLE }, (_, i) => {
    const first = FIRST[i % FIRST.length]!; const last = LAST[Math.floor(i / FIRST.length) % LAST.length]!;
    return {
      email: `t.scale${i}.${Date.now()}@bitmesra.ac.in`, name: `${first} ${last}`, firstName: first, lastName: last,
      role: 'faculty' as const, departmentId: depts[i % depts.length]!.id, passwordHash: 'not-used', mustChangePassword: false, dateOfJoining: '2015-07-01',
    };
  });
  const made = await db.insert(users).values(people).returning({ id: users.id, departmentId: users.departmentId, name: users.name });
  const rows = Array.from({ length: PAPERS }, (_, i) => {
    const owner = made[i % made.length]!;
    const authors = [0, 1, 2, 3, 4].map((k) => { const p = made[(i * 7 + k * 13) % made.length]!; return `${p.name.split(' ')[0]![0]}. ${p.name.split(' ')[1]}`; }).join(', ');
    return {
      moduleKey: 'publications', ownerUserId: owner.id, createdBy: owner.id, departmentId: owner.departmentId, status: 'approved' as const,
      periodLabel: String(2015 + (i % 11)), periodYear: 2015 + (i % 11),
      data: { doi: `10.7777/scale.${i}`, title: `Paper ${i}`, journal: `Journal ${i % 60}`, authors },
    };
  });
  for (let i = 0; i < rows.length; i += 500) await db.insert(records).values(rows.slice(i, i + 500));
}, 120_000);
afterAll(async () => { await truncateAll(); await closeDb(); });

describe('at the size of the institute', () => {
  it('works out the whole college in under a second, with every paper matched to its authors', async () => {
    const t = Date.now();
    const c = await collegeInsights(iqac, null);
    const ms = Date.now() - t;
    console.log(`college insights: ${ms} ms for ${PEOPLE} faculty and ${PAPERS} papers`);
    expect(c.counts.papers).toBe(PAPERS);
    expect(c.facultyTotal).toBe(PEOPLE);
    expect(ms).toBeLessThan(1000);
  }, 60_000);

  it('works out a department just as quickly', async () => {
    const t = Date.now();
    const d = await departmentInsights(iqac, (await db.select().from(departments))[0]!.code, null);
    const ms = Date.now() - t;
    console.log(`department insights: ${ms} ms`);
    expect(d.counts.papers).toBeGreaterThan(0);
    expect(ms).toBeLessThan(1000);
  }, 60_000);
});
