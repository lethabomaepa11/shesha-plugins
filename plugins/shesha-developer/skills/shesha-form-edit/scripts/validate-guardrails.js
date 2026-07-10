#!/usr/bin/env node
/**
 * validate-guardrails.js <form.json> [entity-metadata.json]
 *
 * Mechanical guardrails for the render-killers that recur in harness grading:
 *  - V-A1: form has a Submit action but no primary button; >1 primary inside one buttonGroup
 *  - V-A4: standalone `button` components carrying form actions outside a buttonGroup
 *  - V-J1: Navigate actions with a missing/empty target (renders <Link href=undefined>, crashes pages);
 *          PascalCase propertyNames (blank datatable cells / dead bindings);
 *          dataContext missing entityType/sourceType (HTTP 500 / "Fetching data…" hang)
 *  - missing validationErrors when any field is required
 *  - FK columns bound to the raw `…Id` scalar (renders GUIDs instead of names) [warn]
 *  - reflist-identity: a reference-list-bound component (dropdown/radio/checkboxGroup/refListStatus)
 *      whose referenceListId does NOT match the property's metadata `referenceListName`/`referenceListModule`
 *      (a guessed reflist name ⇒ the dropdown renders EMPTY at runtime, silently). FAIL when the
 *      optional metadata dump (arg 2, a cached Metadata/GetProperties response) is supplied and the
 *      identities disagree; WARN (unverified) when no metadata is supplied — pass it to enforce.
 *
 * Exit code 1 when any `fail` finding exists. No dependencies.
 */

import fs from 'fs';

const file = process.argv[2];
if (!file) { console.error('usage: node validate-guardrails.js <form.json> [entity-metadata.json]'); process.exit(2); }

let root = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
// Accept a full form object, a GetJson envelope, or a stringified markup wrapper.
if (typeof root.markup === 'string') root = JSON.parse(root.markup);
if (root.result && (root.result.markup || root.result.components)) {
  root = typeof root.result.markup === 'string' ? JSON.parse(root.result.markup) : root.result;
}

// Optional entity metadata (arg 2): a cached Metadata/GetProperties response — a direct property
// array, an ABP envelope (`result` / `result.properties`), or `{properties:[...]}`. When present it
// turns the reflist-identity check from a WARN (unverified) into a hard FAIL on mismatch.
let metaByProp = null;
const metaFile = process.argv[3];
if (metaFile) {
  try {
    let m = JSON.parse(fs.readFileSync(metaFile, 'utf8').replace(/^﻿/, ''));
    let props = Array.isArray(m) ? m
      : (m.result && Array.isArray(m.result) ? m.result
      : (m.result && Array.isArray(m.result.properties) ? m.result.properties
      : (Array.isArray(m.properties) ? m.properties : [])));
    metaByProp = {};
    for (const p of props) if (p && p.path) metaByProp[String(p.path).toLowerCase()] = p;
  } catch (e) { metaByProp = null; }
}
// Strip a leading module prefix off a full dotted reflist name (e.g. "A.Test.BookingStatus" → "BookingStatus").
const lastSeg = (dotted) => { const s = String(dotted || ''); const i = s.lastIndexOf('.'); return i >= 0 ? s.slice(i + 1) : s; };

const findings = [];
const add = (severity, check, target, issue) => findings.push({ severity, check, target, issue });

const FORM_ACTIONS = new Set(['Submit', 'Navigate', 'Cancel Edit', 'Start Edit', 'Show Dialog', 'Close Dialog', 'Back']);

let hasSubmit = false;
let hasPrimary = false;
let hasRequired = false;
let hasValidationErrors = false;

function actionName(node) {
  return (node && node.actionConfiguration && node.actionConfiguration.actionName) || null;
}

function hasNavigateDestination(args, node) {
  if (!args) args = {};
  // valid shapes: url navigation (target/targetUrl/url), or form navigation (formId {name,module})
  const t = args.target || args.targetUrl || args.url || (node && (node.targetUrl || node.target));
  if (t && String(t).trim() !== '') return true;
  const f = args.formId;
  if (f && (typeof f === 'string' ? f.trim() !== '' : f.name)) return true;
  return false;
}

