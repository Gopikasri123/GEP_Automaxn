import fs from 'fs';
import { test } from '../../fixtures/gepFixtures';
import { authFileFor } from '../../src/config/env';

/**
 * SIGN_IN_ONCE=true only (project <env>-<market>-auth-teardown, see playwright.config.ts): runs after the last
 * test of the market, signs out of the shared session (Gen Z only) and deletes the saved session file.
 */

test.describe('Sign out (Gen Z only)', () => {
  // Tosca post condition: only Gen Z sites sign out; Gen X / Y just close the browser. The condition only needs the
  // market, so on Gen X / Y no browser is opened at all (that saved about a minute per run).
  test.skip(({ market }) => market.region !== 'genz', 'Gen X / Y sites do not sign out at the end (Tosca: close the browser).');

  test('Sign out of the saved session', async ({ session, testEnv, marketId }) => {
    test.skip(!fs.existsSync(authFileFor(testEnv, marketId)), 'No saved session: the auth setup did not finish.');
    await test.step('Launch the website', () => session.openSite());
    await test.step('Sign out', () => session.signOut());
  });
});

// Uses no browser fixture, so it runs even when the sign-out above was skipped or failed.
test('Remove the saved session', async ({ testEnv, marketId }) => {
  fs.rmSync(authFileFor(testEnv, marketId), { force: true });
});
