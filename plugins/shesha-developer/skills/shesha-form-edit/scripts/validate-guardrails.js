#!/usr/bin/env node
/**
 * validate-guardrails.js <form.json>
 *
 * Mechanical guardrails for the render-killers that recur in harness grading:
 *  - V-A1: form has a Submit action but no primary button; >1 primary inside one buttonGroup
 *  - V-A4: standalone `button` components carrying form actions outside a buttonGroup
 *  - V-J1: Navigate actions with a missing/empty target (renders <Link href=undefined>, crashes pages);
 *          PascalCase propertyNames (blank datatable cells / dead bindings);
 *          dataContext missing entityType/sourceType (HTTP 500 / "Fetching data…" hang)
 *  - missing validationErrors when any field is required
 *  - FK columns bound to the raw `…Id` scalar (renders GUIDs instead of names) [warn]
 *
 * Exit code 1 when any `fail` finding exists. No dependencies.
 */

import fs from 'fs';

const file = process.argv[2];
if (!file) { console.error('usage: node validate-guardrails.js <form.json>'); process.exit(2); }

let root = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
// Accept a full form object, a GetJson envelope, or a stringified markup wrapper.
if (typeof root.markup === 'string') root = JSON.parse(root.markup);
if (root.result && (root.result.markup || root.result.components)) {
  root = typeof root.result.markup === 'string' ? JSON.parse(root.result.markup) : root.result;
}

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
