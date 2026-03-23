#!/usr/bin/env node

/*
 * compare-computed-styles.js
 *
 * Deterministic CSS computed-style comparison between source and migrated
 * header components. Replaces LLM visual judgment with programmatic diff.
 *
 * Reads source-styles.json and migrated-styles.json (extracted via Playwright
 * getComputedStyle), compares visually significant CSS properties, and produces
 * a critique-report.json with similarity score, diffs, and CSS fix suggestions.
 *
 * Usage:
 *   node scripts/compare-computed-styles.js \
 *     <source-styles.json> <migrated-styles.json> \
 *     --component-id=<id> \
 *     --output=<critique-report.json>
 *
 * Exit codes:
 *   0 = similarity >= 95%
 *   1 = similarity < 95% (needs fixes)
 *   2 = usage error
 */

import fs from 'fs';
import path from 'path';

function debugLog(level, msg) {
  const ts = new Date().toISOString();
  const prefix = { ERROR: '❌', PASS: '✅', BLOCK: '🚫', START: '🔵', END: '🏁' }[level] || 'ℹ️';
  const entry = `[${ts}] ${prefix} [SCRIPT:compare-computed-styles] [${level}] ${msg}\n`;
  try {
    const logDir = path.resolve('blocks/header/navigation-validation');
    if (fs.existsSync(logDir)) fs.appendFileSync(path.join(logDir, 'debug.log'), entry);
  } catch (_) { /* ignore */ }
}

const VISUAL_PROPERTIES = {
  color: {
    weight: 3,
    props: [
      'color', 'background-color', 'border-color',
      'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
      'outline-color', 'text-decoration-color', 'caret-color',
    ],
  },
  typography: {
    weight: 2.5,
    props: [
      'font-family', 'font-size', 'font-weight', 'font-style',
      'line-height', 'letter-spacing', 'word-spacing',
      'text-transform', 'text-decoration', 'text-decoration-line',
      'text-align', 'white-space',
    ],
  },
  spacing: {
    weight: 2,
    props: [
      'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
      'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
      'gap', 'row-gap', 'column-gap',
    ],
  },
  sizing: {
    weight: 3,
    props: [
      'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
    ],
  },
  border: {
    weight: 2,
    props: [
      'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
      'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
      'border-top-left-radius', 'border-top-right-radius',
      'border-bottom-left-radius', 'border-bottom-right-radius',
    ],
  },
  layout: {
    weight: 3,
    props: [
      'display', 'flex-direction', 'justify-content', 'align-items', 'flex-wrap',
      'position', 'float', 'clear', 'overflow', 'overflow-x', 'overflow-y',
    ],
  },
  effects: {
    weight: 1.5,
    props: [
      'opacity', 'visibility', 'box-shadow', 'text-shadow',
      'transform', 'filter', 'backdrop-filter',
    ],
  },
  background: {
    weight: 2,
    props: [
      'background-image', 'background-size', 'background-position',
      'background-repeat', 'background-clip',
    ],
  },
  misc: {
    weight: 1,
    props: [
      'cursor', 'pointer-events', 'user-select', 'z-index',
      'list-style-type', 'list-style-position',
    ],
  },
};

function parseColor(val) {
  if (!val || val === 'none' || val === 'transparent') return null;
  const rgba = val.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/);
  if (rgba) return { r: +rgba[1], g: +rgba[2], b: +rgba[3], a: rgba[4] !== undefined ? +rgba[4] : 1 };
  const hex = val.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1];
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 };
  }
  return null;
}

function colorDistance(c1, c2) {
  if (!c1 && !c2) return 0;
  if (!c1 || !c2) return 1;
  const dr = (c1.r - c2.r) / 255;
  const dg = (c1.g - c2.g) / 255;
  const db = (c1.b - c2.b) / 255;
  const da = c1.a - c2.a;
  return Math.sqrt((dr * dr + dg * dg + db * db + da * da) / 4);
}

function parsePx(val) {
  if (!val || val === 'auto' || val === 'none' || val === 'normal') return null;
  const m = val.match(/([\d.]+)\s*px/);
  return m ? parseFloat(m[1]) : null;
}

function pxDistance(v1, v2, maxDelta = 50) {
  if (v1 === null && v2 === null) return 0;
  if (v1 === null || v2 === null) return 0.5;
  return Math.min(Math.abs(v1 - v2) / maxDelta, 1);
}

function stringMatch(s1, s2) {
  if (!s1 && !s2) return 0;
  if (!s1 || !s2) return 0.8;
  const a = s1.toLowerCase().trim();
  const b = s2.toLowerCase().trim();
  if (a === b) return 0;
  if (a === 'none' && b === 'none') return 0;
  if (a.includes(b) || b.includes(a)) return 0.2;
  return 0.8;
}

