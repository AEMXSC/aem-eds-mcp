#!/usr/bin/env node

/*
 * audit-header-images.js
 *
 * Three modes:
 *
 * 1) NAV MODE (expected vs actual from phase files):
 *    Compares EXPECTED header/nav images (from phase-2, phase-3, megamenu-mapping)
 *    with ACTUAL images in nav.plain.html and on disk.
 *    Usage: node scripts/audit-header-images.js <nav-file> <validation-dir>
 *
 * 2) URL MODE (produce image manifest from live page):
 *    Navigate to URL, collect ALL images in header: <img>, <svg>, CSS background-image.
 *    Usage: node scripts/audit-header-images.js --url=<url> --output=<manifest.json>
 *
 * 3) COMPARE MODE (source vs migrated manifest):
 *    Require migrated.total >= source.total; list source images not in migrated.
 *    Usage: node scripts/audit-header-images.js --compare=source-manifest.json --against=migrated-manifest.json [--validation-dir=...]
 *
 * Exit codes: 0 = pass, 1 = fail, 2 = usage error
 */

import fs from 'fs';
import path from 'path';

function debugLog(validationDir, level, msg) {
  const ts = new Date().toISOString();
  const prefix = { ERROR: '❌', PASS: '✅', BLOCK: '🚫', START: '🔵', END: '🏁' }[level] || 'ℹ️';
  const entry = `[${ts}] ${prefix} [SCRIPT:audit-header-images] [${level}] ${msg}\n`;
  try {
    if (validationDir && fs.existsSync(validationDir)) {
      fs.appendFileSync(path.join(validationDir, 'debug.log'), entry);
    }
  } catch (_) { /* ignore */ }
}

function loadJson(filePath) {
  try {
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (_) { /* ignore */ }
  return null;
}

/** Extract image paths from HTML <img src="..."> and markdown ![alt](path) */
function extractImagePaths(content) {
  const paths = [];
  let m;
  const mdPattern = /!\[.*?\]\(([^)]+)\)/g;
  while ((m = mdPattern.exec(content)) !== null) paths.push(m[1].trim());
  const htmlPattern = /<img\s[^>]*src=["']([^"']+)["']/gi;
  while ((m = htmlPattern.exec(content)) !== null) paths.push(m[1].trim());
  return paths;
}

/**
 * Build expected image slots from phase-2, phase-3, megamenu-mapping.
 * Returns { expectedSlots: [{ location, description }], expectedCount }.
 * validationDirAbs = absolute path to blocks/header/navigation-validation.
 */
function buildExpectedSlots(validationDirAbs) {
  const slots = [];
  const p2 = loadJson(path.join(validationDirAbs, 'phase-2-row-mapping.json'));
  const p3 = loadJson(path.join(validationDirAbs, 'phase-3-megamenu.json'));
  const mm = loadJson(path.join(validationDirAbs, 'megamenu-mapping.json'));

  if (p2?.rows) {
    for (const row of p2.rows) {
      if (row.hasImages) {
        slots.push({
          location: `Row ${row.index ?? '?'}`,
          description: 'Logo, icons, or images in this row',
        });
      }
    }
  }

  if (p3) {
    if (p3.hasImages) {
      slots.push({ location: 'Megamenu (overall)', description: 'Megamenu images (thumbnails, banners, cards)' });
    }
    if (p3.columns) {
      for (const col of p3.columns) {
        if (col.hasImages) {
          slots.push({
            location: `Megamenu column ${col.columnIndex ?? '?'}`,
            description: `Images in megamenu column ${col.columnIndex ?? '?'}`,
          });
        }
      }
    }
  }

  if (mm?.navTriggers) {
    for (const trigger of mm.navTriggers) {
      const label = trigger.label || `Trigger ${trigger.index ?? '?'}`;
      if (trigger.featuredArea?.exists && (trigger.featuredArea?.type || trigger.panelLayout)) {
        slots.push({
          location: `Megamenu "${label}"`,
          description: 'Featured area / hero image',
        });
      }
      if (trigger.panelItems) {
        for (const item of trigger.panelItems) {
          if (item.hasImage || item.type === 'image-card' || item.type === 'image-link' || item.type === 'promotional') {
            slots.push({
              location: `Megamenu "${label}" → ${item.label || 'item'}`,
              description: item.imageUrl ? `Feature card / image (${item.label || 'item'})` : `Panel item image (${item.label || 'item'})`,
            });
          }
        }
        if (trigger.categoryTabs) {
          for (const tab of trigger.categoryTabs) {
            // Tabs usually don't have their own images; skip unless we add hasImage later
          }
        }
      }
    }
  }

  return { expectedSlots: slots, expectedCount: slots.length };
}

