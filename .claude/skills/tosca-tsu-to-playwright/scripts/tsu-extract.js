// Part of the tosca-tsu-to-playwright skill: turns a Tosca subset export (.tsu) into readable text files, the input
// for converting it to Playwright. A .tsu is gzip-compressed JSON: {"Entities":[{ObjectClass, Surrogate, Attributes,
// Assocs}, ...]}, a graph of Tosca objects (folders, modules with their technical ids, test cases, test steps, values,
// reusable blocks, ...).
//
// Run from the project root:
//   node .claude/skills/tosca-tsu-to-playwright/scripts/tsu-extract.js [<file.tsu> ...] [--out <folder>]
//   no file: every .tsu in tosca-reports/, else in tosca-exports/
//   --out:   output folder (default tosca-exports/extracted)
// Output: <out>/<file name>/
//   modules.txt    every module (not the Tosca standard modules) with its controls and technical ids (Id, ClassName,
//                  InnerText, Tag, Value, RelativeId, ...): the source of the page object locators
//   testcases.txt  every test case, template instance and reusable block as a tree:
//                  STEP "<name>" -> module "<module>"  /  · <control> | value | AM=<action mode> | prop=<property>
//   executions.txt result of every execution log (1 = passed)
// ActionMode codes: 37 Input, 69 Verify, 101 WaitOn, 165 Buffer, 517 Select, 519 Constraint, 1 Insert/Do nothing.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Paths are relative to the folder the script is run from (the project root).
const ROOT = process.cwd();
let outArg = path.join('tosca-exports', 'extracted');
const fileArgs = [];
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--out') outArg = process.argv[++i];
  else fileArgs.push(process.argv[i]);
}
const OUT_ROOT = path.resolve(outArg);

function defaultInputs() {
  for (const dir of [path.join(ROOT, 'tosca-reports'), path.join(ROOT, 'tosca-exports')]) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.tsu')).map((f) => path.join(dir, f));
    if (files.length) return files;
  }
  return [];
}

function load(file) {
  const raw = fs.readFileSync(file);
  const text = raw[0] === 0x1f && raw[1] === 0x8b ? zlib.gunzipSync(raw).toString('utf8') : raw.toString('utf8');
  return JSON.parse(text.replace(/^﻿/, ''));
}

