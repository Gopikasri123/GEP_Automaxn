import fs from 'fs';
import type { FullConfig } from '@playwright/test';
import { AUTH_DIR, authFileFor } from '../config/env';
import { marketRuns, withSiteSession } from './siteSession';

/**
 * SIGN_IN_ONCE=true only (see playwright.config.ts): runs ONCE before the first test, not as a test.
 * Per market: open the site, sign in, and save the session (login + cookie consent) for the tests to start from.
 * With CHROME_PROFILE=true the sign-in also lands in the shared Chrome profile.
 * A failure here stops the run before any test starts (no order is placed).
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  for (const run of marketRuns(config)) {
    const authFile = authFileFor(run.testEnv, run.marketId);
    // Always sign in from a fresh browser, never from a session left by an earlier run.
    fs.rmSync(authFile, { force: true });

    await withSiteSession(run, 'setup', async ({ page, session, step }) => {
      await step('Precondition: Launch the website and clear the launch popups', () => session.openSite());
      await step('Precondition: Sign in', () => session.login());
      await step('Save the signed-in session', async () => {
        fs.mkdirSync(AUTH_DIR, { recursive: true });
        await page.context().storageState({ path: authFile });
      });
    });
  }
}