function navigateTargetMissing(node) {
  // Any of the shapes a navigate can take: actionConfiguration, buttonAction, column action.
  const ac = node.actionConfiguration;
  if (ac && ac.actionName === 'Navigate') return !hasNavigateDestination(ac.actionArguments, node);
  if (node.buttonAction === 'navigate' || node.action === 'navigate') {
    return !hasNavigateDestination(ac && ac.actionArguments, node);
  }
  return false;
}

function label(node) {
  return node.componentName || node.propertyName || node.name || node.label || node.id || '(unnamed)';
}

const INPUT_TYPES = new Set(['textField', 'textArea', 'numberField', 'dateField', 'timeField', 'dropdown',
  'autocomplete', 'checkbox', 'checkboxGroup', 'radio', 'switch', 'entityPicker', 'fileUpload', 'rate', 'slider']);

const REFLIST_TYPES = new Set(['dropdown', 'radio', 'checkboxGroup', 'refListStatus']);

// Cross-check a reference-list-bound component's authored identity against the property's metadata.
function checkReflistIdentity(node) {
  const t = node.type;
  const boundToReflist = node.dataSourceType === 'referenceList' || !!node.referenceListId || t === 'refListStatus';
  if (!REFLIST_TYPES.has(t) || !boundToReflist) return;
  // Resolve the authored {module, name}
  let authMod, authName;
  if (node.referenceListId && typeof node.referenceListId === 'object') {
    authMod = node.referenceListId.module; authName = node.referenceListId.name;
  } else if (t === 'refListStatus') {
    authMod = node.module || (node.referenceList && node.referenceList.module);
    authName = node.referenceListName ? lastSeg(node.referenceListName) : (node.referenceList && node.referenceList.name);
  }
  if (!metaByProp) {
    add('warn', 'reflist-identity', label(node), 'reference-list binding NOT verified against metadata — re-run with the entity metadata dump as arg 2, and confirm referenceListId came from the property\'s referenceListName/Module (never guessed from the property/entity name)');
    return;
  }
  const p = node.propertyName && metaByProp[String(node.propertyName).toLowerCase()];
  if (!p) { add('warn', 'reflist-identity', label(node), `property "${node.propertyName}" not found in metadata — cannot verify reflist identity`); return; }
  if (!p.referenceListName) { add('warn', 'reflist-identity', label(node), `property "${node.propertyName}" has no referenceListName in metadata — is this really a reference-list property?`); return; }
  const expMod = p.referenceListModule || null;
  const expName = lastSeg(p.referenceListName);
  const nameMismatch = authName && expName && authName !== expName;
  const modMismatch = authMod && expMod && authMod !== expMod;
  if (nameMismatch || modMismatch) {
    add('fail', 'reflist-identity', label(node),
      `authored referenceList {module:${authMod}, name:${authName}} does not match the property's metadata (${expMod}.${expName}) — the dropdown will render EMPTY at runtime. Copy referenceListName/referenceListModule from metadata verbatim; never guess.`);
  }
}

function walkItems(items, groupCtx) {
  for (const it of items || []) {
    if (!it || typeof it !== 'object') continue;
    if (actionName(it) === 'Submit') { hasSubmit = true; if (groupCtx) groupCtx.hasSubmit = true; }
    if (it.buttonType === 'primary') { hasPrimary = true; if (groupCtx) groupCtx.primaries++; }
    if (navigateTargetMissing(it)) add('fail', 'navigate-target', label(it), 'Navigate action has an empty/missing target — renders <Link href=undefined> and crashes the page');
    // datatable data columns
    if ((it.columnType === 'data' || (it.propertyName && it.itemType === 'item' && it.columnType))
        && it.propertyName && /^[A-Z]/.test(it.propertyName)) {
      add('fail', 'pascalcase-column', it.propertyName, 'Datatable column propertyName starts uppercase — cells render blank (GQL keys are camelCase)');
    }
    if (it.columnType === 'data' && it.propertyName && /[a-z]Id$/.test(it.propertyName)) {
      add('warn', 'fk-scalar-column', it.propertyName, 'Column bound to the raw FK `…Id` scalar — renders GUIDs; bind the object property (e.g. `person` not `personId`)');
    }
    if (it.childItems) walkItems(it.childItems, groupCtx);
    if (it.components) walkTree(it.components, 'buttonGroup-item');
  }
}