/** URL mode: collect all header images (img, svg, background-image) and write manifest. */
async function runUrlMode(url, outputPath, validationDir) {
  let chromium;
  try {
    const pw = await import('playwright');
    chromium = pw.chromium;
  } catch (e) {
    console.error('Playwright required for --url mode. Install: npm install playwright');
    process.exit(2);
  }
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const manifest = await page.evaluate((baseUrl) => {
      const header = document.querySelector('header, [role="banner"]');
      const root = header || document.body;
      const images = [];
      const seen = new Set();
      const add = (entry) => {
        const key = (entry.sourceUrl || entry.src || '').trim();
        if (key && !seen.has(key)) { seen.add(key); images.push(entry); }
      };
      root.querySelectorAll('img').forEach(el => {
        const rect = el.getBoundingClientRect();
        const src = el.getAttribute('src') || el.currentSrc || '';
        if (!src) return;
        const full = src.startsWith('http') ? src : new URL(src, baseUrl).href;
        add({ type: 'img', sourceUrl: full, localFilename: (src.split('/').pop() || '').replace(/\?.*$/, ''), description: (el.getAttribute('alt') || '').slice(0, 80), context: 'header', visible: rect.height > 0 && rect.width > 0, size: `${Math.round(rect.width)}x${Math.round(rect.height)}` });
      });
      root.querySelectorAll('svg').forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.height === 0 && rect.width === 0) return;
        const cls = (el.getAttribute('class') || '').slice(0, 60);
        add({ type: 'svg', sourceUrl: '', localFilename: '', description: cls || 'svg', context: 'header', visible: true, size: `${Math.round(rect.width)}x${Math.round(rect.height)}` });
      });
      root.querySelectorAll('*').forEach(el => {
        const bg = window.getComputedStyle(el).backgroundImage;
        if (!bg || bg === 'none' || bg.includes('gradient') || !bg.includes('url(')) return;
        const m = bg.match(/url\(["']?([^"')]+)["']?\)/);
        if (!m) return;
        const src = m[1].trim();
        const full = src.startsWith('http') ? src : new URL(src, baseUrl).href;
        const rect = el.getBoundingClientRect();
        if (rect.height < 20 || rect.width < 20) return;
        add({ type: 'background-image', sourceUrl: full, localFilename: (src.split('/').pop() || '').replace(/\?.*$/, ''), description: (el.getAttribute('class') || '').slice(0, 60), context: 'header', visible: true, size: `${Math.round(rect.width)}x${Math.round(rect.height)}` });
      });
      const imgTags = images.filter(i => i.type === 'img').length;
      const svgTags = images.filter(i => i.type === 'svg').length;
      const bgImages = images.filter(i => i.type === 'background-image').length;
      return { url: baseUrl, timestamp: new Date().toISOString(), images, summary: { imgTags, svgTags, bgImages, total: images.length } };
    }, url);
    await browser.close();
    const outAbs = path.isAbsolute(outputPath) ? outputPath : path.join(process.cwd(), outputPath);
    fs.mkdirSync(path.dirname(outAbs), { recursive: true });
    fs.writeFileSync(outAbs, JSON.stringify(manifest, null, 2));
    console.log(`Wrote manifest: ${outAbs}`);
    console.log(`Summary: img ${manifest.summary.imgTags}, svg ${manifest.summary.svgTags}, bgImages ${manifest.summary.bgImages}, total ${manifest.summary.total}`);
    if (validationDir) debugLog(path.resolve(validationDir), 'PASS', `URL manifest — ${manifest.summary.total} images`);
    process.exit(0);
  } catch (e) {
    await browser.close().catch(() => {});
    console.error('FAIL:', e.message);
    process.exit(1);
  }
}

