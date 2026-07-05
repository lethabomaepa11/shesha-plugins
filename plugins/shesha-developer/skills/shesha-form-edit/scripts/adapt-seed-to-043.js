#!/usr/bin/env node
/**
 * adapt-seed-to-043.js — transpile a 0.45-shaped canonical seed to BoxStack 0.43 markup.
 *
 * Usage:
 *   node scripts/adapt-seed-to-043.js <seed.json> <out.json>
 *   node scripts/adapt-seed-to-043.js --all          # every assets/examples/*.json -> assets/examples/043/
 *
 * Ground truth: assets/components-kb/ (source-derived from shesha-reactjs releases/0.43).
 * Transformations (recursive over the whole component tree):
 *   a. dataContext used as a table/list data wrapper  -> datatableContext (v7). The 0.43
 *      dataContext (v2) is the separate app-context component.
 *   b. version downstamp from KB _index.json; KB version:null -> remove the version key.
 *      Types unknown to the KB -> warning, left untouched.
 *   c. desktop/tablet/mobile breakpoint style blocks (0.45+, inert on 0.43) -> flattened to
 *      the FLAT 0.43 style props the component's catalog actually lists (desktop wins).
 *      Unmappable style values are dropped and recorded.
 *   d. prop pruning for full-parse components only: keep {settingsFields paths (+
 *      appearanceFieldPaths / shared style set) ∪ structural keys ∪ initModel keys}.
 *      Partial/none-parse components are never pruned (only renamed/downstamped/flattened).
 *   e. per-seed <out>.report.json with {renames, downstamps, flattenedStyles, droppedProps, warnings}.
 *
 * ESM, no npm deps. Deterministic and re-runnable — never hand-edit the 043/ output;
 * rerun this script after editing a 0.45 seed.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = path.resolve(__dirname, '..');
const KB_DIR = path.join(SKILL_ROOT, 'assets', 'components-kb');
const EXAMPLES_DIR = path.join(SKILL_ROOT, 'assets', 'examples');
const OUT_043_DIR = path.join(EXAMPLES_DIR, '043');

// ---------------------------------------------------------------- KB loading

const kbIndex = JSON.parse(fs.readFileSync(path.join(KB_DIR, '_index.json'), 'utf8'));
const sharedStyle = JSON.parse(fs.readFileSync(path.join(KB_DIR, '_shared-style-fields.json'), 'utf8'));
const SHARED_STYLE_PATHS = new Set(sharedStyle.fields.map((f) => f.path));

const kbCache = new Map();
function loadKb(type) {
  if (kbCache.has(type)) return kbCache.get(type);
  const entry = kbIndex[type];
  let kb = null;
  if (entry && entry.file) {
    try {
      kb = JSON.parse(fs.readFileSync(path.join(KB_DIR, entry.file), 'utf8'));
    } catch {
      kb = null;
    }
  }
  kbCache.set(type, kb);
  return kb;
}

// Keys that are structural / lifecycle and always survive pruning.
const STRUCTURAL_KEYS = new Set([
  'id', 'type', 'version', 'parentId', 'propertyName', 'componentName', 'label',
  'components', 'items', 'columns', 'tabs', 'content', 'header',
  'editMode', 'hidden', 'customVisibility', 'validate', 'description', 'settingsValidationErrors',
]);

/** Allowed top-level model keys for a component per its 0.43 catalog. Null = don't prune. */
function allowedKeys(kb) {
  if (!kb || !kb.settingsForm || kb.settingsForm.parseQuality !== 'full') return null;
  const allowed = new Set(STRUCTURAL_KEYS);
  for (const f of kb.settingsFields || []) allowed.add(String(f.path).split('.')[0]);
  for (const p of kb.appearanceFieldPaths || []) allowed.add(String(p).split('.')[0]);
  if (kb.hasStandardAppearance) for (const p of SHARED_STYLE_PATHS) allowed.add(p);
  if (kb.initModel && kb.initModel.defaults) for (const k of Object.keys(kb.initModel.defaults)) allowed.add(k);
  return allowed;
}

/** Style paths this component can carry (targets for flattening). Permissive for partial parses. */
function styleTargets(kb) {
  const s = new Set();
  if (kb) {
    for (const f of kb.settingsFields || []) if (!String(f.path).includes('.')) s.add(f.path);
    for (const p of kb.appearanceFieldPaths || []) s.add(p);
    if (kb.hasStandardAppearance) for (const p of SHARED_STYLE_PATHS) s.add(p);
    if (kb.settingsForm && kb.settingsForm.parseQuality !== 'full') {
      for (const p of SHARED_STYLE_PATHS) s.add(p); // incomplete catalog — be permissive
    }
  } else {
    for (const p of SHARED_STYLE_PATHS) s.add(p);
  }
  return s;
}

