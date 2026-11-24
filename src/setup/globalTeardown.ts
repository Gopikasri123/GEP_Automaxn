import fs from 'fs';
import type { FullConfig } from '@playwright/test';
import { authFileFor, resolveMarket } from '../config/env';
import { marketRuns, withSiteSession } from './siteSession';

/**
 * SIGN_IN_ONCE=true only (see playwright.config.ts): runs ONCE after the last test, not as a test.
 * Per market: sign out of the shared session (Gen Z only; Tosca post condition: Gen X / Y just close the browser)
 * and delete the saved session file.
 * A failed sign-out is logged as a warning and does not fail the run: the tests have already finished, and the
 * heal script reads the run's exit code as the test result.
 */
export default async function globalTeardown(config: FullConfig): Promise<void> {
  for (const run of marketRuns(config)) {
    const authFile = authFileFor(run.testEnv, run.marketId);
    try {
      if (!fs.existsSync(authFile)) continue; // The global setup did not finish for this market.
      const market = await resolveMarket(run.marketId, run.testEnv);
      if (market.region !== 'genz') continue; // No browser needed on Gen X / Y.

      await withSiteSession(
        run,
        'teardown',
        async ({ session, step }) => {
          await step('Post-condition: Launch the website', () => session.openSite());
          await step('Post-condition: Sign out', () => session.signOut());
        },
        authFile,
      );
    } catch (error) {
      console.warn(`⚠ ${(error as Error).message}`);
    } finally {
      fs.rmSync(authFile, { force: true });
    }
  }
}
