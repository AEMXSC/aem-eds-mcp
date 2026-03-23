#!/usr/bin/env node
/**
 * Compare source header structure (from phase-1, phase-2, phase-3) to migrated
 * header structure (extracted from migrated page, same shape). Outputs structural
 * similarity and exits 0 if >= threshold (default 95), else 1.
 * Optional: --output-register=<path> writes schema-register.json with per-component status.
 *
 * Usage:
 *   node scripts/compare-structural-schema.js <phase-1.json> <phase-2.json> <phase-3.json> <migrated-structural-summary.json> [--threshold=95] [--output-register=schema-register.json]
 */

import fs from 'fs';
import path from 'path';

function debugLog(level, msg) {
  const ts = new Date().toISOString();
  const prefix = { ERROR: '❌', PASS: '✅', BLOCK: '🚫', START: '🔵', END: '🏁' }[level] || 'ℹ️';
  const entry = `[${ts}] ${prefix} [SCRIPT:compare-structural-schema] [${level}] ${msg}\n`;
  try {
    const logDir = path.resolve('blocks/header/navigation-validation');
    if (fs.existsSync(logDir)) fs.appendFileSync(path.join(logDir, 'debug.log'), entry);
  } catch (_) { /* ignore */ }
}

function loadJson(p) {
  const raw = fs.readFileSync(path.resolve(p), 'utf8');
  return JSON.parse(raw);
}

function buildSourceSummary(p1, p2, p3) {
  const rowCount = p1.rowCount != null ? p1.rowCount : 0;
  const rows = (p2.rows || []).map((r, i) => ({
    index: r.index != null ? r.index : i,
    hasImages: Boolean(r.hasImages),
    imageCount: r.imageCount != null ? r.imageCount : (r.hasImages ? 1 : 0),
    imageBreakdown: r.imageBreakdown || null,
  }));
  const mm = p3 || {};
  const columnCount = mm.columnCount != null ? mm.columnCount : 0;
  const columns = (mm.columns || []).map((c, i) => ({
    columnIndex: c.columnIndex != null ? c.columnIndex : i,
    hasImages: Boolean(c.hasImages),
    imageCount: c.imageCount != null ? c.imageCount : (c.hasImages ? 1 : 0),
    imageBreakdown: c.imageBreakdown || null,
  }));
  return {
    rowCount,
    rows,
    megamenu: {
      columnCount,
      hasImages: Boolean(mm.hasImages),
      imageCount: mm.imageCount != null ? mm.imageCount : (mm.hasImages ? 1 : 0),
      imageBreakdown: mm.imageBreakdown || null,
      columns,
    },
  };
}

const MAJOR_PENALTY = 25;
const MINOR_PENALTY_PER_IMAGE = 5;

