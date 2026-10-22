import { defineConfig, devices } from '@playwright/test';
import type { GepOptions } from './fixtures/gepFixtures';
import { ENV, selectedMarketIds, selectedTestEnv } from './src/config/env';

// Headless (CI, HEADLESS=true): fixed 1920x1080 so every run renders the same layout.
// Headed (local): a maximised window sized to the screen, so the whole page stays in view.
// deviceScaleFactor is dropped because Playwright rejects it with a null viewport.
const { deviceScaleFactor: _deviceScaleFactor, ...desktopChrome } = devices['Desktop Chrome'];
const browserWindow = ENV.headless
  ? { viewport: { width: 1920, height: 1080 } }
  : { viewport: null, launchOptions: { args: ['--start-maximized'] } };

// TEST_ENV (default qa). QA keeps the usual folders (the heal and flow-check scripts read test-results/results.json);
// other environments write to <folder>-<env>, so QA, UAT and prod can run side by side without overwriting each other.
const testEnv = selectedTestEnv();
const runFolder = (folder: string) => (testEnv === 'qa' ? folder : `${folder}-${testEnv}`);

export default defineConfig<GepOptions>({
  testDir: './tests',
  timeout: ENV.timeout,
  expect: {
    timeout: 10000,
  },
  // Tests share one account (and so one cart) per market, so they run one after another.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,

  reporter: [
    ['list'],
    ['html', { outputFolder: runFolder('playwright-report'), open: 'never' }],
    ['monocart-reporter', { name: 'Automation Test Report', outputFile: `${runFolder('monocart-report')}/index.html` }],
    ['json', { outputFile: `${runFolder('test-results')}/results.json` }],
  ],

  use: {
    headless: ENV.headless,
    actionTimeout: 30000,
    navigationTimeout: ENV.timeout,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    ignoreHTTPSErrors: true,
  },

  projects: [
    // GEP: one project per market selected with MARKET in .env (default us), named <env>-<market>, e.g. qa-us.
    // The site URL comes from the test data database (market fixture), so there is no baseURL here.
    ...selectedMarketIds(testEnv).flatMap((marketId) => {
      const name = `${testEnv}-${marketId}`;
      const use = { ...desktopChrome, ...browserWindow, testEnv, marketId };
      const tests = {
        name,
        // GEP tests place real orders: on prod only the tests tagged @prod-safe run.
        ...(testEnv === 'prod' ? { grep: /@prod-safe/ } : {}),
        use,
      };
      if (!ENV.signInOnce) return [tests];
      // SIGN_IN_ONCE=true: <name>-auth-setup signs in once and saves the session before the tests,
      // <name>-auth-teardown signs out after the last one (tests/auth).
      return [
        { name: `${name}-auth-setup`, testMatch: /auth\.setup\.ts/, teardown: `${name}-auth-teardown`, use },
        { name: `${name}-auth-teardown`, testMatch: /auth\.teardown\.ts/, use },
        { ...tests, dependencies: [`${name}-auth-setup`] },
      ];
    }),
  ],

  outputDir: runFolder('test-results'),
});