/** Compare mode: source vs migrated manifest; exit 1 if migrated has fewer images. */
function runCompareMode(comparePath, againstPath, validationDir) {
  const srcManifest = loadJson(path.resolve(comparePath));
  const migManifest = loadJson(path.resolve(againstPath));
  if (!srcManifest || !Array.isArray(srcManifest.images)) {
    console.error('FAIL: Source manifest invalid or missing images array:', comparePath);
    process.exit(2);
  }
  if (!migManifest || !Array.isArray(migManifest.images)) {
    console.error('FAIL: Migrated manifest invalid or missing images array:', againstPath);
    process.exit(2);
  }
  const srcTotal = srcManifest.summary?.total ?? srcManifest.images.length;
  const migTotal = migManifest.summary?.total ?? migManifest.images.length;
  const migUrls = new Set((migManifest.images || []).map(i => (i.sourceUrl || '').trim()).filter(Boolean));
  const migFiles = new Set((migManifest.images || []).map(i => (i.localFilename || '').trim()).filter(Boolean));
  const missing = srcManifest.images.filter(srcImg => {
    const url = (srcImg.sourceUrl || '').trim();
    const file = (srcImg.localFilename || (url ? path.basename(url.replace(/\?.*$/, '')) : '')).trim();
    return !(url && migUrls.has(url)) && !(file && migFiles.has(file)) && !(migManifest.images || []).some(m => (m.sourceUrl || '').trim() === url || (m.localFilename || '').trim() === file);
  });
  const passed = migTotal >= srcTotal && missing.length === 0;
  const report = { timestamp: new Date().toISOString(), sourceTotal: srcTotal, migratedTotal: migTotal, missingCount: missing.length, missing, passed };
  const reportDir = validationDir ? path.resolve(validationDir) : path.dirname(path.resolve(againstPath));
  const reportPath = path.join(reportDir, 'image-manifest-compare-report.json');
  try { fs.writeFileSync(reportPath, JSON.stringify(report, null, 2)); } catch (_) {}
  if (passed) {
    try { fs.writeFileSync(path.join(reportDir, '.image-manifest-compare-passed'), JSON.stringify({ timestamp: new Date().toISOString() })); } catch (_) {}
    if (validationDir) debugLog(reportDir, 'PASS', `Compare passed — source ${srcTotal}, migrated ${migTotal}`);
    console.log(`Compare passed: migrated ${migTotal} >= source ${srcTotal}`);
    process.exit(0);
  }
  console.error(`Compare FAILED: migrated ${migTotal} < source ${srcTotal} or ${missing.length} source image(s) not in migrated.`);
  missing.forEach(m => console.error(`  - ${m.description || m.context}: ${m.sourceUrl || m.localFilename}`));
  if (validationDir) debugLog(reportDir, 'BLOCK', `Compare failed — migrated ${migTotal} vs source ${srcTotal}, missing ${missing.length}`);
  process.exit(1);
}

