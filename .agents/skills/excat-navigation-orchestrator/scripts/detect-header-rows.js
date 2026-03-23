#!/usr/bin/env node

/*
 * detect-header-rows.js
 *
 * MANDATORY Phase 1 script — programmatic row detection from live page.
 * Never set rowCount from screenshot alone. This script MUST run before phase-1-row-detection.json.
 *
 * Uses Playwright to navigate, run page.evaluate(), and write phase-1-row-detection.json.
 * Writes .row-detection-complete marker so the gate can enforce execution.
 *
 * Usage:
 *   node scripts/detect-header-rows.js --url=<source-url> [--validation-dir=<path>] [--viewport=1440x900]
 *
 * Example:
 *   node scripts/detect-header-rows.js --url=https://www.example.com --validation-dir=blocks/header/navigation-validation
 *
 * Exit codes:
 *   0 = success, phase-1 written
 *   1 = script error (navigation failed, no header found)
 *   2 = usage error
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Auto-detect local playwright-browsers — use executablePath to bypass env-var timing
function findLocalChromiumExecutable() {
  const localBrowsers = path.resolve(__dirname, 'playwright-browsers');
  if (!fs.existsSync(localBrowsers)) return null;
  // chromium-{version}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing
  const chromiumDirs = fs.readdirSync(localBrowsers).filter(d => d.startsWith('chromium-'));
  for (const dir of chromiumDirs) {
    const chromeMac = path.join(localBrowsers, dir, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
    if (fs.existsSync(chromeMac)) return chromeMac;
    // Linux: chrome-linux/chrome
    const chromeLinux = path.join(localBrowsers, dir, 'chrome-linux', 'chrome');
    if (fs.existsSync(chromeLinux)) return chromeLinux;
  }
  return null;
}

function debugLog(validationDir, level, msg) {
  const ts = new Date().toISOString();
  const prefix = { ERROR: '❌', PASS: '✅', BLOCK: '🚫', START: '🔵', END: '🏁' }[level] || 'ℹ️';
  const entry = `[${ts}] ${prefix} [SCRIPT:detect-header-rows] [${level}] ${msg}\n`;
  try {
    if (fs.existsSync(validationDir)) fs.appendFileSync(path.join(validationDir, 'debug.log'), entry);
  } catch (_) { /* ignore */ }
}

function parseArgs() {
  const args = process.argv.slice(2);
  let url = null;
  let validationDir = 'blocks/header/navigation-validation';
  let viewport = '1440x900';
  for (const a of args) {
    if (a.startsWith('--url=')) url = a.slice(6);
    else if (a.startsWith('--validation-dir=')) validationDir = a.slice(17);
    else if (a.startsWith('--viewport=')) viewport = a.slice(11);
  }
  return { url, validationDir, viewport };
}