// ---------------------------------------------------------------- report

function newReport() {
  return { renames: [], downstamps: [], flattenedStyles: [], droppedProps: [], warnings: [] };
}

function nodeLabel(node) {
  return node.componentName || node.propertyName || node.name || node.label || node.id || '(unnamed)';
}

// ---------------------------------------------------------------- (a) wrapper rename

const TABLE_WRAPPER_HINTS = ['sourceType', 'entityType', 'endpoint', 'dataFetchingMode',
  'defaultPageSize', 'sortMode', 'strictSortBy', 'allowReordering', 'permanentFilter'];

function hasTableDescendant(node) {
  let found = false;
  (function walk(nodes) {
    for (const n of nodes || []) {
      if (!n || typeof n !== 'object' || found) continue;
      if (n.type === 'datatable' || n.type === 'datalist' || String(n.type || '').startsWith('datatable.')) { found = true; return; }
      walk(n.components);
      if (n.columns) for (const c of n.columns) walk(c && c.components);
      if (n.tabs) for (const t of n.tabs) walk(t && t.components);
      if (n.content) walk(n.content.components);
      if (n.header) walk(n.header.components);
    }
  })(node.components);
  return found;
}

function isTableWrapper(node) {
  if (TABLE_WRAPPER_HINTS.some((k) => node[k] !== undefined && node[k] !== null && node[k] !== '')) return true;
  return hasTableDescendant(node);
}

// ---------------------------------------------------------------- (c) style flattening

const px = (v) => {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(String(v).replace(/px$/i, ''));
  return Number.isFinite(n) ? n : v;
};
const isEmpty = (v) => v === undefined || v === null || v === '';

function pickTarget(candidates, targets) {
  return candidates.find((c) => targets.has(c));
}