function compare(source, migrated) {
  const mismatches = [];
  let similarity = 100;

  // rowCount
  if (source.rowCount !== migrated.rowCount) {
    mismatches.push(`rowCount: source=${source.rowCount} migrated=${migrated.rowCount}`);
    similarity -= MAJOR_PENALTY;
  }

  // rows (length and imageCount per row)
  const srcRows = source.rows || [];
  const migRows = migrated.rows || [];
  const maxRows = Math.max(srcRows.length, migRows.length);
  for (let i = 0; i < maxRows; i++) {
    const s = srcRows[i];
    const m = migRows[i];
    if (!s || !m) {
      mismatches.push(`rows[${i}]: missing in ${s ? 'migrated' : 'source'}`);
      similarity -= MAJOR_PENALTY;
      continue;
    }
    const srcCount = s.imageCount != null ? s.imageCount : (s.hasImages ? 1 : 0);
    const migCount = m.imageCount != null ? m.imageCount : (m.hasImages ? 1 : 0);
    if (srcCount !== migCount) {
      const ratio = migCount / Math.max(srcCount, 1);
      if (ratio < 0.5) {
        similarity -= MAJOR_PENALTY;
        mismatches.push(`rows[${i}]: source has ${srcCount} images, migrated has ${migCount} — major structural gap`);
      } else {
        const diff = Math.abs(srcCount - migCount);
        similarity -= Math.min(MINOR_PENALTY_PER_IMAGE * diff, 20);
        mismatches.push(`rows[${i}].imageCount: source=${srcCount} migrated=${migCount}`);
      }
    }
  }

  const srcMm = source.megamenu || {};
  const migMm = migrated.megamenu || {};

  // megamenu.columnCount
  if (srcMm.columnCount !== migMm.columnCount) {
    mismatches.push(`megamenu.columnCount: source=${srcMm.columnCount} migrated=${migMm.columnCount}`);
    similarity -= MAJOR_PENALTY;
  }

  // megamenu image count
  const srcMmCount = srcMm.imageCount != null ? srcMm.imageCount : (srcMm.hasImages ? 1 : 0);
  const migMmCount = migMm.imageCount != null ? migMm.imageCount : (migMm.hasImages ? 1 : 0);
  if (srcMmCount !== migMmCount) {
    const ratio = migMmCount / Math.max(srcMmCount, 1);
    if (ratio < 0.5) {
      similarity -= MAJOR_PENALTY;
      mismatches.push(`megamenu: source has ${srcMmCount} images, migrated has ${migMmCount} — major gap`);
    } else {
      const diff = Math.abs(srcMmCount - migMmCount);
      similarity -= Math.min(MINOR_PENALTY_PER_IMAGE * diff, 20);
      mismatches.push(`megamenu.imageCount: source=${srcMmCount} migrated=${migMmCount}`);
    }
  }

  // columns[].imageCount
  const srcCols = srcMm.columns || [];
  const migCols = migMm.columns || [];
  const maxCols = Math.max(srcCols.length, migCols.length);
  for (let i = 0; i < maxCols; i++) {
    const s = srcCols[i];
    const m = migCols[i];
    if (!s || !m) {
      mismatches.push(`megamenu.columns[${i}]: missing in ${s ? 'migrated' : 'source'}`);
      similarity -= MAJOR_PENALTY;
      continue;
    }
    const srcColCount = s.imageCount != null ? s.imageCount : (s.hasImages ? 1 : 0);
    const migColCount = m.imageCount != null ? m.imageCount : (m.hasImages ? 1 : 0);
    if (srcColCount !== migColCount) {
      const ratio = migColCount / Math.max(srcColCount, 1);
      if (ratio < 0.5) {
        similarity -= MAJOR_PENALTY;
        mismatches.push(`megamenu.columns[${i}]: source has ${srcColCount} images, migrated has ${migColCount}`);
      } else {
        const diff = Math.abs(srcColCount - migColCount);
        similarity -= Math.min(MINOR_PENALTY_PER_IMAGE * diff, 20);
        mismatches.push(`megamenu.columns[${i}].imageCount: source=${srcColCount} migrated=${migColCount}`);
      }
    }
  }

  similarity = Math.max(0, similarity);
  return { similarity, mismatches, match: Math.round((similarity / 100) * (maxRows + maxCols + 3)), total: maxRows + maxCols + 3 };
}