function normalizeAuto(val) {
  if (!val || val === 'none' || val === 'auto' || val === 'normal' || val === '0px') return '';
  return val.toLowerCase().trim();
}

function compareProperty(prop, sourceVal, migratedVal, category) {
  const s = normalizeAuto(sourceVal);
  const m = normalizeAuto(migratedVal);

  if (s === m) return { dissimilarity: 0, noticeability: 0 };

  if (category === 'color') {
    const sc = parseColor(sourceVal);
    const mc = parseColor(migratedVal);
    const dist = colorDistance(sc, mc);
    const notice = dist < 0.05 ? 0.1 : dist < 0.15 ? 0.3 : dist < 0.3 ? 0.5 : dist < 0.5 ? 0.7 : 0.9;
    return { dissimilarity: dist, noticeability: notice };
  }

  if (category === 'typography' && prop === 'font-family') {
    const sf = (sourceVal || '').split(',')[0].replace(/['"]/g, '').trim().toLowerCase();
    const mf = (migratedVal || '').split(',')[0].replace(/['"]/g, '').trim().toLowerCase();
    if (sf === mf) return { dissimilarity: 0, noticeability: 0 };
    const genericFonts = ['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui'];
    if (genericFonts.includes(sf) && genericFonts.includes(mf)) {
      return sf === mf ? { dissimilarity: 0, noticeability: 0 } : { dissimilarity: 0.5, noticeability: 0.6 };
    }
    return { dissimilarity: 0.6, noticeability: 0.7 };
  }

  const spx = parsePx(sourceVal);
  const mpx = parsePx(migratedVal);
  if (spx !== null || mpx !== null) {
    let maxDelta = 50;
    if (category === 'spacing') maxDelta = 30;
    if (category === 'border') maxDelta = 10;
    if (prop === 'font-size') maxDelta = 20;
    if (prop.includes('radius')) maxDelta = 20;

    const dist = pxDistance(spx, mpx, maxDelta);
    const absDiff = Math.abs((spx || 0) - (mpx || 0));
    let notice = 0;
    if (absDiff <= 1) notice = 0.05;
    else if (absDiff <= 2) notice = 0.15;
    else if (absDiff <= 4) notice = 0.3;
    else if (absDiff <= 8) notice = 0.5;
    else if (absDiff <= 16) notice = 0.7;
    else notice = 0.9;
    return { dissimilarity: dist, noticeability: notice };
  }

  if (category === 'layout') {
    if (s === '' && m === '' || s === m) return { dissimilarity: 0, noticeability: 0 };
    if ((s === 'flex' && m === 'block') || (s === 'block' && m === 'flex') ||
        (s === 'grid' && m === 'flex') || (s === 'flex' && m === 'grid')) {
      return { dissimilarity: 0.7, noticeability: 0.8 };
    }
    return { dissimilarity: 0.5, noticeability: 0.6 };
  }

  return { dissimilarity: stringMatch(sourceVal, migratedVal), noticeability: 0.5 };
}

function determinePriority(dissimilarity, noticeability, category) {
  const score = dissimilarity * 0.6 + noticeability * 0.4;
  if (score >= 0.6 || category === 'layout' || category === 'sizing') return 'HIGH';
  if (score >= 0.3) return 'MEDIUM';
  return 'LOW';
}

function main() {
  const args = process.argv.slice(2);
  let componentId = 'unknown';
  let outputPath = null;
  const positional = [];

  for (const arg of args) {
    if (arg.startsWith('--component-id=')) componentId = arg.split('=')[1];
    else if (arg.startsWith('--output=')) outputPath = arg.split('=')[1];
    else positional.push(arg);
  }

  if (positional.length < 2) {
    console.error('Usage: node compare-computed-styles.js <source-styles.json> <migrated-styles.json> --component-id=<id> --output=<report.json>');
    process.exit(2);
  }

  const [sourceStylesPath, migratedStylesPath] = positional;

  if (!fs.existsSync(sourceStylesPath)) { console.error(`Source styles not found: ${sourceStylesPath}`); process.exit(2); }
  if (!fs.existsSync(migratedStylesPath)) { console.error(`Migrated styles not found: ${migratedStylesPath}`); process.exit(2); }

  let sourceStyles, migratedStyles;
  try {
    sourceStyles = JSON.parse(fs.readFileSync(sourceStylesPath, 'utf-8'));
    migratedStyles = JSON.parse(fs.readFileSync(migratedStylesPath, 'utf-8'));
  } catch (e) {
    console.error(`Failed to parse styles JSON: ${e.message}`);
    process.exit(2);
  }

  debugLog('START', `compare-computed-styles.js — component=${componentId}, source=${sourceStylesPath}, migrated=${migratedStylesPath}`);

  const differences = [];
  const cssFixes = [];
  let totalWeightedDissimilarity = 0;
  let totalWeight = 0;
  let propsCompared = 0;

  for (const [category, config] of Object.entries(VISUAL_PROPERTIES)) {
    for (const prop of config.props) {
      const sourceVal = sourceStyles[prop];
      const migratedVal = migratedStyles[prop];

      if (sourceVal === undefined && migratedVal === undefined) continue;

      propsCompared++;
      const result = compareProperty(prop, sourceVal, migratedVal, category);

      if (result.dissimilarity > 0.05) {
        differences.push({
          element: componentId,
          property: prop,
          category,
          sourceValue: sourceVal || '(not set)',
          migratedValue: migratedVal || '(not set)',
          dissimilarity_score: Math.round(result.dissimilarity * 100) / 100,
          noticeability_score: Math.round(result.noticeability * 100) / 100,
          description: `${prop}: "${sourceVal || 'not set'}" → "${migratedVal || 'not set'}"`,
        });

        if (result.dissimilarity > 0.1) {
          cssFixes.push({
            selector: `/* ${componentId} */`,
            property: prop,
            sourceValue: sourceVal || 'not set',
            migratedValue: migratedVal || 'not set',
            priority: determinePriority(result.dissimilarity, result.noticeability, category),
          });
        }
      }

      totalWeightedDissimilarity += result.dissimilarity * config.weight;
      totalWeight += config.weight;
    }
  }

  const avgDissimilarity = totalWeight > 0 ? totalWeightedDissimilarity / totalWeight : 0;
  const similarity = Math.round((1 - avgDissimilarity) * 10000) / 100;
  const grade = similarity >= 95 ? 'Excellent' : similarity >= 85 ? 'Good' : similarity >= 70 ? 'Fair' : 'Poor';

  differences.sort((a, b) => b.dissimilarity_score - a.dissimilarity_score);
  cssFixes.sort((a, b) => {
    const pri = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return (pri[a.priority] ?? 3) - (pri[b.priority] ?? 3);
  });

  const report = {
    componentId,
    similarity,
    grade,
    method: 'deterministic-computed-style',
    propsCompared,
    totalDifferences: differences.length,
    highPriorityFixes: cssFixes.filter(f => f.priority === 'HIGH').length,
    differences: differences.slice(0, 50),
    css_fixes: cssFixes.slice(0, 30),
    timestamp: new Date().toISOString(),
  };

  console.log(`=== Computed Style Comparison: ${componentId} ===`);
  console.log(`Properties compared: ${propsCompared}`);
  console.log(`Differences found: ${differences.length} (${cssFixes.filter(f => f.priority === 'HIGH').length} HIGH, ${cssFixes.filter(f => f.priority === 'MEDIUM').length} MEDIUM, ${cssFixes.filter(f => f.priority === 'LOW').length} LOW)`);
  console.log(`Similarity: ${similarity}% (${grade})`);

  if (differences.length > 0) {
    console.log('\nTop differences:');
    for (const d of differences.slice(0, 10)) {
      console.log(`  [${d.category}] ${d.property}: "${d.sourceValue}" → "${d.migratedValue}" (dissim=${d.dissimilarity_score}, notice=${d.noticeability_score})`);
    }
  }

  if (cssFixes.length > 0) {
    console.log('\nCSS fixes needed:');
    for (const f of cssFixes.slice(0, 10)) {
      console.log(`  [${f.priority}] ${f.property}: set to "${f.sourceValue}" (currently "${f.migratedValue}")`);
    }
  }

  if (outputPath) {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(`\nReport written to: ${outputPath}`);
  } else {
    console.log('\n' + JSON.stringify(report, null, 2));
  }

  if (similarity >= 95) {
    debugLog('PASS', `PASSED — ${componentId} similarity=${similarity}% (>= 95%), ${differences.length} diffs`);
    console.log(`\n=== VALIDATED (${similarity}%) ===`);
    process.exit(0);
  } else {
    debugLog('BLOCK', `FAILED — ${componentId} similarity=${similarity}% (< 95%), ${cssFixes.filter(f => f.priority === 'HIGH').length} HIGH priority fixes`);
    console.log(`\n=== NEEDS FIXES (${similarity}%) ===`);
    process.exit(1);
  }
}

main();
