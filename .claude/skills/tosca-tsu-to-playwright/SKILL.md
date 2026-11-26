---
name: tosca-tsu-to-playwright
description: Use whenever the user uploads, attaches or points to a Tosca subset export (.tsu file), even with no instruction. Extracts the test cases, modules and technical ids with a bundled script, writes a manual test case per Tosca test case and then a Playwright test in this project (GEP_Automaxn), creating the folders an application needs, without stopping for review, checks the flow, and reports what was created.
---

# Tosca subset (.tsu) → manual test case → Playwright test (no review stop)

All conversions go into **this project** (`GEP_Automaxn`, the repo root), following its framework and `CLAUDE.md`.
GEP test cases use the existing GEP code; any other application gets its own folders here (Stage 1), created the
first time and reused after that.

A `.tsu` is a **gzip-compressed JSON** graph of Tosca objects: folders, modules with their **technical ids** (Id,
ClassName, InnerText, Tag, Value, RelativeId), test cases, template instances (TestSheet rows), reusable blocks, test step
values and execution logs. Unlike an execution report it has the locator data, so locators can be filled at once.

Do the whole conversion in one go; do **not** stop between stages to ask. Record every question under Open Questions /
Deviations and continue (see "Where you would ask").

## Keep the token use low (read this first)
A typical `.tsu` is 3-4 million tokens when decompressed (about 70% is attached screenshots/logs in base64); the
extracted text is about 30K tokens. Most cost comes from long conversations, not from the file.
- **Never read the `.tsu` or its decompressed JSON** (no `cat`, `Read`, `zcat`, or JSON dumps in the chat). Use only the
  extractor output, and `grep` it for the module or test case you are working on instead of reading it whole.
- Convert **one test case at a time**: read its tree in `testcases.txt`, only the modules it uses in `modules.txt`.
- Check locators on the live site with **one** request per page (`curl -s <url> | grep -nE '<id1>|<id2>|...'`), not
  one per locator. Never paste whole pages.
- Reuse what exists: page objects, flows (Precondition / Postcondition), fixtures and helpers already in `src/` for the
  same application. Read only the files you extend.
- Write each file once, completely; group independent writes and checks in one response.
- Skip what is not to be converted (see Stage 1) before reading any of it.

## Stage 0 — Extract
From the project root:
`node .claude/skills/tosca-tsu-to-playwright/scripts/tsu-extract.js <file.tsu>`
(no file: every `.tsu` in `tosca-reports/`; `--out <folder>` changes the output folder). It writes
`tosca-exports/extracted/<file name>/` and prints "about NK tokens" for the extracted text. Add `tosca-exports/` to
`.gitignore` if it is not there (the output can be regenerated from the `.tsu`).
- `testcases.txt`: every test case, template instance and reusable block as a tree, with a header line per object
  (`==== TestCase: <name>   (<folder>)  workstate=<n>`). Template instances are the variants of a test case.
- `modules.txt`: every non-standard module with its controls and technical ids (the locator source).
- `executions.txt`: last results (`result=1` passed).

### Reading the tree
- `STEP "<name>" -> module "<module>"`, then one line per control: `· <control> | value=… | AM=<action mode> | prop=…`.
- ActionMode: 37 Input (type/click), 69 Verify, 101 WaitOn, 165 Buffer, 517 Select, 519 Constraint (picks the table row
  whose cell matches), 1 Insert / do nothing.
- `REUSE block "<name>" params: …`: a reusable block (e.g. Precondition = open + login, Postcondition = logout + close);
  its steps follow, indented. Business Parameters (Email, Password) go to `.env`, never into code or data.
- `CONTROL While/If (max n)`: loops and conditions; `Condition=` on a step or folder = only run when true (often a
  TestSheet value, e.g. `'DisplayBy Size' != 4`).
- Values: `#n` = n-th match of the control; `{B[x]}` buffer; `{XB[x]}` buffer extracted from a pattern; `{PL[x]}`
  reusable block parameter; `{XL[x]}` TestSheet value; `{RND[n]}` random n digits; `{DATE[][][fmt]}` date;
  `{CALC[…]}` arithmetic; `{Click}`, `{PGDN}` actions/keys. `*` in a verify value is a wildcard.
