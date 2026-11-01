import { test, expect } from '@playwright/test';
import { useSession, apiGet } from './helpers';

/*
 * Phase 2 and 3 of the visual-insights plan, through the browser's own session: who may read the
 * figures for a person, a department and the college, what they leave out, IQAC's h-index setting and the
 * Citations row. These change a setting, so they run on the private test copy only
 * (node scripts/e2e-copy.mjs), never on the live site.
 */
test.skip(!process.env.E2E_NO_SERVERS, 'changes settings: run it on the test copy (node scripts/e2e-copy.mjs)');
test.describe.configure({ mode: 'serial' });

interface Card { userId: string; departmentCode: string | null }
let cse = ''; let other = ''; let colleague = ''; let stranger = '';

test.describe('who may read the insights', () => {
  test('a faculty member reads their own page, with a to-do list and no one else’s', async ({ playwright }) => {
    const me = await apiGet(playwright, 'verma', '/api/insights/me');
    expect(me.status).toBe(200);
    cse = me.data.person.departmentCode;
    expect(cse).toBeTruthy();
    expect(me.data.person.name).toBeTruthy();
    expect(Array.isArray(me.data.todo)).toBe(true);
    expect(me.data.counts).toHaveProperty('papers');
    expect(me.data.citations).toHaveProperty('hIndex');

    // The deans see every department; take a colleague of verma's and someone from another department.
    const college = await apiGet(playwright, 'iqac', '/api/insights/college');
    expect(college.status).toBe(200);
    const home = await apiGet(playwright, 'iqac', `/api/insights/department/${cse}`);
    colleague = (home.data.faculty as Card[]).find((c) => c.userId !== me.data.person.userId)!.userId;
    for (const d of college.data.departments as Array<{ code: string; faculty: number }>) {
      if (d.code === cse || d.faculty === 0) continue;
      const dept = await apiGet(playwright, 'iqac', `/api/insights/department/${d.code}`);
      if (dept.data.faculty.length > 0) { other = d.code; stranger = dept.data.faculty[0].userId; break; }
    }
    expect(stranger).toBeTruthy();
  });

  test('a faculty member and a head see their own department only', async ({ playwright }) => {
    for (const who of ['verma', 'hodcse'] as const) {
      expect((await apiGet(playwright, who, `/api/insights/department/${cse}`)).status).toBe(200);
      expect((await apiGet(playwright, who, `/api/insights/department/${other}`)).status).toBe(403);
      expect((await apiGet(playwright, who, '/api/insights/college')).status).toBe(403);
      expect((await apiGet(playwright, who, `/api/insights/person/${colleague}`)).status).toBe(200);
      expect((await apiGet(playwright, who, `/api/insights/person/${stranger}`)).status).toBe(403);
    }
  });

  test('the deans and IQAC see every department, the college and every person', async ({ playwright }) => {
    for (const who of ['drie', 'dofa', 'iqac'] as const) {
      expect((await apiGet(playwright, who, '/api/insights/college')).status).toBe(200);
      expect((await apiGet(playwright, who, `/api/insights/department/${other}`)).status).toBe(200);
      expect((await apiGet(playwright, who, `/api/insights/person/${stranger}`)).status).toBe(200);
    }
  });

  test('CDC sees neither a department, nor the college, nor anyone else', async ({ playwright }) => {
    expect((await apiGet(playwright, 'cdc', `/api/insights/department/${cse}`)).status).toBe(403);
    expect((await apiGet(playwright, 'cdc', '/api/insights/college')).status).toBe(403);
    expect((await apiGet(playwright, 'cdc', `/api/insights/person/${colleague}`)).status).toBe(403);
    expect((await apiGet(playwright, 'cdc', '/api/insights/me')).status).toBe(200);
  });

  test('a signed-out visitor is turned away, and years that make no sense are refused', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: process.env.APP_URL });
    expect((await ctx.get('/api/insights/college')).status()).toBe(401);
    await ctx.dispose();
    const bad = await apiGet(playwright, 'iqac', '/api/insights/college?from=2025&to=2020');
    expect(bad.status).toBe(422);
    expect(bad.error.message).toMatch(/years/i);
    expect((await apiGet(playwright, 'iqac', '/api/insights/college?from=2020&to=2025')).data.range).toEqual({ from: 2020, to: 2025 });
  });

  test('a colleague’s page shows no money, and the lists carry no e-mail, phone or pay', async ({ playwright }) => {
    const seen = await apiGet(playwright, 'verma', `/api/insights/person/${colleague}`);
    expect(seen.data.counts.projectFunding).toBe(0);
    expect(seen.data.counts.consultancyRevenue).toBe(0);
    expect(seen.data.todo).toEqual([]);
    for (const path of [`/api/insights/department/${cse}`, '/api/insights/college', `/api/insights/person/${colleague}`]) {
      const text = JSON.stringify((await apiGet(playwright, 'iqac', path)).body);
      for (const bad of ['@demo.bitmesra', 'payPackage', 'aadhaar', '"phone"', '"email"']) expect(text, `${path} holds ${bad}`).not.toContain(bad);
    }
  });
});

test.describe('IQAC’s h-index setting and the Citations row', () => {
  test('the setting is changed on the Administration page and reaches the department figures at once', async ({ page, playwright }) => {
    await useSession(page, 'iqac');
    await page.goto('/admin?tab=journals');
    const all = page.getByRole('radio', { name: 'All papers' });
    const atBit = page.getByRole('radio', { name: 'Only papers done at BIT' });
    // Start from the default whatever an earlier, interrupted run left behind.
    if (!(await all.isChecked())) await all.click();
    await expect(all).toBeChecked();
    expect((await apiGet(playwright, 'drie', `/api/insights/department/${cse}`)).data.citations.counts).toBe('all');

    await atBit.click();
    await expect(page.getByText('The h-index now counts only papers done at BIT.')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('radio', { name: 'Only papers done at BIT' })).toBeChecked();
    expect((await apiGet(playwright, 'drie', `/api/insights/department/${cse}`)).data.citations.counts).toBe('at-bit');

    await page.getByRole('radio', { name: 'All papers' }).click();
    await expect(page.getByText('The h-index now counts all papers.')).toBeVisible();
    expect((await apiGet(playwright, 'drie', `/api/insights/department/${cse}`)).data.citations.counts).toBe('all');
  });

  test('only IQAC finds the setting, and a dean cannot change it', async ({ page }) => {
    await useSession(page, 'drie');
    await page.goto('/admin?tab=journals');
    await expect(page.getByRole('radio', { name: 'All papers' })).toHaveCount(0);
  });

  test('the Citations row says what is checked, and refreshing says plainly when lookups are off', async ({ page }) => {
    await useSession(page, 'iqac');
    await page.goto('/admin?tab=journals');
    const row = page.locator('tr', { hasText: 'Scopus, by DOI' });
    await expect(row).toBeVisible();
    await expect(row).toContainText(/papers found in Scopus|No papers with a DOI yet|not connected/);
    const refresh = row.getByRole('button', { name: 'Refresh now' });
    if (await refresh.isEnabled()) {
      await refresh.click();
      await expect(page.getByText(/Lookups are switched off/)).toBeVisible();      // the test copy runs with LOOKUP_OFFLINE=1
    }
  });
});
