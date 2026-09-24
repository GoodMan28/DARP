import { test, type Page } from '@playwright/test';

const PASSWORD = 'DarpDemo!2026Pass';
const DIR = 'test-results/shots';

async function signIn(page: Page, who: string) {
  await page.goto('/login');
  await page.getByLabel('Institute e-mail').fill(`${who}@demo.bitmesra.ac.in`);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard');
}

test('capture the screens', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${DIR}/01-landing.png`, fullPage: true });

  await page.goto('/login');
  await page.screenshot({ path: `${DIR}/02-login.png` });

  await page.goto('/instructions');
  await page.screenshot({ path: `${DIR}/03-instructions.png` });

  await signIn(page, 'verma');
  await page.screenshot({ path: `${DIR}/04-dashboard-faculty.png` });

  await page.goto('/m/publications');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${DIR}/05-module-list.png` });

  const row = page.locator('tbody tr a').first();
  if (await row.count()) {
    await row.click();
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${DIR}/06-record.png`, fullPage: true });
  }

  await page.goto('/m/publications/new');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${DIR}/07-record-form.png`, fullPage: true });

  await page.goto('/profile');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${DIR}/08-profile.png`, fullPage: true });

  await signIn(page, 'drie');
  await page.screenshot({ path: `${DIR}/09-dashboard-drie.png` });

  await signIn(page, 'hodcse');
  await page.screenshot({ path: `${DIR}/10-dashboard-hod.png` });

  await signIn(page, 'iqac');
  await page.screenshot({ path: `${DIR}/11-dashboard-iqac.png` });
  await page.goto('/admin');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${DIR}/12-admin.png` });
});