function extract(file) {
  const data = load(file);
  const by = new Map(data.Entities.map((e) => [e.Surrogate, e]));
  const get = (id) => by.get(id);
  const A = (e, k) => (e && e.Attributes ? e.Attributes[k] : undefined);
  const S = (e, k) => (e && e.Assocs && e.Assocs[k]) || [];
  const params = (e) =>
    S(e, 'Properties')
      .map(get)
      .filter((p) => p && p.ObjectClass === 'XParam')
      .map((p) => `${A(p, 'Name')}=${JSON.stringify(A(p, 'Value'))}`)
      .join('  ');
  const folderPath = (e) => {
    const parts = [];
    for (let cur = get(S(e, 'ParentFolder')[0]); cur; cur = get(S(cur, 'ParentFolder')[0])) parts.unshift(A(cur, 'Name'));
    return parts.join(' / ');
  };

  // ---------- modules ----------
  const modules = [];
  const attrTree = (id, depth) => {
    const a = get(id);
    if (!a) return;
    const vsg = A(a, 'ValueSelectionGroup');
    modules.push(`${'  '.repeat(depth)}- ${A(a, 'Name')}${vsg ? `  {values: ${vsg}}` : ''}  ${params(a)}`);
    for (const c of S(a, 'Attributes')) attrTree(c, depth + 1);
  };
  for (const m of data.Entities.filter((e) => e.ObjectClass === 'XModule')) {
    const where = folderPath(m);
    if (where.includes('Standard modules')) continue;
    modules.push(`\n## ${A(m, 'Name')}   (${where})`);
    modules.push(`module: ${params(m)}`);
    for (const a of S(m, 'Attributes')) attrTree(a, 0);
  }

  // ---------- test cases ----------
  const cases = [];
  const valueLine = (id, depth) => {
    const v = get(id);
    if (!v) return;
    const attr = get(S(v, 'ModuleAttribute')[0]);
    const name = A(v, 'ExplicitName') || A(attr, 'Name') || '?';
    const extra = ['Condition', 'ActionProperty', 'DisabledDescription']
      .filter((k) => A(v, k))
      .map((k) => `${k === 'ActionProperty' ? 'prop' : k}=${A(v, k)}`);
    cases.push(`${'  '.repeat(depth)}· ${name} | value=${JSON.stringify(A(v, 'Value'))} | AM=${A(v, 'ActionMode')} ${extra.join(' ')}`.trimEnd());
    for (const s of S(v, 'SubValues')) valueLine(s, depth + 1);
  };
  const item = (id, depth, expandBlocks) => {
    const e = get(id);
    if (!e) return;
    const pad = '  '.repeat(depth);
    const flags = ['Condition', 'Repetition', 'DisabledDescription'].filter((k) => A(e, k)).map((k) => `${k}=${A(e, k)}`).join(' ');
    if (e.ObjectClass === 'XTestStep') {
      cases.push(`${pad}STEP "${A(e, 'Name')}" -> module "${A(get(S(e, 'Module')[0]), 'Name')}" ${flags}`.trimEnd());
      for (const v of S(e, 'TestStepValues')) valueLine(v, depth + 1);
    } else if (e.ObjectClass === 'TestStepFolderReference') {
      const block = get(S(e, 'ReusedItem')[0]);
      const layer = get(S(e, 'ParameterLayerReference')[0]);
      const values = layer
        ? S(layer, 'AllParameterReferences').map(get).map((r) => `${A(get(S(r, 'Parameter')[0]), 'Name')}=${JSON.stringify(A(r, 'Value'))}`)
        : [];
      cases.push(`${pad}REUSE block "${A(block, 'Name')}" ${values.length ? `params: ${values.join(', ')}` : ''} ${flags}`.trimEnd());
      if (expandBlocks && block) for (const c of S(block, 'Items')) item(c, depth + 1, false);
    } else if (e.ObjectClass === 'TestCaseControlFlowItem') {
      cases.push(`${pad}CONTROL ${A(e, 'Name')} (max ${A(e, 'MaximumRepetitions') || '-'}) ${flags}`.trimEnd());
      for (const c of S(e, 'ControlFlowFolders')) item(c, depth + 1, expandBlocks);
    } else {
      cases.push(`${pad}${e.ObjectClass} "${A(e, 'Name')}" ${flags}`.trimEnd());
      for (const c of S(e, 'Items')) item(c, depth + 1, expandBlocks);
    }
  };
  for (const tc of data.Entities.filter((e) => ['ReuseableTestStepBlock', 'TestCase', 'TestCaseTemplateInstance'].includes(e.ObjectClass))) {
    const where = folderPath(tc);
    if (where.includes('Standard module examples')) continue;
    cases.push(`\n==================== ${tc.ObjectClass}: ${A(tc, 'Name')}   (${where || 'library'})  workstate=${A(tc, 'TestCaseWorkState') ?? '-'}`);
    for (const c of S(tc, 'Items')) item(c, 1, tc.ObjectClass === 'TestCase');
  }

  // ---------- executions ----------
  const executions = data.Entities.filter((e) => e.ObjectClass === 'ExecutionTestCaseLog').map(
    (e) => `${A(e, 'StartTime')}  result=${A(e, 'Result')}  ${A(e, 'Name')}`,
  );

  const outDir = path.join(OUT_ROOT, path.basename(file, path.extname(file)));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'modules.txt'), modules.join('\n') + '\n');
  fs.writeFileSync(path.join(outDir, 'testcases.txt'), cases.join('\n') + '\n');
  fs.writeFileSync(path.join(outDir, 'executions.txt'), executions.sort().join('\n') + '\n');
  const project = data.Entities.find((e) => e.ObjectClass === 'TCProject');
  console.log(`${path.relative(ROOT, file)} (Tosca project ${A(project, 'Name')}) -> ${path.relative(ROOT, outDir)}`);
  console.log(`  ${data.Entities.filter((e) => e.ObjectClass === 'TestCase').length} test cases, ${data.Entities.filter((e) => e.ObjectClass === 'XModule').length} modules, ${executions.length} execution logs`);
  // Rough size of what the model will read (about 3.7 characters per token for this text).
  const chars = ['modules.txt', 'testcases.txt', 'executions.txt'].reduce((n, f) => n + fs.readFileSync(path.join(outDir, f), 'utf8').length, 0);
  console.log(`  extracted text: ${chars} characters, about ${Math.round(chars / 3.7 / 1000)}K tokens`);
}

const inputs = fileArgs.length ? fileArgs : defaultInputs();
if (!inputs.length) {
  console.error('No .tsu file given and none found in tosca-reports/ or tosca-exports/.');
  process.exit(1);
}
inputs.forEach((file) => extract(path.resolve(file)));
