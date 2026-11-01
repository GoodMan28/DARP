import { test, expect } from '@playwright/test';
import { openAs, apiGet } from './helpers';

/*
 * Phase 7 of the visual-insights plan: the College page, and where the completion table went. Read-only.
 */
let someCode = '';
test.beforeAll(async ({ playwright }) => {
  const college = await apiGet(playwright, 'iqac', '/api/insights/college');
  someCode = college.data.departments[0].code;
});

test.describe('the College page', () => {
  test('IQAC sees the hero, all four tabs and the figures', async ({ page }) => {
    await openAs(page, 'iqac');
    await page.getByRole('link', { name: 'College', exact: true }).click();
    await page.waitForURL('**/college');
    await expect(page.getByRole('heading', { name: 'Birla Institute of Technology, Mesra' })).toBeVisible();
    for (const tab of ['Overview', 'Departments', 'Researchers', 'Data completion']) {
      await expect(page.getByRole('tab', { name: new RegExp(`^${tab}`) })).toBeVisible();
    }
    await expect(page.getByRole('heading', { name: 'Composition of output' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Projects and funding' })).toBeVisible();
    // The list of researchers by designation is not here, by IQAC's choice.
    await expect(page.getByText('Researchers & Scientists')).toHaveCount(0);
    await expect(page.getByText('researchers on record')).toHaveCount(0);
  });

  test('a department tile opens that department, and the table sorts', async ({ page }) => {
    await openAs(page, 'iqac');
    await page.goto('/college');
    await page.getByRole('tab', { name: /^Departments/ }).click();
    await expect(page.getByRole('columnheader', { name: /Publications/ })).toBeVisible();
    await page.getByRole('button', { name: 'Faculty' }).click();
    await expect(page.getByRole('button', { name: /Faculty ↓/ })).toBeVisible();
    await page.locator('[role="tabpanel"]:visible ul a').first().click();
    await page.waitForURL('**/department/**');
    await expect(page.getByRole('heading', { name: 'Publications by year' }).first()).toBeVisible();
  });

  test('the Researchers tab switches between publications and citations', async ({ page }) => {
    await openAs(page, 'dofa');
    await page.goto('/college');
    await page.getByRole('tab', { name: 'Researchers' }).click();
    await expect(page.getByRole('button', { name: 'Publications', pressed: true })).toBeVisible();
    await page.getByRole('button', { name: 'Citations' }).click();
    await expect(page.getByRole('button', { name: 'Citations', pressed: true })).toBeVisible();
  });

  test('the completion table is on the Data completion tab, no longer on the Overview', async ({ page }) => {
    await openAs(page, 'iqac');
    await expect(page.getByRole('heading', { name: 'Completion by department' })).toHaveCount(0);
    await page.goto('/college');
    await page.getByRole('tab', { name: 'Data completion' }).click();
    await expect(page.getByRole('heading', { name: 'Completion by department' })).toBeVisible();
  });

  test('counts the chosen years', async ({ page }) => {
    await openAs(page, 'iqac');
    await page.goto('/college?from=2024&to=2025');
    await expect(page.getByLabel('From year')).toHaveValue('2024');
  });

  test('fits a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openAs(page, 'iqac');
    await page.goto('/college');
    await expect(page.getByRole('heading', { name: 'Publications by year' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test.describe('who is sent away', () => {
  test('a faculty member, a head and CDC land on their Overview', async ({ page }) => {
    for (const who of ['verma', 'hodcse', 'cdc'] as const) {
      await openAs(page, who);
      await page.goto('/college');
      await page.waitForURL('**/dashboard');
    }
  });

  test('IQAC and a dean sent to /department land on the College page', async ({ page }) => {
    for (const who of ['iqac', 'dofa'] as const) {
      await openAs(page, who);
      await page.goto('/department');
      await page.waitForURL('**/college');
    }
  });

  test('a head sees their department’s data completion on the department page, CDC keeps it on the Overview', async ({ page }) => {
    await openAs(page, 'hodcse');
    await page.goto('/department');
    await expect(page.getByRole('heading', { name: 'Data completion' })).toBeVisible();
    await openAs(page, 'cdc');
    await expect(page.getByRole('heading', { name: 'Completion by department' })).toBeVisible();
    await page.goto(`/department/${someCode}`);
    await expect(page.getByRole('heading', { name: 'This page cannot be opened' })).toBeVisible();
  });
});