function walkTree(nodes, parentType) {
  for (const node of nodes || []) {
    if (!node || typeof node !== 'object') continue;
    if (!node.type) { walkTree(node.components, parentType); continue; } // columns slot
    const t = node.type;

    if (node.validate && node.validate.required === true) hasRequired = true;
    if (t === 'validationErrors') hasValidationErrors = true;

    if (t === 'button') {
      const an = actionName(node);
      if (an && FORM_ACTIONS.has(an)) {
        add('fail', 'standalone-button', label(node), `Standalone button carries form action "${an}" — must be a buttonGroup item (misreads form intent, breaks layout, may never fire)`);
      }
      if (node.buttonType === 'primary') hasPrimary = true;
      if (actionName(node) === 'Submit') hasSubmit = true;
    }

    if (t === 'buttonGroup') {
      const ctx = { primaries: 0, hasSubmit: false };
      walkItems(node.items, ctx);
      if (ctx.primaries > 1) add('fail', 'multi-primary', label(node), `buttonGroup has ${ctx.primaries} primary buttons — exactly one primary per action zone`);
      if (ctx.hasSubmit && ctx.primaries === 0) add('fail', 'no-primary', label(node), 'buttonGroup contains Submit but no buttonType:"primary" item');
    }

    if (t === 'dataContext' || t === 'datatableContext') {
      if (!node.entityType && (!node.sourceType || node.sourceType === 'Entity')) {
        add('fail', 'datacontext-entity', label(node), 'dataContext missing entityType — causes HTTP 500 / permanent "Fetching data…" on load');
      }
      if (!node.sourceType) {
        add('fail', 'datacontext-source', label(node), 'dataContext missing sourceType (use "Entity" with entityType, or "Url" with an endpoint)');
      }
    }

    if (INPUT_TYPES.has(t) && node.propertyName && /^[A-Z]/.test(node.propertyName)) {
      add('fail', 'pascalcase-property', node.propertyName, 'Input propertyName starts uppercase — GQL field keys are camelCase; the binding silently fails');
    }

    checkReflistIdentity(node);

    if (navigateTargetMissing(node)) add('fail', 'navigate-target', label(node), 'Navigate action has an empty/missing target — renders <Link href=undefined> and crashes the page');

    // recurse every slot shape
    walkTree(node.components, t);
    walkTree(node.columns, t);
    if (node.tabs) for (const tab of node.tabs) walkTree(tab.components, t);
    if (node.content && node.content.components) walkTree(node.content.components, t);
    if (node.header && node.header.components) walkTree(node.header.components, t);
    if (node.items && t !== 'buttonGroup') walkItems(node.items, null); // datatable columns etc.
  }
}

walkTree(root.components, 'root');

if (hasSubmit && !hasPrimary) add('fail', 'no-primary', '(form)', 'Form has a Submit action but no primary button anywhere (V-A1)');
if (hasRequired && !hasValidationErrors) add('fail', 'validation-errors', '(form)', 'Form has required fields but no validationErrors component — a failed submit renders nothing');

const fails = findings.filter(f => f.severity === 'fail');
const warns = findings.filter(f => f.severity === 'warn');
for (const f of findings) console.log(`${f.severity.toUpperCase()}  [${f.check}] ${f.target}: ${f.issue}`);
console.log(`\n${fails.length} fail, ${warns.length} warn — ${file}`);
process.exit(fails.length ? 1 : 0);