- Standard modules (OpenUrl, CloseBrowser, TBox Wait, TBox Set Buffer, TBox Take Screenshot, TBox File Existence,
  TBox Excel…, Send Mail, Receive Mail…) are not in `modules.txt`; their values are in the step lines.

## Stage 1 — Choose the test cases and where they go
List the `TestCase` headers. **Convert** the test cases of the application(s) the user asked for (all, if they named
none). **Do not convert**, and say why in the final table: the Tosca example folders ("Standard module examples"),
test cases with workstate "In work" (1) that never ran when a completed version exists, and applications the user
excluded.

Where the code goes, by the application under test (from the OpenUrl value):
- **GEP (Henry Schein, `*.eschein.com`)**: the existing GEP code: pages `src/pages/`, components `src/components/`,
  flows `src/flows/`, regions `src/regions/`, data `data/testCases.ts` / `data/marketData.ts`, fixtures
  `fixtures/gepFixtures.ts`. Specs: **one file per feature area**, `tests/<area>/GEP_<Area>.spec.ts`, chosen by what
  the test mainly validates; add to the area's file when it exists, else create the folder and file (rules: `CLAUDE.md`,
  "GEP test placement"). Data per area: `data/<area>TestCases.ts` (`orders`: `data/testCases.ts`). **Never run** GEP
  tests: they place real orders.
- **Any other application** (`<app>` = short lower-case name, e.g. `demo`, `zoho`): create, the first time, and reuse
  after that:
  - `src/<app>/pages/`, `src/<app>/components/`, `src/<app>/flows/`, and `src/<app>/config.ts` (base URL and
    credentials read from the shared root `.env` with an `<APP>_` prefix, e.g. `DEMO_BASE_URL`, `DEMO_EMAIL`;
    load `.env` with dotenv like `src/config/env.ts` does, and fail with a clear message when a value is missing).
  - `data/<app>/<id>.json` per test case, typed in `data/<app>/<app>TestCases.ts`.
  - `fixtures/<app>Fixtures.ts` (constructs the pages and flows only; tests import `test` / `expect` from it).
  - `tests/<app>/<ID>_<Name>.spec.ts`.
  - In `playwright.config.ts`: a project `{ name: '<app>', testDir: './tests/<app>', use: { ...desktopChrome,
    ...browserWindow, baseURL } }`, and `testIgnore: ['**/<app>/**']` on the GEP market projects so GEP runs do not
    pick up these tests. Add an npm script `test:<app>`.
  - In `scripts/generate-locators-report.js`: add `src/<app>` to `SOURCE_DIRS`.
  - The `.env` keys also go in `.env.example` (if it exists) without values. Never print `.env`.
- Shared for all applications: `src/core/BasePage.ts` / `BaseComponent.ts` (page objects extend them; only add a small
  generic method to `BasePage` when no existing one fits, and say so), `src/utils/` for non-browser helpers.
- Manual test cases: directly in `manual-test-cases/` (`verify_flow.mjs` reads no subfolders), named `<ID>.md` for GEP
  IDs (e.g. `GEP2-36899.md`) and `<APP>_<ID>.md` for others (e.g. `DEMO_TC01.md`). Create the folder if it is missing.

## Stage 2 — Duplicate check (per test case)
A test case with an existing manual test case for its ID, or a spec tagged `@<ID>` (for another application:
`@<APP>_<ID>`), is **already converted**: do not regenerate or overwrite. Compare the step table and test data with the
extracted tree; same → "already converted, no change"; different → write `review-needed/<ID>.changes.md` (changed /
added / removed steps and data) and leave the user to decide. A new template instance of a converted test case is a
data change to report, not a new spec.

## Stage 3 — Manual test case
Format (as in `.claude/commands/tosca-report-to-manual.md`): header table (ID, title, Tosca source path, status, last
execution), **Variants** (one row per template instance), **Test data** (each value with its Tosca source),
**Preconditions**, the step table `| # | Action | Test Data | Expected Result | Notes/Tag |`, Post-conditions,
Expected Final Result, **Exceptions summary**, **Traceability check** (Tosca steps → manual steps) and **Review Notes**.
- One manual step per Tosca test step, in order. Fold WaitOn steps into the expected result; leave out plumbing
  (TBox Wait, Set/Delete Buffer that only hold a value, connect steps that belong to the next step).