/** Build per-item match for schema register: row-0, row-1, ..., megamenu, megamenu-column-0, ... */
function buildRegisterItems(source, migrated, compareResult) {
  const items = [];
  const srcRows = source.rows || [];
  const migRows = migrated.rows || [];
  for (let i = 0; i < Math.max(srcRows.length, migRows.length); i++) {
    const s = srcRows[i];
    const m = migRows[i];
    const srcCount = s?.imageCount != null ? s.imageCount : (s?.hasImages ? 1 : 0);
    const migCount = m?.imageCount != null ? m.imageCount : (m?.hasImages ? 1 : 0);
    const validated = s && m && srcCount === migCount;
    items.push({ id: `row-${i}`, label: `Row ${i}`, status: validated ? 'validated' : 'pending', sourceMatch: validated });
  }
  const srcMm = source.megamenu || {};
  const migMm = migrated.megamenu || {};
  if (srcMm.columnCount !== undefined && srcMm.columnCount > 0) {
    const srcMmCount = srcMm.imageCount != null ? srcMm.imageCount : (srcMm.hasImages ? 1 : 0);
    const migMmCount = migMm.imageCount != null ? migMm.imageCount : (migMm.hasImages ? 1 : 0);
    items.push({
      id: 'megamenu',
      label: 'Megamenu',
      status: srcMm.columnCount === migMm.columnCount && srcMmCount === migMmCount ? 'validated' : 'pending',
      sourceMatch: srcMm.columnCount === migMm.columnCount && srcMmCount === migMmCount,
    });
    const srcCols = srcMm.columns || [];
    const migCols = migMm.columns || [];
    for (let i = 0; i < Math.max(srcCols.length, migCols.length); i++) {
      const s = srcCols[i];
      const m = migCols[i];
      const srcColCount = s?.imageCount != null ? s.imageCount : (s?.hasImages ? 1 : 0);
      const migColCount = m?.imageCount != null ? m.imageCount : (m?.hasImages ? 1 : 0);
      const validated = s && m && srcColCount === migColCount;
      items.push({ id: `megamenu-column-${i}`, label: `Megamenu column ${i}`, status: validated ? 'validated' : 'pending', sourceMatch: validated });
    }
  }
  const allValidated = items.every((it) => it.status === 'validated');
  return { items, allValidated };
}

function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--threshold') && !a.startsWith('--output-register'));
  const thresholdArg = process.argv.slice(2).find((a) => a.startsWith('--threshold'));
  const registerArg = process.argv.slice(2).find((a) => a.startsWith('--output-register'));
  const threshold = thresholdArg ? parseInt(thresholdArg.split('=')[1], 10) : 95;
  const outputRegisterPath = registerArg ? registerArg.split('=')[1] : null;

  if (args.length < 4) {
    console.error('Usage: node compare-structural-schema.js <phase-1.json> <phase-2.json> <phase-3.json> <migrated-structural-summary.json> [--threshold=95] [--output-register=schema-register.json]');
    process.exit(1);
  }

  const [p1Path, p2Path, p3Path, migPath] = args;
  for (const p of [p1Path, p2Path, p3Path, migPath]) {
    if (!fs.existsSync(path.resolve(p))) {
      console.error('Error: file not found:', p);
      process.exit(1);
    }
  }

  let p1, p2, p3, migrated;
  try {
    p1 = loadJson(p1Path);
    p2 = loadJson(p2Path);
    p3 = loadJson(p3Path);
    migrated = loadJson(migPath);
  } catch (e) {
    console.error('Error: invalid JSON:', e.message);
    process.exit(1);
  }

  debugLog('START', `compare-structural-schema.js invoked — threshold=${threshold}, outputRegister=${outputRegisterPath || 'none'}`);

  const source = buildSourceSummary(p1, p2, p3);
  const compareResult = compare(source, migrated);
  const { similarity, mismatches } = compareResult;

  if (outputRegisterPath) {
    const register = buildRegisterItems(source, migrated, compareResult);
    try {
      fs.writeFileSync(path.resolve(outputRegisterPath), JSON.stringify(register, null, 2), 'utf8');
    } catch (e) {
      console.error('Error writing schema register:', e.message);
    }
  }

  console.log(`Structural similarity: ${similarity}% (threshold ${threshold}%)`);
  if (mismatches.length > 0) {
    console.error('Mismatches:');
    mismatches.forEach((m) => console.error('  ', m));
  }

  if (similarity >= threshold) {
    debugLog('PASS', `PASSED — similarity=${similarity}% (>= ${threshold}%), mismatches=${mismatches.length}${outputRegisterPath ? ', register written to ' + outputRegisterPath : ''}`);
    process.exit(0);
  }
  debugLog('BLOCK', `FAILED — similarity=${similarity}% (< ${threshold}%), mismatches: ${mismatches.join('; ')}`);
  process.exit(1);
}

main();
