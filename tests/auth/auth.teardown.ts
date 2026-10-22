import fs from 'fs';
import { test } from '../../fixtures/gepFixtures';
import { authFileFor } from '../../src/config/env';

/**
 * SIGN_IN_ONCE=true only (project <env>-<market>-auth-teardown, see playwright.config.ts): runs after the last
 * test of the market, signs out of the shared session and deletes the saved session file.
 */
test('Sign out and remove the saved session', async ({ session, testEnv, marketId }) => {
  const authFile = authFileFor(testEnv, marketId);
  test.skip(!fs.existsSync(authFile), 'No saved session: the auth setup did not finish.');
  try {
    await test.step('Launch the website', () => session.openSite());
    await test.step('Sign out', () => session.signOut());
  } finally {
    fs.rmSync(authFile, { force: true });
  }
});
