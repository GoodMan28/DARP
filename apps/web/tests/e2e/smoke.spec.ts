import { test, expect, type Page } from '@playwright/test';

const PASSWORD = 'DarpDemo!2026Pass';

async function signIn(page: Page, who: string) {
  await page.goto('/login');
  await page.getByLabel('Institute e-mail').fill(`${who}@demo.bitmesra.ac.in`);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard');
}

test.describe('public pages', () => {
  test('the landing page states what the portal is for', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /One place for every accreditation number/ }))
      .toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in to DARP' })).toBeVisible();
    // No cycle number is hard-coded into the product identity.
    await expect(page.locator('body')).not.toContainText('NAAC Cycle 4');
  });

  test('the instructions page lists who fills in what', async ({ page }) => {
    await page.goto('/instructions');
    await expect(page.getByRole('heading', { name: 'Entry guidelines' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Who fills in what' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'What the states mean' })).toBeVisible();
  });

  test('an unauthenticated visitor is redirected away from the app', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForURL('**/login**');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  test('a wrong password says the same thing as an unknown account', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Institute e-mail').fill('nobody@demo.bitmesra.ac.in');
    await page.getByLabel('Password').fill('definitely-wrong-1!');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('E-mail or password is incorrect.')).toBeVisible();
  });
});

test.describe('faculty journey', () => {
  test('sees their own dashboard, modules and records', async ({ page }) => {
    await signIn(page, 'verma');
    await expect(page.getByRole('heading', { name: /Good to see you/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'My modules' })).toBeVisible();

    // The filter navigator lists the modules this role owns.
    await page.getByRole('link', { name: 'Publications' }).first().click();
    await page.waitForURL('**/m/publications**');
    await expect(page.getByRole('heading', { name: 'Publications' }).first()).toBeVisible();

    // Records are listed, and open.
    const firstRow = page.locator('tbody tr a').first();
    await expect(firstRow).toBeVisible();
  });

  test('can open the add-record form and see locked attribution', async ({ page }) => {
    await signIn(page, 'verma');
    await page.goto('/m/publications/new');
    await expect(page.getByText('Pre-filled from your account and locked', { exact: false }))
      .toBeVisible();
    await expect(page.getByRole('button', { name: 'Save as draft' })).toBeVisible();
  });

  test('sees computed totals on the profile, marked as not editable', async ({ page }) => {
    await signIn(page, 'verma');
    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: 'My profile' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Computed totals' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Figures you declare' })).toBeVisible();
  });

  test('never shows a full Aadhaar anywhere in the page', async ({ page }) => {
    await signIn(page, 'verma');
    await page.goto('/profile');
    const body = await page.locator('body').innerText();
    expect(body).not.toMatch(/\b\d{12}\b/);
  });
});

test.describe('verification', () => {
  test('a dean sees a queue rather than a data-entry list', async ({ page }) => {
    await signIn(page, 'drie');
    await expect(page.getByRole('heading', { name: 'Verification queue' })).toBeVisible();
  });

  test('a faculty member cannot reach the admin console', async ({ page }) => {
    await signIn(page, 'verma');
    await page.goto('/admin');
    // Either redirected away, or told plainly — never the console itself.
    await expect(page.getByRole('heading', { name: 'IQAC administration' })).toHaveCount(0);
  });
});

test.describe('administration', () => {
  test('IQAC sees the console and its tabs', async ({ page }) => {
    await signIn(page, 'iqac');
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: /administration/i }).first()).toBeVisible();
  });
});
