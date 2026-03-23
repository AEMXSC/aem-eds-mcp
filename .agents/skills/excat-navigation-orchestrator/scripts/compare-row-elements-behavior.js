#!/usr/bin/env node

/*
 * compare-row-elements-behavior.js
 *
 * Compares source row-elements-mapping.json vs migrated-row-elements-mapping.json.
 * Produces row-elements-behavior-register.json with per-element hover/click match
 * for every desktop header row element (logo, nav links, CTA, search, locale, hamburger, icons, etc.).
 *
 * Usage:
 *   node scripts/compare-row-elements-behavior.js <source-mapping> <migrated-mapping> [--output=<register-path>]
 *
 * Example:
 *   node scripts/compare-row-elements-behavior.js \
 *     blocks/header/navigation-validation/row-elements-mapping.json \
 *     blocks/header/navigation-validation/migrated-row-elements-mapping.json \
 *     --output=blocks/header/navigation-validation/row-elements-behavior-register.json
 *
 * Exit codes:
 *   0 = all elements match (hover + click)
 *   1 = one or more mismatches
 *   2 = usage error
 */

import fs from 'fs';
import path from 'path';

function debugLog(level, msg) {
  const ts = new Date().toISOString();
  const prefix = { ERROR: '❌', PASS: '✅', BLOCK: '🚫', START: '🔵', END: '🏁' }[level] || 'ℹ️';
  const entry = `[${ts}] ${prefix} [SCRIPT:compare-row-elements-behavior] [${level}] ${msg}\n`;
  try {
    const logDir = path.resolve('blocks/header/navigation-validation');
    if (fs.existsSync(logDir)) fs.appendFileSync(path.join(logDir, 'debug.log'), entry);
  } catch (_) { /* ignore */ }
}

function loadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    console.error(`Failed to load ${filePath}: ${e.message}`);
    return null;
  }
}

function flattenElements(rows) {
  const out = [];
  for (const row of rows || []) {
    for (const el of row.elements || []) {
      if (el.id) out.push({ ...el, rowIndex: row.rowIndex });
    }
  }
  return out;
}

function normalizeUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url, 'https://placeholder.com');
    return u.pathname.replace(/\/$/, '');
  } catch {
    return (url || '').replace(/\/$/, '').toLowerCase();
  }
}

function compareDesc(sourceDesc, migratedDesc) {
  if (!sourceDesc && !migratedDesc) return true;
  if (!sourceDesc || !migratedDesc) return false;
  const s = String(sourceDesc).toLowerCase().trim();
  const m = String(migratedDesc).toLowerCase().trim();
  if (s === m) return true;
  const sWords = new Set(s.split(/\s+/).filter(Boolean));
  const mWords = new Set(m.split(/\s+/).filter(Boolean));
  if (sWords.size === 0 && mWords.size === 0) return true;
  const intersection = [...sWords].filter(w => mWords.has(w));
  const union = new Set([...sWords, ...mWords]);
  return intersection.length / union.size >= 0.5;
}

function compareHover(sourceHover, migratedHover) {
  const srcEffect = sourceHover?.hasEffect ?? false;
  const migEffect = migratedHover?.hasEffect ?? false;
  const srcDesc = sourceHover?.description || (srcEffect ? 'has effect' : 'no effect');
  const migDesc = migratedHover?.description || (migEffect ? 'has effect' : 'no effect');

  if (!srcEffect && !migEffect) {
    return { matches: true, sourceDescription: srcDesc, migratedDescription: migDesc };
  }
  if (srcEffect && !migEffect) {
    return {
      matches: false,
      sourceDescription: srcDesc,
      migratedDescription: 'no effect',
      delta: `Source has hover effect ("${srcDesc}") but migrated has none`
    };
  }
  if (!srcEffect && migEffect) {
    return {
      matches: false,
      sourceDescription: 'no effect',
      migratedDescription: migDesc,
      delta: 'Migrated has hover effect but source does not'
    };
  }
  const descMatch = compareDesc(srcDesc, migDesc);
  return {
    matches: descMatch,
    sourceDescription: srcDesc,
    migratedDescription: migDesc,
    ...(descMatch ? {} : { delta: `Hover differs: source="${srcDesc}", migrated="${migDesc}"` })
  };
}

function compareClick(sourceClick, migratedClick) {
  const srcNav = sourceClick?.navigates ?? false;
  const migNav = migratedClick?.navigates ?? false;
  const srcDesc = sourceClick?.description || (srcNav ? 'navigates' : 'no action');
  const migDesc = migratedClick?.description || (migNav ? 'navigates' : 'no action');
  const srcUrl = sourceClick?.url || '';
  const migUrl = migratedClick?.url || '';

  if (!srcNav && !migNav) {
    return { matches: true, sourceDescription: srcDesc, migratedDescription: migDesc };
  }
  const urlMatch = !srcUrl || !migUrl || normalizeUrl(srcUrl) === normalizeUrl(migUrl);
  const descMatch = compareDesc(srcDesc, migDesc);
  const matches = urlMatch && (srcNav === migNav) && descMatch;
  return {
    matches,
    sourceDescription: srcDesc,
    migratedDescription: migDesc,
    sourceUrl: srcUrl,
    migratedUrl: migUrl,
    ...(matches ? {} : { delta: `Click differs: source="${srcDesc}" (${srcUrl}), migrated="${migDesc}" (${migUrl})` })
  };
}

