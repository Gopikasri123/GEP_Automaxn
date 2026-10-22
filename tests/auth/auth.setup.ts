import fs from 'fs';
import { test } from '../../fixtures/gepFixtures';
import { AUTH_DIR, authFileFor } from '../../src/config/env';

/**
 * SIGN_IN_ONCE=true only (project <env>-<market>-auth-setup, see playwright.config.ts): runs before the tests of
 * the market, signs in once and saves the session (login + cookie consent) for the tests to start from.
 */

// Always start from a fresh browser, never from a session saved by an earlier run.
test.use({ storageState: { cookies: [], origins: [] } });

test('Sign in once and save the session', async ({ session, page, testEnv, marketId }) => {
  await test.step('Launch the website and clear the launch popups', () => session.openSite());
  await test.step('Sign in', () => session.login());
  await test.step('Save the signed-in session', async () => {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
    await page.context().storageState({ path: authFileFor(testEnv, marketId) });
  });
});
