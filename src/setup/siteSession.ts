import fs from 'fs';
import path from 'path';
import {
  chromium,
  type Browser,
  type BrowserContext,
  type FullConfig,
  type FullProject,
  type Page,
  type PlaywrightTestOptions,
  type PlaywrightWorkerOptions,
} from '@playwright/test';
import type { GepOptions } from '../../fixtures/gepFixtures';
import { CHROME_PROFILE_DIR, ENV, resolveMarket } from '../config/env';
import type { Market, MarketId, TestEnv } from '../config/markets';
import { setExpectTimeoutOutsideTests } from '../core/BasePage';
import { regionFor } from '../regions';
import { GepHeader } from '../components/GepHeader';
import { GepPopups } from '../components/GepPopups';
import { GepHomePage } from '../pages/GepHomePage';
import { GepLoginPage } from '../pages/GepLoginPage';
import { GepSessionFlow } from '../flows/GepSessionFlow';

/**
 * Shared by the global setup and teardown (SIGN_IN_ONCE=true). They run once before the first test and once after
 * the last one, outside the test runner: they are not tests, so they are not counted or listed as tests.
 * Without the test fixtures, this file opens the browser the same way the fixtures do (fresh browser, or the
 * shared Chrome profile with CHROME_PROFILE=true) and builds the session flow itself.
 */

type ProjectUse = Partial<PlaywrightTestOptions & PlaywrightWorkerOptions & GepOptions>;

export type MarketRun = { testEnv: TestEnv; marketId: MarketId; project: FullProject };

/** One entry per environment + market in the config (the GEP projects), in config order. */
export function marketRuns(config: FullConfig): MarketRun[] {
  const runs = new Map<string, MarketRun>();
  for (const project of config.projects) {
    const { testEnv, marketId } = project.use as ProjectUse;
    if (!testEnv || !marketId) continue;
    const key = `${testEnv}-${marketId}`;
    if (!runs.has(key)) runs.set(key, { testEnv, marketId, project });
  }
  return [...runs.values()];
}

export type SiteSession = {
  market: Market;
  page: Page;
  session: GepSessionFlow;
  /** Runs one named step and logs it, like test.step in a test. */
  step: (name: string, action: () => Promise<unknown>) => Promise<void>;
};

/**
 * Opens a browser for one market, runs `work`, and closes the browser again. On failure it saves a screenshot to
 * <outputDir>/global-<label>-<env>-<market>.png and rethrows with the market in the message.
 * `storageState`: a saved session file to start from (ignored with CHROME_PROFILE=true: the profile has its own cookies).
 */
export async function withSiteSession(
  run: MarketRun,
  label: 'setup' | 'teardown',
  work: (site: SiteSession) => Promise<void>,
  storageState?: string,
): Promise<void> {
  const { testEnv, marketId, project } = run;
  const name = `${testEnv}-${marketId}`;
  const use = project.use as ProjectUse;
  setExpectTimeoutOutsideTests(ENV.expectTimeout);

  const headless = use.headless ?? ENV.headless;
  const { viewport, launchOptions, ignoreHTTPSErrors, userAgent } = use;
  let browser: Browser | undefined;
  let context: BrowserContext;
  if (ENV.chromeProfile) {
    // Only one Chrome can use the profile folder at a time: this one is closed again before the tests start.
    context = await chromium.launchPersistentContext(CHROME_PROFILE_DIR, { ...launchOptions, headless, viewport, ignoreHTTPSErrors });
  } else {
    browser = await chromium.launch({ ...launchOptions, headless });
    context = await browser.newContext({ viewport, userAgent, ignoreHTTPSErrors, storageState });
  }
  context.setDefaultTimeout(use.actionTimeout || 30000);
  context.setDefaultNavigationTimeout(use.navigationTimeout || ENV.timeout);
  const page = context.pages()[0] ?? (await context.newPage());

  let current = 'start';
  try {
    const market = await resolveMarket(marketId, testEnv);
    const session = new GepSessionFlow({
      market,
      region: regionFor(market.region),
      homePage: new GepHomePage(page),
      header: new GepHeader(page),
      popups: new GepPopups(page),
      loginPage: new GepLoginPage(page),
    });
    const step = async (stepName: string, action: () => Promise<unknown>) => {
      current = stepName;
      console.log(`[global ${label} ${name}] ${stepName}`);
      await action();
    };
    await work({ market, page, session, step });
  } catch (error) {
    const screenshot = path.join(project.outputDir, `global-${label}-${name}.png`);
    try {
      fs.mkdirSync(project.outputDir, { recursive: true });
      await page.screenshot({ path: screenshot });
    } catch {
      // The page may already be gone; the error below still says what failed.
    }
    const message = `Global ${label} failed for ${name} at "${current}": ${(error as Error).message}\nScreenshot: ${screenshot}`;
    throw Object.assign(new Error(message), { cause: error });
  } finally {
    await context.close();
    await browser?.close();
  }
}