function main() {
  const args = process.argv.slice(2);
  let outputPath = null;
  const positional = [];
  for (const arg of args) {
    if (arg.startsWith('--output=')) {
      outputPath = arg.split('=')[1];
    } else {
      positional.push(arg);
    }
  }

  if (positional.length < 2) {
    console.error('Usage: node compare-row-elements-behavior.js <source-mapping> <migrated-mapping> [--output=<path>]');
    process.exit(2);
  }

  const sourcePath = positional[0];
  const migratedPath = positional[1];
  if (!fs.existsSync(sourcePath)) {
    console.error(`Source mapping not found: ${sourcePath}`);
    process.exit(2);
  }
  if (!fs.existsSync(migratedPath)) {
    console.error(`Migrated mapping not found: ${migratedPath}`);
    process.exit(2);
  }

  const source = loadJson(sourcePath);
  const migrated = loadJson(migratedPath);
  if (!source || !migrated) process.exit(2);

  debugLog('START', `compare-row-elements-behavior.js — source=${sourcePath}, migrated=${migratedPath}, output=${outputPath || 'stdout'}`);

  const sourceElements = flattenElements(source.rows);
  const migratedElements = flattenElements(migrated.rows);
  const migratedById = new Map(migratedElements.map(e => [e.id, e]));

  const items = [];
  for (const srcEl of sourceElements) {
    const migEl = migratedById.get(srcEl.id) || null;
    const hoverMatch = compareHover(srcEl.hoverBehavior, migEl?.hoverBehavior);
    const clickMatch = compareClick(srcEl.clickBehavior, migEl?.clickBehavior);
    const allMatch = hoverMatch.matches && clickMatch.matches && !!migEl;

    const entry = {
      id: srcEl.id,
      label: srcEl.label || srcEl.id,
      type: srcEl.type || 'other',
      hoverMatch,
      clickMatch,
      status: allMatch ? 'validated' : 'failed'
    };
    if (!migEl) {
      entry.remediation = `Element "${srcEl.id}" (${srcEl.label}) exists on source but is MISSING on migrated. Add it to header/nav and ensure hover/click match.`;
    } else if (!allMatch) {
      const fixes = [];
      if (!hoverMatch.matches) fixes.push(`hover: ${hoverMatch.delta || 'match source'}`);
      if (!clickMatch.matches) fixes.push(`click: ${clickMatch.delta || 'match source'}`);
      entry.remediation = `Extract the exact styles from the source site so we match them precisely. Fix ${srcEl.id} in header.js/header.css: ${fixes.join('; ')}`;
    }
    items.push(entry);
  }

  const totalValidated = items.filter(i => i.status === 'validated').length;
  const totalFailed = items.filter(i => i.status === 'failed').length;
  const hoverMatches = items.filter(i => i.hoverMatch.matches).length;
  const clickMatches = items.filter(i => i.clickMatch.matches).length;

  const register = {
    items,
    summary: {
      totalItems: items.length,
      hoverMatches,
      clickMatches,
      totalValidated,
      totalFailed
    },
    allValidated: totalFailed === 0 && items.length > 0
  };

  console.log('=== Row Elements Behavior Comparison ===');
  console.log(`Source elements: ${sourceElements.length}, Migrated elements: ${migratedElements.length}`);
  console.log(`  Hover matches: ${hoverMatches}/${items.length}`);
  console.log(`  Click matches: ${clickMatches}/${items.length}`);
  console.log(`  Validated: ${totalValidated}/${items.length}, Failed: ${totalFailed}/${items.length}`);

  if (totalFailed > 0) {
    console.log('\n=== FAILURES ===');
    for (const item of items.filter(i => i.status === 'failed')) {
      console.log(`\n  [${item.id}] "${item.label}" (${item.type}):`);
      if (!item.hoverMatch.matches) console.log(`    HOVER: ${item.hoverMatch.delta || 'mismatch'}`);
      if (!item.clickMatch.matches) console.log(`    CLICK: ${item.clickMatch.delta || 'mismatch'}`);
      if (item.remediation) console.log(`    FIX: ${item.remediation}`);
    }
  }

  if (outputPath) {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(register, null, 2));
    console.log(`\nRegister written to: ${outputPath}`);
  } else {
    console.log('\n' + JSON.stringify(register, null, 2));
  }

  console.log(`\n=== ${register.allValidated ? 'ALL VALIDATED' : 'VALIDATION FAILED'} ===`);
  if (register.allValidated) {
    debugLog('PASS', `PASSED — ${items.length} row elements, all validated. Hover=${hoverMatches}, Click=${clickMatches}`);
  } else {
    const failedIds = items.filter(i => i.status === 'failed').map(i => i.id).join(', ');
    debugLog('BLOCK', `FAILED — ${totalFailed}/${items.length} failed: ${failedIds}`);
  }
  process.exit(register.allValidated ? 0 : 1);
}

main();