async function main() {
  const { url, validationDir, viewport } = parseArgs();
  if (!url) {
    console.error('Usage: node scripts/detect-header-rows.js --url=<source-url> [--validation-dir=<path>]');
    console.error('Example: node scripts/detect-header-rows.js --url=https://www.example.com');
    process.exit(2);
  }

  const absValidationDir = path.resolve(validationDir);
  debugLog(absValidationDir, 'START', `detect-header-rows.js invoked — url=${url}, validationDir=${validationDir}`);

  let chromium;
  try {
    const pw = await import('playwright');
    chromium = pw.chromium;
  } catch (e) {
    console.error('Playwright not found. Install: npm install playwright');
    debugLog(absValidationDir, 'ERROR', `Playwright import failed: ${e.message}`);
    process.exit(2);
  }

  const [vw, vh] = viewport.split('x').map(Number) || [1440, 900];
  const execPath = findLocalChromiumExecutable();
  const launchOpts = { headless: true };
  if (execPath) launchOpts.executablePath = execPath;

  let browser;
  try {
    browser = await chromium.launch(launchOpts);
    const page = await browser.newPage();
    await page.setViewportSize({ width: vw, height: vh });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Dismiss common cookie banners
    const cookieSelectors = ['button:has-text("Accept")', 'button:has-text("Allow")', '[data-testid="cookie-accept"]', '.cookie-accept', '#onetrust-accept-btn-handler'];
    for (const sel of cookieSelectors) {
      try {
        const btn = await page.$(sel);
        if (btn) { await btn.click(); await page.waitForTimeout(500); break; }
      } catch (_) { /* ignore */ }
    }

    const result = await page.evaluate(() => {
  const header = document.querySelector('header, [role="banner"]');
  if (!header) return { rowCount: 0, bands: [], error: 'no header found' };
  const allNavs = header.querySelectorAll('nav');
  const bands = [];
  allNavs.forEach(nav => {
    const rect = nav.getBoundingClientRect();
    const style = window.getComputedStyle(nav);
    if (rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden') {
      bands.push({ label: nav.getAttribute('aria-label') || nav.className || '', top: rect.top, height: rect.height, bg: style.backgroundColor });
    }
  });
  if (bands.length < 2) {
    header.querySelectorAll(':scope > div, :scope > nav').forEach(el => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      if (rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden') {
        const already = bands.some(b => Math.abs(b.top - rect.top) < 4);
        if (!already) bands.push({ label: el.className || el.tagName, top: rect.top, height: rect.height, bg: style.backgroundColor });
      }
    });
  }
  bands.sort((a, b) => a.top - b.top);
  return { rowCount: bands.length, bands };
});

    // Semantic landmark check: visible <nav> in header — override rowCount if we missed rows
    const navLandmarks = await page.evaluate(() => {
      const header = document.querySelector('header, [role="banner"]');
      if (!header) return [];
      const navs = header.querySelectorAll('nav');
      return Array.from(navs).map(nav => {
        const rect = nav.getBoundingClientRect();
        const style = window.getComputedStyle(nav);
        return {
          ariaLabel: nav.getAttribute('aria-label') || '',
          top: rect.top,
          height: rect.height,
          width: rect.width,
          bg: style.backgroundColor,
          visible: rect.height > 0 && rect.width > 0,
        };
      }).filter(n => n.visible);
    });

    let rowCount = result.rowCount;
    if (navLandmarks.length > rowCount) {
      console.warn(`[WARN] DOM band detection found ${rowCount} rows but ${navLandmarks.length} visible <nav> landmarks exist. Overriding rowCount.`);
      rowCount = navLandmarks.length;
    }

    // Header height sanity: total header height vs sum of detected row heights
    const headerHeightResult = await page.evaluate(() => {
      const header = document.querySelector('header, [role="banner"]');
      if (header) return { height: header.getBoundingClientRect().height };
      const navs = document.querySelectorAll('nav');
      if (navs.length === 0) return { height: 0 };
      const parent = navs[0].closest('div');
      return { height: parent ? parent.getBoundingClientRect().height : 0 };
    });

    const headerHeight = headerHeightResult?.height ?? 0;
    const sumOfDetectedRowHeights = (result.bands || []).reduce((sum, r) => sum + (r.height || 0), 0);
    let heightMismatch = false;
    if (headerHeight > 0 && sumOfDetectedRowHeights > 0 && headerHeight > sumOfDetectedRowHeights * 1.3) {
      console.warn(`[WARN] Header total height (${Math.round(headerHeight)}px) is significantly larger than sum of detected rows (${Math.round(sumOfDetectedRowHeights)}px). Likely a missed row.`);
      heightMismatch = true;
    }

    await browser.close();

    if (result.error) {
      console.error(`FAIL: ${result.error}`);
      debugLog(absValidationDir, 'BLOCK', `FAILED — ${result.error}`);
      process.exit(1);
    }

    const phase1 = {
      rowCount,
      navLandmarkCount: navLandmarks.length,
      confidence: rowCount > 0 ? 0.95 : 0,
      uncertainty: rowCount === 0,
      notes: result.bands.length > 0 ? result.bands.map(b => `Row: ${b.label || 'unnamed'}, top=${Math.round(b.top)}px, height=${Math.round(b.height)}px`) : ['No header bands detected'],
      ...(heightMismatch && {
        heightMismatch: true,
        headerTotalHeight: Math.round(headerHeight),
        detectedRowsHeight: Math.round(sumOfDetectedRowHeights),
      }),
    };

    if (!fs.existsSync(absValidationDir)) fs.mkdirSync(absValidationDir, { recursive: true });
    fs.writeFileSync(path.join(absValidationDir, 'phase-1-row-detection.json'), JSON.stringify(phase1, null, 2));
    fs.writeFileSync(path.join(absValidationDir, '.row-detection-complete'), JSON.stringify({ timestamp: new Date().toISOString(), rowCount, url, navLandmarkCount: navLandmarks.length, heightMismatch }));

    console.log(`=== Row Detection Complete ===`);
    console.log(`rowCount: ${rowCount}`);
    console.log(`Bands: ${result.bands.length}`);
    if (navLandmarks.length > (result.rowCount || 0)) console.log(`Nav landmarks: ${navLandmarks.length} (override applied)`);
    if (heightMismatch) console.log(`[WARN] heightMismatch: header ${Math.round(headerHeight)}px vs detected rows ${Math.round(sumOfDetectedRowHeights)}px — review for missed row.`);
    debugLog(absValidationDir, 'PASS', `PASSED — rowCount=${rowCount}, bands=${result.bands.length}, navLandmarks=${navLandmarks.length}, heightMismatch=${heightMismatch}`);

    process.exit(0);
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    console.error(`FAIL: ${e.message}`);
    debugLog(absValidationDir, 'BLOCK', `FAILED — ${e.message}`);
    process.exit(1);
  }
}

main();