function runNavMode(navFile, validationDir) {
  const workspaceRoot = process.cwd();
  const navPath = path.isAbsolute(navFile) ? navFile : path.join(workspaceRoot, navFile);
  const valDirPath = path.isAbsolute(validationDir) ? validationDir : path.join(workspaceRoot, validationDir);
  debugLog(valDirPath, 'START', `audit-header-images.js (nav mode) — navFile=${navPath}, validationDir=${valDirPath}`);

  if (!fs.existsSync(navPath)) {
    console.error(`FAIL: Nav file not found: ${navPath}`);
    debugLog(valDirPath, 'BLOCK', `Nav file not found: ${navPath}`);
    process.exit(2);
  }

  const validationDirResolved = path.isAbsolute(valDirPath) ? valDirPath : path.resolve(workspaceRoot, valDirPath);
  const p2Path = path.join(validationDirResolved, 'phase-2-row-mapping.json');
  if (!fs.existsSync(p2Path)) {
    console.error(`FAIL: phase-2-row-mapping.json not found at ${p2Path}. Run Phase 2 first.`);
    debugLog(validationDirResolved, 'BLOCK', 'phase-2-row-mapping.json missing');
    process.exit(2);
  }

  const { expectedSlots, expectedCount } = buildExpectedSlots(validationDirResolved);

  const navContent = fs.readFileSync(navPath, 'utf-8');
  const imagePaths = extractImagePaths(navContent);
  const uniquePaths = [...new Set(imagePaths)];

  const navDir = path.dirname(navPath);
  let validatedOnDisk = 0;
  const missingOrEmpty = [];
  const localPaths = uniquePaths.filter(p => !p.startsWith('http://') && !p.startsWith('https://') && !p.startsWith('//'));

  for (const imgPath of localPaths) {
    if (imgPath.startsWith('/')) {
      missingOrEmpty.push({ path: imgPath, reason: 'Absolute path (leading /) — use relative e.g. images/file.ext' });
      continue;
    }
    const resolved = path.resolve(navDir, imgPath);
    let filePath = null;
    if (fs.existsSync(resolved)) filePath = resolved;
    else if (fs.existsSync(path.resolve(workspaceRoot, imgPath))) filePath = path.resolve(workspaceRoot, imgPath);
    if (!filePath) {
      missingOrEmpty.push({ path: imgPath, reason: 'File not found on disk' });
      continue;
    }
    const stat = fs.statSync(filePath);
    if (stat.size === 0) {
      missingOrEmpty.push({ path: imgPath, reason: 'File is 0 bytes (broken download)' });
      continue;
    }
    validatedOnDisk++;
  }

  const actualCount = validatedOnDisk;
  const passed = missingOrEmpty.length === 0 && actualCount >= expectedCount;
  const missingByLocation = actualCount < expectedCount
    ? expectedSlots.slice(actualCount).map(s => `${s.location}: ${s.description}`)
    : [];

  const report = {
    timestamp: new Date().toISOString(),
    expectedCount,
    actualCount,
    validatedOnDisk,
    uniqueRefsInNav: uniquePaths.length,
    passed,
    expectedSlots: expectedSlots.map(s => ({ location: s.location, description: s.description })),
    missingByLocation,
    missingOrEmpty: missingOrEmpty.map(({ path: p, reason }) => ({ path: p, reason })),
  };

  const reportPath = path.join(validationDirResolved, 'image-audit-report.json');
  try {
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  } catch (e) {
    console.error(`FAIL: Could not write ${reportPath}: ${e.message}`);
    process.exit(1);
  }

  console.log('=== Header Image Audit ===');
  console.log(`Expected (from phase-2/3 + megamenu-mapping): ${expectedCount} image slot(s)`);
  console.log(`In nav (unique refs): ${uniquePaths.length}`);
  console.log(`On disk (exist + size > 0): ${validatedOnDisk}`);
  if (missingByLocation.length > 0) {
    console.log('\nMissing by location (expected but not satisfied):');
    missingByLocation.forEach((m, i) => console.log(`  ${i + 1}. ${m}`));
  }
  if (missingOrEmpty.length > 0) {
    console.log('\nMissing or broken files:');
    missingOrEmpty.forEach(({ path: p, reason }) => console.log(`  - ${p}: ${reason}`));
  }

  if (!passed) {
    console.log('\n=== AUDIT FAILED ===');
    console.log('Fix: Download all expected images to content/images/, reference them in nav.plain.html, then re-run validate-nav-content.js and audit-header-images.js.');
    debugLog(validationDirResolved, 'BLOCK', `FAILED — expected ${expectedCount}, actual ${actualCount}, missingOrEmpty ${missingOrEmpty.length}; missingByLocation: ${missingByLocation.length}`);
    const markerPath = path.join(validationDirResolved, '.image-audit-passed');
    try { if (fs.existsSync(markerPath)) fs.unlinkSync(markerPath); } catch (_) { /* ignore */ }
    process.exit(1);
  }

  console.log('\n=== AUDIT PASSED ===');
  debugLog(validationDirResolved, 'PASS', `PASSED — expected ${expectedCount}, actual ${actualCount}, validatedOnDisk ${validatedOnDisk}`);
  try {
    fs.writeFileSync(
      path.join(validationDirResolved, '.image-audit-passed'),
      JSON.stringify({ timestamp: new Date().toISOString(), expectedCount, actualCount, validatedOnDisk })
    );
  } catch (_) { /* ignore */ }
  process.exit(0);
}

async function main() {
  const args = process.argv.slice(2);
  let navFile = null;
  let validationDir = null;
  let url = null;
  let output = null;
  let compare = null;
  let against = null;
  for (const arg of args) {
    if (arg.startsWith('--url=')) url = arg.slice(6).trim();
    else if (arg.startsWith('--output=')) output = arg.slice(9).trim();
    else if (arg.startsWith('--compare=')) compare = arg.slice(10).trim();
    else if (arg.startsWith('--against=')) against = arg.slice(10).trim();
    else if (arg.startsWith('--nav-file=')) navFile = arg.slice('--nav-file='.length);
    else if (arg.startsWith('--validation-dir=')) validationDir = arg.slice('--validation-dir='.length);
    else if (!navFile) navFile = arg;
    else if (!validationDir) validationDir = arg;
  }
  if (url && output) {
    await runUrlMode(url, output, validationDir || null);
    return;
  }
  if (compare && against) {
    runCompareMode(compare, against, validationDir || path.dirname(path.resolve(against)));
    return;
  }
  if (!navFile || !validationDir) {
    console.error('Usage:');
    console.error('  Nav mode:   node audit-header-images.js <nav-file> <validation-dir>');
    console.error('  URL mode:   node audit-header-images.js --url=<url> --output=<manifest.json>');
    console.error('  Compare:    node audit-header-images.js --compare=source-manifest.json --against=migrated-manifest.json [--validation-dir=...]');
    process.exit(2);
  }
  runNavMode(navFile, validationDir);
}

main();