function flattenBreakpoints(node, kb, report, seedName) {
  const blocks = ['mobile', 'tablet', 'desktop'].filter((k) => node[k] && typeof node[k] === 'object');
  if (!blocks.length) return;
  // merge: desktop wins (processed last)
  const merged = {};
  for (const b of blocks) Object.assign(merged, node[b]);
  const targets = styleTargets(kb);
  const who = `${node.type}:${nodeLabel(node)}`;
  const applied = [];
  const dropped = [];

  const set = (prop, value, from) => {
    if (isEmpty(value)) return;
    if (node[prop] === undefined) { node[prop] = value; applied.push(`${from} -> ${prop}=${JSON.stringify(value)}`); }
  };
  const drop = (from, why) => dropped.push(`${from} (${why})`);

  for (const [key, value] of Object.entries(merged)) {
    if (isEmpty(value)) continue;
    switch (key) {
      case 'dimensions': {
        for (const dim of ['width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight']) {
          const v = value[dim];
          if (isEmpty(v)) continue;
          if (targets.has(dim)) set(dim, v, `dimensions.${dim}`);
          else drop(`dimensions.${dim}=${v}`, 'no 0.43 target on this component');
        }
        break;
      }
      case 'background': {
        if (value.type === 'color' || value.type === undefined) {
          if (!isEmpty(value.color)) {
            if (targets.has('backgroundColor')) set('backgroundColor', value.color, 'background.color');
            else drop(`background.color=${value.color}`, 'no backgroundColor on this component');
          }
        } else {
          drop(`background(type=${value.type})`, 'non-color backgrounds not auto-mapped to 0.43');
        }
        break;
      }
      case 'border': {
        const all = (value.border && value.border.all) || {};
        const radius = value.radius && value.radius.all;
        if (!isEmpty(value.hideBorder) && targets.has('hideBorder')) set('hideBorder', value.hideBorder, 'border.hideBorder');
        if (all.style === 'none' || isEmpty(all.style)) {
          // invisible border — nothing to carry except radius
          if (!isEmpty(all.width) || !isEmpty(all.color)) drop('border.all (style:none)', 'border not rendered');
        } else {
          const wTarget = pickTarget(['borderWidth', 'borderSize'], targets);
          const sTarget = pickTarget(['borderStyle', 'borderType'], targets);
          if (wTarget && !isEmpty(all.width)) set(wTarget, px(all.width), 'border.all.width');
          else if (!isEmpty(all.width)) drop(`border.all.width=${all.width}`, 'no border-width target');
          if (sTarget) set(sTarget, all.style, 'border.all.style');
          else drop(`border.all.style=${all.style}`, 'no border-style target');
          if (targets.has('borderColor') && !isEmpty(all.color)) set('borderColor', all.color, 'border.all.color');
          else if (!isEmpty(all.color)) drop(`border.all.color=${all.color}`, 'no borderColor target');
        }
        if (!isEmpty(radius)) {
          if (targets.has('borderRadius')) set('borderRadius', px(radius), 'border.radius.all');
          else drop(`border.radius.all=${radius}`, 'no borderRadius target');
        }
        break;
      }
      case 'font': {
        const map = [['size', ['fontSize']], ['weight', ['fontWeight']], ['color', ['fontColor']], ['align', ['textAlign']]];
        for (const [k, candidates] of map) {
          if (isEmpty(value[k])) continue;
          const t = pickTarget(candidates, targets);
          if (t) set(t, k === 'size' ? px(value[k]) : value[k], `font.${k}`);
          else drop(`font.${k}=${value[k]}`, 'no 0.43 font target on this component');
        }
        if (!isEmpty(value.type)) drop(`font.type=${value.type}`, 'font-family not a 0.43 per-component prop');
        break;
      }
      case 'shadow': {
        if (targets.has('shadow')) set('shadow', value, 'shadow');
        else {
          const nonZero = Object.values(value).some((v) => v && v !== '#000000');
          drop('shadow', nonZero ? 'no shadow field in 0.43 catalog (value lost)' : 'default zero shadow');
        }
        break;
      }
      case 'stylingBox': {
        if (value !== '{}' && targets.has('stylingBox')) set('stylingBox', value, 'stylingBox');
        break;
      }
      default: {
        if (typeof value === 'object') {
          drop(`${key} (object)`, 'no flat 0.43 equivalent');
        } else if (targets.has(key) || STRUCTURAL_KEYS.has(key)) {
          set(key, value, key);
        } else {
          drop(`${key}=${JSON.stringify(value)}`, 'not in 0.43 catalog for this component');
        }
      }
    }
  }

  for (const b of ['desktop', 'tablet', 'mobile']) delete node[b];
  if (applied.length || dropped.length) {
    report.flattenedStyles.push({ seed: seedName, component: who, applied, dropped });
  }
}

// ---------------------------------------------------------------- (a) rename + prop mapping

function renameDataContext(node, report, seedName) {
  const kb = loadKb('datatableContext');
  const before = { type: node.type, version: node.version };
  node.type = 'datatableContext';
  node.version = kb ? kb.version : 7;
  // legacy uniqueStateId: 0.43 tableContext migrator v0 maps it to `name` — carried by
  // componentName/propertyName in our seeds, so drop it explicitly and record.
  const mapped = [];
  if (node.uniqueStateId !== undefined) {
    mapped.push(`uniqueStateId=${JSON.stringify(node.uniqueStateId)} dropped (legacy; 0.43 migrator maps it to name, already carried by componentName)`);
    delete node.uniqueStateId;
  }
  report.renames.push({
    seed: seedName,
    component: nodeLabel(node),
    from: `${before.type} v${before.version}`,
    to: `datatableContext v${node.version}`,
    notes: mapped,
  });
}

// ---------------------------------------------------------------- 0.45 -> 0.43 prop maps

/** Best-effort full type name from a 0.45 {name, module} entity reference. */
function entityRefToString(v, report, seedName, component, prop) {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && v.name) {
    const guess = v.module ? `${v.module}.Domain.${v.name}` : v.name;
    report.warnings.push({
      seed: seedName, component,
      issue: `${prop} was a 0.45 {module,name} object — converted to "${guess}" by convention; verify the full type name on the target backend`,
    });
    return guess;
  }
  return undefined;
}

const cap = (s) => (typeof s === 'string' && s ? s[0].toUpperCase() + s.slice(1) : s);

function mapRename(node, report, seedName, from, to, value) {
  report.renames.push({ seed: seedName, component: `${node.type}:${nodeLabel(node)}`, from, to, value: typeof value === 'object' ? JSON.stringify(value) : value });
}

