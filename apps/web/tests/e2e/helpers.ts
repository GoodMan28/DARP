import { readFile } from 'node:fs/promises';
import type { Cookie, Page } from '@playwright/test';

export const PASSWORD = 'DarpDemo!2026Pass';

/** Every demo account a spec signs in as. auth.setup.ts signs each in once per run. */
export const ACCOUNTS = ['verma', 'drie', 'hodcse', 'iqac'] as const;
export type Account = (typeof ACCOUNTS)[number];

/**
 * Saved session per account. The login route allows 10 attempts a minute per address, so
 * specs reuse these instead of signing in through the form each time. test-results/ is
 * cleared at the start of every run and is git-ignored.
 */
export const authFile = (who: Account) => `test-results/.auth/${who}.json`;

/** Signs in through the login form. Only auth.setup.ts should need this. */
export async function signIn(page: Page, who: Account) {
  await page.goto('/login');
  await page.getByLabel('Institute e-mail').fill(`${who}@demo.bitmesra.ac.in`);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard');
}

/** Swaps in the account's saved session and lands on the dashboard, like a fresh sign-in. */
export async function useSession(page: Page, who: Account) {
  const state = JSON.parse(await readFile(authFile(who), 'utf8')) as { cookies: Cookie[] };
  await page.context().clearCookies();
  await page.context().addCookies(state.cookies);
  await page.goto('/dashboard');
}
