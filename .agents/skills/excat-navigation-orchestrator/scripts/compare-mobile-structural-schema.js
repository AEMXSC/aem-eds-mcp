#!/usr/bin/env node

/**
 * compare-mobile-structural-schema.js
 *
 * Compares source mobile structure (from detect-mobile-structure.js) to migrated
 * mobile structure (migrated-mobile-structural-summary.json). Same idea as
 * desktop compare-structural-schema.js: enforce row count and items-per-row parity.
 *
 * When migrated has MORE rows/items than source, that is mobile-only content —
 * ensure it is in nav.plain.html (mobile-only section) and in mobile
 * missing-content-register.json.
 *
 * Usage:
 *   node scripts/compare-mobile-structural-schema.js <mobile-structure-detection.json> <migrated-mobile-structural-summary.json> [--threshold=95] [--output-register=mobile/mobile-schema-register.json]
 *
 * Exit: 0 if similarity >= threshold; 1 otherwise.
 */

import fs from 'fs';
import path from 'path';

function debugLog(level, msg) {
  const ts = new Date().toISOString();
  const prefix = { ERROR: '❌', PASS: '✅', BLOCK: '🚫', START: '🔵' }[level] || 'ℹ️';
  const entry = `[${ts}] ${prefix} [SCRIPT:compare-mobile-structural-schema] [${level}] ${msg}\n`;
  try {
    const logDir = path.resolve('blocks/header/navigation-validation');
    if (fs.existsSync(logDir)) fs.appendFileSync(path.join(logDir, 'debug.log'), entry);
  } catch (_) { /* ignore */ }
}

function loadJson(p) {
  const raw = fs.readFileSync(path.resolve(p), 'utf8');
  return JSON.parse(raw);
}

const MAJOR_PENALTY = 25;

function compare(source, migrated) {
  const mismatches = [];
  let similarity = 100;

  const srcRows = source.rows || [];
  const migRows = migrated.rows || [];

  if (source.rowCount != null && migrated.rowCount != null && source.rowCount !== migrated.rowCount) {
    mismatches.push(`rowCount: source=${source.rowCount} migrated=${migrated.rowCount}`);
    similarity -= MAJOR_PENALTY;
  }

  const maxRows = Math.max(srcRows.length, migRows.length);
  for (let i = 0; i < maxRows; i++) {
    const s = srcRows[i];
    const m = migRows[i];
    if (!s || !m) {
      mismatches.push(`rows[${i}]: missing in ${s ? 'migrated' : 'source'}`);
      similarity -= MAJOR_PENALTY;
      continue;
    }
    const srcItemCount = s.itemCount != null ? s.itemCount : 0;
    const migItemCount = m.itemCount != null ? m.itemCount : 0;
    if (migItemCount < srcItemCount) {
      mismatches.push(`rows[${i}].itemCount: migrated (${migItemCount}) < source (${srcItemCount}) — add missing content`);
      similarity -= MAJOR_PENALTY;
    } else if (migItemCount > srcItemCount) {
      mismatches.push(`rows[${i}].itemCount: migrated (${migItemCount}) > source (${srcItemCount}) — mobile-only content; ensure in nav.plain.html mobile-only section and mobile missing-content-register`);
      similarity -= 5;
    }
  }

  const srcMenuCount = source.topLevelMenuItemCount != null ? source.topLevelMenuItemCount : 0;
  const migMenuCount = migrated.topLevelMenuItemCount != null ? migrated.topLevelMenuItemCount : 0;
  if (migMenuCount < srcMenuCount) {
    mismatches.push(`topLevelMenuItemCount: migrated (${migMenuCount}) < source (${srcMenuCount}) — add missing menu items`);
    similarity -= MAJOR_PENALTY;
  } else if (migMenuCount > srcMenuCount) {
    mismatches.push(`topLevelMenuItemCount: migrated (${migMenuCount}) > source (${srcMenuCount}) — mobile-only items; add to nav.plain.html mobile-only section and mobile missing-content-register`);
    similarity -= 5;
  }

  similarity = Math.max(0, similarity);
  return { similarity, mismatches };
}

function buildRegisterItems(source, migrated) {
  const items = [];
  const srcRows = source.rows || [];
  const migRows = migrated.rows || [];
  for (let i = 0; i < Math.max(srcRows.length, migRows.length); i++) {
    const s = srcRows[i];
    const m = migRows[i];
    const srcCount = s?.itemCount ?? 0;
    const migCount = m?.itemCount ?? 0;
    const validated = s && m && migCount >= srcCount;
    items.push({ id: `mobile-row-${i}`, label: `Mobile row ${i}`, status: validated ? 'validated' : 'pending', sourceMatch: validated });
  }
  const srcMenu = source.topLevelMenuItemCount ?? 0;
  const migMenu = migrated.topLevelMenuItemCount ?? 0;
  items.push({
    id: 'mobile-menu-items',
    label: 'Mobile top-level menu items',
    status: migMenu >= srcMenu ? 'validated' : 'pending',
    sourceMatch: migMenu >= srcMenu,
  });
  const allValidated = items.every((it) => it.status === 'validated');
  return { items, allValidated };
}

function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--threshold') && !a.startsWith('--output-register'));
  const thresholdArg = process.argv.slice(2).find((a) => a.startsWith('--threshold'));
  const registerArg = process.argv.slice(2).find((a) => a.startsWith('--output-register'));
  const threshold = thresholdArg ? parseInt(thresholdArg.split('=')[1], 10) : 95;
  const outputRegisterPath = registerArg ? registerArg.split('=')[1] : null;

  if (args.length < 2) {
    console.error('Usage: node compare-mobile-structural-schema.js <mobile-structure-detection.json> <migrated-mobile-structural-summary.json> [--threshold=95] [--output-register=mobile/mobile-schema-register.json]');
    process.exit(1);
  }

  const [sourcePath, migPath] = args;
  for (const p of [sourcePath, migPath]) {
    if (!fs.existsSync(path.resolve(p))) {
      console.error('Error: file not found:', p);
      process.exit(1);
    }
  }

  let source, migrated;
  try {
    source = loadJson(sourcePath);
    migrated = loadJson(migPath);
  } catch (e) {
    console.error('Error: invalid JSON:', e.message);
    process.exit(1);
  }

  debugLog('START', `compare-mobile-structural-schema.js — threshold=${threshold}`);

  const compareResult = compare(source, migrated);
  const { similarity, mismatches } = compareResult;

  if (outputRegisterPath) {
    const register = buildRegisterItems(source, migrated);
    try {
      fs.writeFileSync(path.resolve(outputRegisterPath), JSON.stringify(register, null, 2), 'utf8');
    } catch (e) {
      console.error('Error writing register:', e.message);
    }
  }

  console.log(`Mobile structural similarity: ${similarity}% (threshold ${threshold}%)`);
  if (mismatches.length > 0) {
    mismatches.forEach((m) => console.error('  ', m));
  }

  if (similarity >= threshold) {
    debugLog('PASS', `PASSED — similarity=${similarity}%`);
    process.exit(0);
  }
  debugLog('BLOCK', `FAILED — similarity=${similarity}%, mismatches: ${mismatches.length}`);
  process.exit(1);
}

main();