/** Type-specific 0.45->0.43 prop renames, applied before pruning. */
function applyPropMaps(node, report, seedName) {
  const who = `${node.type}:${nodeLabel(node)}`;
  if (node.type === 'datatableContext') {
    // legacy dataSourceType/dataSourceEntity -> sourceType/entityType
    if (!node.sourceType && typeof node.dataSourceType === 'string') {
      node.sourceType = cap(node.dataSourceType); // 'entity' -> 'Entity'
      mapRename(node, report, seedName, 'dataSourceType', 'sourceType', node.sourceType);
    }
    if (typeof node.entityType === 'object' && node.entityType) {
      const str = typeof node.dataSourceEntity === 'string' && node.dataSourceEntity
        ? node.dataSourceEntity
        : entityRefToString(node.entityType, report, seedName, who, 'entityType');
      mapRename(node, report, seedName, 'entityType (0.45 object)', 'entityType (0.43 string)', str);
      node.entityType = str;
    } else if (!node.entityType && typeof node.dataSourceEntity === 'string') {
      node.entityType = node.dataSourceEntity;
      mapRename(node, report, seedName, 'dataSourceEntity', 'entityType', node.entityType);
    }
    delete node.dataSourceType;
    delete node.dataSourceEntity;
  }
  if (node.type === 'autocomplete') {
    // 0.43 autocomplete (v6) uses entityTypeShortAlias (string) + useRawValues, not entityType/valueFormat
    if (node.entityTypeShortAlias === undefined && node.entityType !== undefined) {
      const str = entityRefToString(node.entityType, report, seedName, who, 'entityType');
      if (str !== undefined) {
        node.entityTypeShortAlias = str;
        mapRename(node, report, seedName, 'entityType', 'entityTypeShortAlias', str);
      }
      delete node.entityType;
    }
    if (node.useRawValues === undefined && typeof node.valueFormat === 'string') {
      if (node.valueFormat === 'entityReference') node.useRawValues = false;
      else if (node.valueFormat === 'simple') node.useRawValues = true;
      else report.warnings.push({ seed: seedName, component: who, issue: `autocomplete valueFormat "${node.valueFormat}" has no direct 0.43 useRawValues equivalent — dropped; set useRawValues manually` });
      if (node.useRawValues !== undefined) mapRename(node, report, seedName, `valueFormat=${node.valueFormat}`, `useRawValues=${node.useRawValues}`, node.useRawValues);
    }
    delete node.valueFormat;
  }
}

// ---------------------------------------------------------------- (b) version downstamp

function downstamp(node, kb, report, seedName) {
  const entry = kbIndex[node.type];
  if (!entry) return; // unknown type — warning added by caller
  const target = entry.version;
  if (target === null || target === undefined) {
    if (node.version !== undefined) {
      report.downstamps.push({ seed: seedName, component: `${node.type}:${nodeLabel(node)}`, from: node.version, to: '(removed — no migrator on 0.43)' });
      delete node.version;
    }
    return;
  }
  if (node.version !== target) {
    report.downstamps.push({ seed: seedName, component: `${node.type}:${nodeLabel(node)}`, from: node.version === undefined ? '(unset)' : node.version, to: target });
    node.version = target;
  }
}

// ---------------------------------------------------------------- (d) pruning

function pruneProps(node, kb, report, seedName) {
  const allowed = allowedKeys(kb);
  if (!allowed) return; // partial/none parse — too risky to prune
  for (const key of Object.keys(node)) {
    if (allowed.has(key)) continue;
    const v = node[key];
    report.droppedProps.push({
      seed: seedName,
      component: `${node.type}:${nodeLabel(node)}`,
      prop: key,
      value: typeof v === 'object' ? '(object)' : JSON.stringify(v),
    });
    delete node[key];
  }
}

// ---------------------------------------------------------------- tree walk

function transformComponent(node, report, seedName) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.type === 'string') {
    // (a) wrapper rename — BEFORE KB lookup so the datatableContext catalog governs the rest
    if (node.type === 'dataContext' && isTableWrapper(node)) renameDataContext(node, report, seedName);

    const kb = loadKb(node.type);
    if (!kbIndex[node.type]) {
      report.warnings.push({ seed: seedName, component: nodeLabel(node), issue: `type "${node.type}" not in 0.43 KB — left untouched (verify it exists on the target backend)` });
    } else {
      applyPropMaps(node, report, seedName);       // 0.45 -> 0.43 prop renames
      downstamp(node, kb, report, seedName);       // (b)
      flattenBreakpoints(node, kb, report, seedName); // (c)
      pruneProps(node, kb, report, seedName);      // (d)
    }
  } else if (node.desktop || node.tablet || node.mobile) {
    // typeless style carrier (e.g. buttonGroup item) — flatten with the shared style set
    flattenBreakpoints(node, null, report, seedName);
  }
  recurseSlots(node, report, seedName);
}

