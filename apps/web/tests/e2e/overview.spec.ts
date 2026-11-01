import { test, expect } from '@playwright/test';
import { useSession, apiGet } from './helpers';

/*
 * Phase 5 of the visual-insights plan: the personal Overview and a person's page, in the browser. Read-only, so it
 * also runs on the live site; it does not need any particular figures, only that every part shows up.
 */
let colleague = ''; let stranger = '';

test.beforeAll(async ({ playwright }) => {
  const me = await apiGet(playwright, 'verma', '/api/insights/me');
  const dept = me.data.person.departmentCode as string;
  const home = await apiGet(playwright, 'iqac', `/api/insights/department/${dept}`);
  colleague = (home.data.faculty as Array<{ userId: string }>).find((f) => f.userId !== me.data.person.userId)!.userId;
  const college = await apiGet(playwright, 'iqac', '/api/insights/college');
  for (const d of college.data.departments as Array<{ code: string }>) {
    if (d.code === dept) continue;
    const other = await apiGet(playwright, 'iqac', `/api/insights/department/${d.code}`);
    if (other.data.faculty.length > 0) { stranger = other.data.faculty[0].userId; break; }
  }
});

test.describe('the personal Overview', () => {
  test('opens with the person’s name, what to do next, and the charts, each with its numbers', async ({ page }) => {
    await useSession(page, 'verma');
    await expect(page.getByRole('heading', { name: /Good to see you/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'What to do next' })).toBeVisible();
    for (const title of ['Publications by year', 'What was produced', 'Journal quality', 'Citations', 'Recent publications']) {
      await expect(page.getByRole('heading', { name: title })).toBeVisible();
    }
    // Every chart card has its numbers under "See the numbers".
    const summaries = page.locator('summary', { hasText: 'See the numbers' });
    const n = await summaries.count();
    expect(n).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < n; i += 1) {
      await summaries.nth(i).click();
      await expect(summaries.nth(i).locator('xpath=..').locator('table')).toBeVisible();
    }
    await expect(page.getByRole('link', { name: 'Continue data entry' })).toBeVisible();
  });

  test('keeps the modules table, folded away', async ({ page }) => {
    await useSession(page, 'verma');
    const summary = page.locator('summary', { has: page.getByRole('heading', { name: 'My modules' }) });
    await expect(summary).toBeVisible();
    await expect(page.getByRole('link', { name: 'Patents' }).and(page.locator('tbody a')).first()).toBeHidden();
    await summary.click();
    await expect(page.locator('details tbody a').first()).toBeVisible();
  });

  test('counts the chosen years, and a refreshed page keeps them', async ({ page }) => {
    await useSession(page, 'verma');
    await page.getByLabel('From year').selectOption('2024');
    await page.getByLabel('To year').selectOption('2025');
    await page.waitForURL('**/dashboard?from=2024&to=2025');
    await expect(page.getByText('Counting 2024–2025.')).toBeVisible();
    await page.reload();
    await expect(page.getByText('Counting 2024–2025.')).toBeVisible();
    await page.getByRole('button', { name: 'All years' }).click();
    await page.waitForURL('**/dashboard');
    await expect(page.getByText('Counting every year.')).toBeVisible();
  });

  test('fits a phone: nothing scrolls sideways', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await useSession(page, 'verma');
    await expect(page.getByRole('heading', { name: 'What to do next' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test.describe('another person’s page', () => {
  test('a colleague sees the page without the to-do list', async ({ page }) => {
    await useSession(page, 'verma');
    await page.goto(`/people/${colleague}`);
    await expect(page.getByRole('heading', { name: 'Publications by year' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'What to do next' })).toHaveCount(0);
  });

  test('a person from another department reads as not found, as does a made-up address', async ({ page }) => {
    await useSession(page, 'verma');
    await page.goto(`/people/${stranger}`);
    await expect(page.getByRole('heading', { name: 'This page cannot be opened' })).toBeVisible();
    await page.goto('/people/not-a-person');
    await expect(page.getByRole('heading', { name: 'This page cannot be opened' })).toBeVisible();
  });

  test('IQAC can open anyone’s page', async ({ page }) => {
    await useSession(page, 'iqac');
    await page.goto(`/people/${stranger}`);
    await expect(page.getByRole('heading', { name: 'Publications by year' })).toBeVisible();
  });
});
