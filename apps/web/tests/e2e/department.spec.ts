import { test, expect } from '@playwright/test';
import { openAs, apiGet } from './helpers';

/*
 * Phase 6 of the visual-insights plan: the department page and the sidebar links to it. Read-only.
 */
let mine = ''; let otherCode = '';

test.beforeAll(async ({ playwright }) => {
  mine = (await apiGet(playwright, 'verma', '/api/insights/me')).data.person.departmentCode;
  const college = await apiGet(playwright, 'iqac', '/api/insights/college');
  otherCode = (college.data.departments as Array<{ code: string }>).find((d) => d.code !== mine)!.code;
});

test.describe('who sees the links', () => {
  test('a faculty member sees My department and no College link', async ({ page }) => {
    await openAs(page, 'verma');
    await expect(page.getByRole('link', { name: 'My department', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'College', exact: true })).toHaveCount(0);
  });

  test('IQAC and a dean see College and no My department link; CDC sees neither', async ({ page }) => {
    for (const who of ['iqac', 'dofa'] as const) {
      await openAs(page, who);
      await expect(page.getByRole('link', { name: 'College', exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: 'My department', exact: true })).toHaveCount(0);
    }
    await openAs(page, 'cdc');
    await expect(page.getByRole('link', { name: 'College', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'My department', exact: true })).toHaveCount(0);
  });
});

test.describe('the department page', () => {
  test('shows the department, its four tabs and its figures', async ({ page }) => {
    await openAs(page, 'verma');
    await page.getByRole('link', { name: 'My department', exact: true }).click();
    await page.waitForURL('**/department');
    await expect(page.getByRole('heading', { name: 'Publications by year' }).first()).toBeVisible();
    for (const tab of ['Overview', 'Faculty', 'Research', 'Students and teaching']) {
      await expect(page.getByRole('tab', { name: new RegExp(`^${tab}`) })).toBeVisible();
    }
    await expect(page.getByRole('heading', { name: 'What the department published' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Top journals' })).toBeVisible();
    await page.getByRole('tab', { name: 'Research' }).click();
    await expect(page.getByText('Patents granted')).toBeVisible();
    await page.getByRole('tab', { name: 'Students and teaching' }).click();
    await expect(page.getByText('Ph.D. students guided')).toBeVisible();
  });

  test('lists the faculty as cards, finds one by name, and opens a person’s page', async ({ page }) => {
    await openAs(page, 'verma');
    await page.goto('/department');
    await page.getByRole('tab', { name: 'Faculty' }).click();
    await expect(page.getByRole('heading', { name: /\d+ faculty/ })).toBeVisible();
    const cards = page.locator('[role="tabpanel"]:visible li').filter({ has: page.getByRole('link', { name: 'Profile', exact: true }) });
    expect(await cards.count()).toBeGreaterThan(0);
    expect(await cards.count()).toBeLessThanOrEqual(12);
    await page.getByLabel('Find a person by name').fill('zzzz no such person');
    await expect(page.getByText('No people with that name yet.')).toBeVisible();
    await page.getByLabel('Find a person by name').fill('');
    await cards.first().getByRole('link', { name: 'Profile', exact: true }).click();
    await page.waitForURL('**/people/**');
    await expect(page.getByRole('heading', { name: 'Publications by year' })).toBeVisible();
  });

  test('counts the chosen years', async ({ page }) => {
    await openAs(page, 'verma');
    await page.goto('/department?from=2024&to=2025');
    await expect(page.getByLabel('From year')).toHaveValue('2024');
    await expect(page.getByLabel('To year')).toHaveValue('2025');
  });

  test('fits a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openAs(page, 'verma');
    await page.goto('/department');
    await expect(page.getByRole('heading', { name: 'Publications by year' }).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test.describe('another department', () => {
  test('is not found for a faculty member and a head, found for IQAC and a dean', async ({ page }) => {
    for (const who of ['verma', 'hodcse'] as const) {
      await openAs(page, who);
      await page.goto(`/department/${otherCode}`);
      await expect(page.getByRole('heading', { name: 'This page cannot be opened' })).toBeVisible();
      await page.goto(`/department/${mine}`);
      await expect(page.getByRole('heading', { name: 'Publications by year' }).first()).toBeVisible();
    }
    for (const who of ['iqac', 'dofa'] as const) {
      await openAs(page, who);
      await page.goto(`/department/${otherCode}`);
      await expect(page.getByRole('heading', { name: 'Publications by year' }).first()).toBeVisible();
    }
  });

  test('is not found for CDC, and for a code that does not exist', async ({ page }) => {
    await openAs(page, 'cdc');
    await page.goto(`/department/${mine}`);
    await expect(page.getByRole('heading', { name: 'This page cannot be opened' })).toBeVisible();
    await openAs(page, 'iqac');
    await page.goto('/department/NOPE');
    await expect(page.getByRole('heading', { name: 'This page cannot be opened' })).toBeVisible();
  });
});