function transformItems(items, report, seedName) {
  for (const it of items || []) {
    if (!it || typeof it !== 'object') continue;
    if (it.desktop || it.tablet || it.mobile) flattenBreakpoints(it, null, report, seedName);
    if (Array.isArray(it.childItems)) transformItems(it.childItems, report, seedName);
    if (Array.isArray(it.components)) for (const c of it.components) transformComponent(c, report, seedName);
    // datatable column cell renderers carry an embedded component model in .settings
    for (const slot of ['displayComponent', 'editComponent', 'createComponent']) {
      const s = it[slot] && it[slot].settings;
      if (s && typeof s === 'object' && typeof s.type === 'string') transformComponent(s, report, seedName);
    }
  }
}

function recurseSlots(node, report, seedName) {
  if (Array.isArray(node.components)) for (const c of node.components) transformComponent(c, report, seedName);
  if (Array.isArray(node.columns)) {
    for (const col of node.columns) {
      if (col && Array.isArray(col.components)) for (const c of col.components) transformComponent(c, report, seedName);
    }
  }
  if (Array.isArray(node.tabs)) {
    for (const tab of node.tabs) {
      if (tab && Array.isArray(tab.components)) for (const c of tab.components) transformComponent(c, report, seedName);
    }
  }
  if (node.content && Array.isArray(node.content.components)) for (const c of node.content.components) transformComponent(c, report, seedName);
  if (node.header && Array.isArray(node.header.components)) for (const c of node.header.components) transformComponent(c, report, seedName);
  if (Array.isArray(node.items) && node.type !== 'dropdown') transformItems(node.items, report, seedName); // buttonGroup items / datatable columns
}

// ---------------------------------------------------------------- seed driver

function adaptSeed(inFile, outFile) {
  const seedName = path.basename(inFile);
  const raw = fs.readFileSync(inFile, 'utf8').replace(/^﻿/, '');
  let root = JSON.parse(raw);
  const report = newReport();

  const container = typeof root.markup === 'string' ? JSON.parse(root.markup) : root;
  for (const c of container.components || []) transformComponent(c, report, seedName);
  if (typeof root.markup === 'string') root.markup = JSON.stringify(container);

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const outJson = JSON.stringify(root, null, 2);
  JSON.parse(outJson); // round-trip sanity
  fs.writeFileSync(outFile, outJson + '\n', 'utf8');

  const summary = {
    seed: seedName,
    generatedBy: 'scripts/adapt-seed-to-043.js — GENERATED, do not hand-edit; rerun after editing the 0.45 seed',
    counts: {
      renames: report.renames.length,
      downstamps: report.downstamps.length,
      flattenedStyles: report.flattenedStyles.length,
      droppedProps: report.droppedProps.length,
      warnings: report.warnings.length,
    },
    ...report,
  };
  fs.writeFileSync(outFile + '.report.json', JSON.stringify(summary, null, 2) + '\n', 'utf8');
  return summary;
}

// ---------------------------------------------------------------- CLI

const args = process.argv.slice(2);
if (args[0] === '--all') {
  const seeds = fs.readdirSync(EXAMPLES_DIR).filter((f) => f.endsWith('.json'));
  const totals = [];
  for (const f of seeds) {
    const summary = adaptSeed(path.join(EXAMPLES_DIR, f), path.join(OUT_043_DIR, f));
    totals.push(summary);
    console.log(`${f}: renames=${summary.counts.renames} downstamps=${summary.counts.downstamps} styleBlocks=${summary.counts.flattenedStyles} droppedProps=${summary.counts.droppedProps} warnings=${summary.counts.warnings}`);
    for (const w of summary.warnings) console.log(`  WARN ${w.component}: ${w.issue}`);
  }
  console.log(`\n${totals.length} seeds -> ${OUT_043_DIR}`);
} else if (args.length === 2) {
  const summary = adaptSeed(path.resolve(args[0]), path.resolve(args[1]));
  console.log(JSON.stringify(summary.counts, null, 2));
  for (const w of summary.warnings) console.log(`WARN ${w.component}: ${w.issue}`);
} else {
  console.error('usage: node scripts/adapt-seed-to-043.js <seed.json> <out.json>\n       node scripts/adapt-seed-to-043.js --all');
  process.exit(2);
}
