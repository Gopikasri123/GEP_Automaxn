import type { Market } from '../config/markets';
import { test } from '@playwright/test';
import { DEFAULT_USER_KEY, ENV, credentialsFor } from '../config/env';
import type { RegionBehaviour } from '../regions';
import type { GepHeader } from '../components/GepHeader';
import type { GepPopups } from '../components/GepPopups';
import type { GepHomePage } from '../pages/GepHomePage';
import type { GepLoginPage } from '../pages/GepLoginPage';
import { COMMON } from '../../data/common';

type Deps = {
  market: Market;
  region: RegionBehaviour;
  homePage: GepHomePage;
  header: GepHeader;
  popups: GepPopups;
  loginPage: GepLoginPage;
};

/**
 * Tosca: Preconditions (launch the website, sign in) and the post condition (sign out).
 * Flows don't create report steps themselves: each test wraps the calls in named test.step() blocks.
 */
export class GepSessionFlow {
  constructor(private readonly deps: Deps) {}

  /** Tosca: Precondition-Launch the HS Website. Opens the market's site and clears the launch popups. */
  async openSite(): Promise<void> {
    const { market, region, homePage, header, popups } = this.deps;
    await homePage.open(region.siteUrl(market));
    await region.clearLaunchPopups({ home: homePage, header, popups, market, signedInSession: ENV.signInOnce });
  }

  /**
   * Tosca: Sign in. Signs in as the market's 'default' user, or the user with this `userKey`
   * (test_accounts.user_key in the test data database, see credentialsFor).
   * SIGN_IN_ONCE=true: the saved session is already signed in as the default user, so this only signs in
   * when that session has expired.
   */
  async login(userKey?: string): Promise<void> {
    const { market, header, loginPage } = this.deps;
    if (ENV.signInOnce) {
      if (userKey && userKey !== DEFAULT_USER_KEY) {
        throw new Error(`SIGN_IN_ONCE=true shares the '${DEFAULT_USER_KEY}' user's session; run this '${userKey}' test without it.`);
      }
      if (await header.isLoggedIn()) {
        annotate('session', 'Signed in from the saved session (SIGN_IN_ONCE)');
        return;
      }
    }
    const { username, password } = await credentialsFor(market, userKey);
    await header.clickSignIn();
    await loginPage.login(username, password);
    await loginPage.answerSecurityQuestionsIfShown(COMMON.securityAnswer);
    await header.expectLoggedIn();
  }

  /**
   * Tosca: Post condition CloseBrowser (signs out on Gen Z sites only).
   * SIGN_IN_ONCE=true: skipped, so the shared session stays valid; the global teardown signs out after the last test.
   */
  async signOutAtEnd(): Promise<void> {
    if (ENV.signInOnce) return;
    await this.deps.region.signOutAtEnd(this.deps.header);
  }

  /** Signs out if signed in (the global teardown, after the last test). */
  async signOut(): Promise<void> {
    await this.deps.header.signOutIfLoggedIn();
  }
}

/** Adds a note to the running test's report; does nothing outside a test (global setup / teardown). */
function annotate(type: string, description: string): void {
  try {
    test.info().annotations.push({ type, description });
  } catch {
    // test.info() throws outside a test.
  }
}