- A loop is one step, or a step with sub-steps (`8`, `8.1`, `8.2`) when its body has several actions.
- Steps Playwright cannot do (Excel, mail, file system, desktop windows): tag `[NOT PLAYWRIGHT-SUPPORTED]` and give the
  alternate (exceljs, nodemailer / imapflow, Node.js `fs`, Playwright download).
- **Review Notes**: every problem you see in the Tosca script, without fixing it: odd actions (e.g. ticking "Remove" on
  the item being ordered), expired or hard-coded data, loop limits the data now exceeds, fixed waits, encrypted passwords
  (they cannot be read back: `.env`), steps that pass on stale files, ambiguous `#1` matches. Keep Tosca's behaviour.

## Stage 4 — Playwright test
Follow `.claude/commands/manual-to-playwright.md` and the framework rules in `CLAUDE.md` (read the existing code for
examples: `src/pages/`, `tests/orders/GEP_Orders.spec.ts`):
- **Locators** from the Tosca technical ids, **checked on the live site** where it is reachable (GEP pages sit behind a
  login: use the Tosca ids and the existing page objects, do not log in yourself). Each a `private` getter (or private
  method taking a value) with `// Tosca: <module> > <control>   | <hint>` directly above it. Act only through
  `BasePage` methods. Prefer `data-test-id` (GEP) or role/label/text, then the Tosca Id, then a class scoped to its
  container. Tosca matched exact class strings, CSS-transformed text (e.g. "BOOKS" for "Books": use a case-insensitive
  name) and relative anchors (RelativeId): scope to the container instead. A locator you cannot see or derive gets
  `this.todo(...)`, never a guess.
- **Data**: template instances as an array in the test case's data; the spec loops over the variants, one Playwright
  test each. Credentials and mail passwords only in `.env`.
- **Spec**: `// @manual manual-test-cases/<file>.md` above the test(s); `test.step('Step N: …')` per manual step; a step
  with no code of its own (e.g. close the browser) gets `// @flow-deviation N: <reason>`. The Precondition /
  Postcondition reusable blocks every test shares (open + login + clear cart, logout + close) go in the describe's
  `test.beforeEach` / `test.afterEach`, not in the test body: each test marks those steps with
  `// @flow-hook <steps>: beforeEach|afterEach (…)` (see `manual-to-playwright.md`, "SETUP AND TEARDOWN", and
  `tests/orders/GEP_Orders.spec.ts`). Never write setup or teardown as a `test(...)`. Conditional steps
  (`Condition=`) stay numbered and return early when the condition is false. Tags: `@<ID>` (`@<APP>_<ID>` for other
  applications), `@<app>`, the area, plus `@placesOrder` / `@email` for tests with side effects.
- Non-browser steps go to `src/utils/` helpers. Load optional packages (exceljs, nodemailer, imapflow) on use with a
  dynamic `import(name)` through a variable, so the project type-checks without them, and add them to `package.json`
  devDependencies (tell the user to run `npm install`).
- Then `npm run typecheck`, `npm run locators` (0 TODO is the goal for non-GEP apps) and `npm run list`.

## Stage 5 — Flow check and one run
- `node verify_flow.mjs <manual file name>` (add `--no-ai` when the user wants it cheaper). Never edit the manual test
  case to make it pass.
- **GEP: never run.** Other applications: run each new test **once** (`npx playwright test --project=<app> --grep
  @<APP>_<ID>`); tests that place orders or send mail only if the user asked. Fix only your own mistakes (wrong locator,
  typo); report site or data problems.

## Where you would ask
Do not pause. Make the smallest safe choice (keep Tosca's behaviour, leave a hint or TODO), and list it in the final
message.

## Final message
Short. First a table, one row per Tosca test case in the `.tsu`: `| Tosca test case | Result |` (converted → `<ID>`,
already converted, not converted + why). Then: files created or changed (including config, locator report script,
package.json), typecheck / locator / flow-check results, the run result (or not run and why), the Review Notes that will
likely make a test fail, the `[NOT PLAYWRIGHT-SUPPORTED]` alternates, and the extracted size (from the extractor's
"about NK tokens" line). Nothing is committed.
