import { test as setup } from '@playwright/test';
import { ACCOUNTS, authFile, signIn } from './helpers';

for (const who of ACCOUNTS) {
  setup(`sign in as ${who}`, async ({ page }) => {
    await signIn(page, who);
    await page.context().storageState({ path: authFile(who) });
  });
}
