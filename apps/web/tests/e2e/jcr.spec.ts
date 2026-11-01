import { existsSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { openAs } from './helpers';

/*
 * Phase 1 of the visual-insights plan, in the browser: IQAC uploads the Journal Citation Reports PDF, a
 * faculty member's paper form finds the Impact Factor by the journal's name, uploading again replaces the
 * year, and removing the list takes the figure away at once. It needs the real PDF (Clarivate's licensed
 * data, never kept in the repository): set JCR_PDF, or leave it in Downloads. It changes the test database, so
 * it runs on the private test copy only (node scripts/e2e-copy.mjs).
 */
const PDF = process.env.JCR_PDF ?? 'C:/Users/Abhineet Anand/Downloads/IF2025 JCR_260526_122208_260526_122357.pdf';
test.skip(!process.env.E2E_NO_SERVERS, 'changes the database: run it on the test copy (node scripts/e2e-copy.mjs)');
test.skip(!existsSync(PDF), `the JCR PDF is not at ${PDF}`);
test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);

const journalRow = (page: import('@playwright/test').Page) => page.locator('tr', { hasText: 'Journal Citation Reports' }).first();

async function upload(page: import('@playwright/test').Page) {
  await page.getByLabel('Journal Citation Reports PDF').setInputFiles(PDF);
  await page.getByRole('button', { name: 'Upload' }).click();
  await expect(page.getByText(/JIF \d{4} loaded/)).toBeVisible({ timeout: 180_000 });
}

test('IQAC uploads the PDF and sees how many journals were read', async ({ page }) => {
  await openAs(page, 'iqac');
  await page.goto('/admin?tab=journals');
  await upload(page);
  await expect(page.getByText(/journals read\. [\d,]+ were matched to ISSNs/)).toBeVisible();
  await expect(journalRow(page)).toContainText(/JIF \d{4} · [\d,]+ journals/);
});

test('a paper form finds the Impact Factor by the journal’s name when there is no ISSN', async ({ page }) => {
  await openAs(page, 'verma');
  await page.goto('/m/publications/new');
  await page.locator('#i-journal').fill('Nature');
  const jif = page.locator('#rank-manualJif');
  await expect(jif).toHaveValue(/^\d+(\.\d+)?$/, { timeout: 15_000 });
  await expect(page.getByText('Found by the journal’s name, not its ISSN: check it.')).toBeVisible();
  await expect(page.locator('#rank-manualJifQuartile')).toHaveValue('Q1');
});

test('a figure the faculty member changes is highlighted and can be taken back', async ({ page }) => {
  await openAs(page, 'verma');
  await page.goto('/m/publications/new');
  await page.locator('#i-journal').fill('Nature');
  const jif = page.locator('#rank-manualJif');
  await expect(jif).toHaveValue(/^\d/, { timeout: 15_000 });
  const fromList = await jif.inputValue();
  await jif.fill('1.5');
  await expect(page.getByText(/Changed by you; the lists say/)).toBeVisible();
  await page.getByRole('button', { name: /Use the list/i }).first().click();
  await expect(jif).toHaveValue(fromList);
});

test('a journal that is in no list asks for the figure to be typed', async ({ page }) => {
  await openAs(page, 'verma');
  await page.goto('/m/publications/new');
  await page.locator('#i-journal').fill('Journal Of Things Nobody Ever Printed 4471');
  await expect(page.getByText('Not in the journal lists. Enter it if you know it.').first()).toBeVisible({ timeout: 15_000 });
  await page.locator('#rank-manualJif').fill('2.5');
  await expect(page.getByText('Typed by you; the lists do not have it').first()).toBeVisible();
});

test('uploading the PDF again replaces the year instead of adding to it', async ({ page }) => {
  await openAs(page, 'iqac');
  await page.goto('/admin?tab=journals');
  const before = await journalRow(page).innerText();
  await upload(page);
  await page.reload();
  expect(await journalRow(page).innerText()).toBe(before);
});

test('removing the list takes the Impact Factor away from the paper form at once', async ({ page }) => {
  await openAs(page, 'iqac');
  await page.goto('/admin?tab=journals');
  await page.getByText(/Uploaded files \(\d+\)/).click();                       // the list of uploads is folded away
  const uploaded = page.locator('tr', { hasText: /JCR|Impact Factor/ }).filter({ has: page.getByRole('button', { name: 'Remove' }) }).last();
  await uploaded.getByRole('button', { name: 'Remove' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText(/removed\./)).toBeVisible();

  await openAs(page, 'verma');
  await page.goto('/m/publications/new');
  await page.locator('#i-journal').fill('Nature');
  await expect(page.getByText('Not in the journal lists. Enter it if you know it.').first()).toBeVisible({ timeout: 15_000 });
});
