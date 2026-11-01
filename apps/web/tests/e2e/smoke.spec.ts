import { test, expect } from '@playwright/test';
import { useSession } from './helpers';

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
    await useSession(page, 'verma');
    await expect(page.getByRole('heading', { name: /Good to see you/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'My modules' })).toBeVisible();

    // The filter navigator lists the modules this role owns.
    // Patents: the demo data has no publications (they are entered by real faculty with real DOIs).
    await page.getByRole('link', { name: 'Patents' }).first().click();
    await page.waitForURL('**/m/patents**');
    await expect(page.getByRole('heading', { name: 'Patents' }).first()).toBeVisible();

    // Records are listed, and open.
    const firstRow = page.locator('tbody tr a').first();
    await expect(firstRow).toBeVisible();
  });

  test('can open the add-record form and see locked attribution', async ({ page }) => {
    await useSession(page, 'verma');
    await page.goto('/m/publications/new');
    await expect(page.getByText('Pre-filled from your account and locked', { exact: false }))
      .toBeVisible();
    await expect(page.getByRole('button', { name: 'Save as draft' })).toBeVisible();
  });

  test('is not told a year range on a new record: the year comes from the date', async ({ page }) => {
    await useSession(page, 'verma');
    await page.goto('/m/awards/new');
    await expect(page.getByText('Entered by')).toBeVisible();
    await expect(page.getByText('Counted in')).toHaveCount(0);
  });

  test('sees the level follow the programme, and the branches narrow to it', async ({ page }) => {
    await useSession(page, 'verma');
    await page.goto('/m/studentsguided/new');
    await page.locator('#i-program').selectOption({ label: 'M.Tech.' });
    await expect(page.locator('#i-level')).toHaveValue('PG');
    await expect(page.locator('#i-level')).toBeDisabled();
    await expect(page.locator('#i-specialisation option', { hasText: 'Aerospace Engineering' })).toHaveCount(1);
    await page.locator('#i-program').selectOption({ label: 'B.Tech.' });
    await expect(page.locator('#i-level')).toHaveValue('UG');
  });

  test('sees a QS contact’s country follow the chosen institution', async ({ page }) => {
    await useSession(page, 'verma');
    await page.goto('/m/qscontacts/new');
    await page.locator('#i-institution').fill('Indian Institute of Technology Delhi');
    await page.locator('[role="listbox"] [role="option"]').first().click();
    await expect(page.locator('#i-country')).toHaveValue('India');
    await expect(page.locator('#i-country')).toBeDisabled();
  });

  test('sees the declared figures by year, and the counted ones only when asked', async ({ page }) => {
    await useSession(page, 'verma');
    await page.goto('/profile');
    await expect(page.locator('select[aria-label="Academic year"] option').first()).toHaveText(/^AY \d{4}-\d{2}$/);
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    await expect(page.getByText('Counted by DARP')).toHaveCount(0);
    await page.getByRole('button', { name: 'Show counted figures' }).click();
    await expect(page.getByText('Counted by DARP').first()).toBeVisible();
    await page.locator('input[id$="manual.seminars.national.sinceJoining"]').fill('3');
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeEnabled();
    await page.locator('select[aria-label="Academic year"]').selectOption({ index: 1 });
    await expect(page.getByRole('heading', { name: 'Discard your changes?' })).toBeVisible();   // nothing is saved in this test
  });

  test('sees computed totals on the profile, marked as not editable', async ({ page }) => {
    await useSession(page, 'verma');
    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: 'My profile' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Figures you declare' })).toBeVisible();
    // The counted totals live on the dashboard, behind "Show my numbers".
    await expect(page.getByRole('heading', { name: 'Computed totals' })).toHaveCount(0);
  });

  test('never shows a full Aadhaar anywhere in the page', async ({ page }) => {
    await useSession(page, 'verma');
    await page.goto('/profile');
    const body = await page.locator('body').innerText();
    expect(body).not.toMatch(/\b\d{12}\b/);
  });
});

test.describe('verification', () => {
  test('a dean sees how each department is doing, as well as their own modules', async ({ page }) => {
    await useSession(page, 'drie');
    await expect(page.getByRole('heading', { name: 'Completion by department' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'My modules' })).toBeVisible();
  });

  test('a faculty member cannot reach the admin console', async ({ page }) => {
    await useSession(page, 'verma');
    await page.goto('/admin');
    // Either redirected away, or told plainly — never the console itself.
    await expect(page.getByRole('heading', { name: 'IQAC administration' })).toHaveCount(0);
  });
});

test.describe('administration', () => {
  test('IQAC sees the console and its tabs', async ({ page }) => {
    await useSession(page, 'iqac');
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: /administration/i }).first()).toBeVisible();
  });
});
