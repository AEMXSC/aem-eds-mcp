#!/usr/bin/env node

/*
 * detect-mobile-structure.js
 *
 * MANDATORY mobile structure script — programmatic row and item count at mobile viewport.
 * Same idea as desktop detect-header-rows.js: never rely on screenshot/observation alone.
 * Run at 375×812, detects: (1) header bar rows and items per row when closed,
 * (2) top-level menu item count when hamburger is open.
 *
 * Writes mobile/mobile-structure-detection.json and .mobile-structure-detection-complete.
 * Hook blocks mobile structural validation until this script has run.
 *
 * When mobile has more rows/items or extra images than desktop, add content to
 * nav.plain.html in a mobile-only section (mobile missing-content-register).
 *
 * Usage:
 *   node scripts/detect-mobile-structure.js --url=<source-url> [--validation-dir=<path>] [--viewport=375x812]
 *
 * Exit: 0 = success; 1 = script error; 2 = usage error.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findLocalChromiumExecutable() {
  const localBrowsers = path.resolve(__dirname, 'playwright-browsers');
  if (!fs.existsSync(localBrowsers)) return null;
  const chromiumDirs = fs.readdirSync(localBrowsers).filter((d) => d.startsWith('chromium-'));
  for (const dir of chromiumDirs) {
    const chromeMac = path.join(localBrowsers, dir, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
    if (fs.existsSync(chromeMac)) return chromeMac;
    const chromeLinux = path.join(localBrowsers, dir, 'chrome-linux', 'chrome');
    if (fs.existsSync(chromeLinux)) return chromeLinux;
  }
  return null;
}

function debugLog(validationDir, level, msg) {
  const ts = new Date().toISOString();
  const prefix = { ERROR: '❌', PASS: '✅', BLOCK: '🚫', START: '🔵', END: '🏁' }[level] || 'ℹ️';
  const entry = `[${ts}] ${prefix} [SCRIPT:detect-mobile-structure] [${level}] ${msg}\n`;
  try {
    if (validationDir && fs.existsSync(validationDir)) {
      fs.appendFileSync(path.join(validationDir, 'debug.log'), entry);
    }
  } catch (_) { /* ignore */ }
}

function parseArgs() {
  const args = process.argv.slice(2);
  let url = null;
  let validationDir = 'blocks/header/navigation-validation';
  let viewport = '375x812';
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
    console.error('Usage: node scripts/detect-mobile-structure.js --url=<source-url> [--validation-dir=<path>] [--viewport=375x812]');
    console.error('Example: node scripts/detect-mobile-structure.js --url=https://www.example.com --validation-dir=blocks/header/navigation-validation');
    process.exit(2);
  }

  const absValidationDir = path.resolve(validationDir);
  const mobileDir = path.join(absValidationDir, 'mobile');
  debugLog(absValidationDir, 'START', `detect-mobile-structure.js — url=${url}, viewport=${viewport}`);

  let chromium;
  try {
    const pw = await import('playwright');
    chromium = pw.chromium;
  } catch (e) {
    console.error('Playwright not found. Install from scripts folder: npm install playwright');
    debugLog(absValidationDir, 'ERROR', `Playwright import failed: ${e.message}`);
    process.exit(2);
  }

  const [vw, vh] = viewport.split('x').map(Number) || [375, 812];
  const execPath = findLocalChromiumExecutable();
  const launchOpts = { headless: true };
  if (execPath) launchOpts.executablePath = execPath;

  let browser;
  try {
    browser = await chromium.launch(launchOpts);
    const page = await browser.newPage();
    await page.setViewportSize({ width: vw, height: vh });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const cookieSelectors = ['button:has-text("Accept")', 'button:has-text("Allow")', '[data-testid="cookie-accept"]', '.cookie-accept', '#onetrust-accept-btn-handler'];
    for (const sel of cookieSelectors) {
      try {
        const btn = await page.$(sel);
        if (btn) {
          await btn.click();
          await page.waitForTimeout(500);
          break;
        }
      } catch (_) { /* ignore */ }
    }

    // --- Closed state: header bar rows and item count per row ---
    const closedResult = await page.evaluate(() => {
      const header = document.querySelector('header, [role="banner"]');
      if (!header) return { rowCount: 0, rows: [], error: 'no header found' };
      const bands = [];
      header.querySelectorAll(':scope > div, :scope > nav').forEach((el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        if (rect.height > 0 && rect.width > 0 && style.display !== 'none' && style.visibility !== 'hidden') {
          const itemCount = el.querySelectorAll('a, button, [role="button"]').length || 1;
          const hasImages = el.querySelectorAll('img, svg').length > 0;
          bands.push({ index: bands.length, itemCount, hasImages, top: rect.top, height: rect.height });
        }
      });
      if (bands.length === 0) {
        const rect = header.getBoundingClientRect();
        if (rect.height > 0) {
          const itemCount = header.querySelectorAll('a, button, [role="button"]').length || 1;
          const hasImages = header.querySelectorAll('img, svg').length > 0;
          bands.push({ index: 0, itemCount, hasImages, top: rect.top, height: rect.height });
        }
      }
      bands.sort((a, b) => a.top - b.top);
      return { rowCount: bands.length, rows: bands.map((b) => ({ index: b.index, itemCount: b.itemCount, hasImages: b.hasImages })), error: null };
    });

    if (closedResult.error) {
      await browser.close();
      console.error(`FAIL: ${closedResult.error}`);
      debugLog(absValidationDir, 'BLOCK', `FAILED — ${closedResult.error}`);
      process.exit(1);
    }

    // --- Open hamburger and count top-level menu items ---
    const hamburger = await page.$('.header button[aria-label*="nav" i], .header button[aria-label*="menu" i], .header button[aria-expanded], .header [class*="hamburger"], header button');
    let topLevelMenuItemCount = 0;
    let menuOpenRows = [];

    if (hamburger) {
      await hamburger.click();
      await page.waitForTimeout(600);

      const menuResult = await page.evaluate(() => {
        const header = document.querySelector('header, [role="banner"]');
        if (!header) return { topLevelMenuItemCount: 0, rows: [], hasImages: false };
        // Primary nav list: nav > ul with direct li children
        const navs = header.querySelectorAll('nav');
        let bestList = null;
        let bestCount = 0;
        navs.forEach((nav) => {
          nav.querySelectorAll('ul').forEach((ul) => {
            const items = Array.from(ul.querySelectorAll(':scope > li')).filter((li) => {
              const style = window.getComputedStyle(li);
              return style.display !== 'none' && li.getBoundingClientRect().height > 0;
            });
            if (items.length > bestCount) {
              bestCount = items.length;
              bestList = ul;
            }
          });
        });
        const itemCount = bestList ? Array.from(bestList.querySelectorAll(':scope > li')).filter((li) => window.getComputedStyle(li).display !== 'none' && li.getBoundingClientRect().height > 0).length : 0;
        const hasImages = bestList ? bestList.querySelectorAll('img, svg').length > 0 : false;
        return { topLevelMenuItemCount: itemCount, rows: [{ index: 0, itemCount, hasImages }], hasImages };
      });

      topLevelMenuItemCount = menuResult.topLevelMenuItemCount;
      menuOpenRows = menuResult.rows || [];
    }

    await browser.close();

    const rowsClosed = (closedResult.rows || []).map((r) => ({ index: r.index, itemCount: r.itemCount, hasImages: r.hasImages }));
    const rowCountClosed = rowsClosed.length;
    const rows = [...rowsClosed];
    if (topLevelMenuItemCount > 0) {
      rows.push({ index: rows.length, itemCount: topLevelMenuItemCount, hasImages: menuOpenRows[0]?.hasImages ?? false });
    }
    const rowCount = rows.length;

    const output = {
      viewport: { width: vw, height: vh },
      url,
      timestamp: new Date().toISOString(),
      rowCount,
      rows,
      headerBarRowCount: rowCountClosed,
      topLevelMenuItemCount,
      notes: [
        `Header bar (closed): ${rowCountClosed} row(s), items per row: ${rowsClosed.map((r) => r.itemCount).join(', ')}`,
        topLevelMenuItemCount > 0 ? `Menu open: ${topLevelMenuItemCount} top-level item(s)` : 'Hamburger not found or menu not opened',
      ],
    };

    if (!fs.existsSync(mobileDir)) fs.mkdirSync(mobileDir, { recursive: true });
    const detectionPath = path.join(mobileDir, 'mobile-structure-detection.json');
    const markerPath = path.join(mobileDir, '.mobile-structure-detection-complete');
    fs.writeFileSync(detectionPath, JSON.stringify(output, null, 2), 'utf-8');
    fs.writeFileSync(markerPath, JSON.stringify({ timestamp: new Date().toISOString(), rowCount, topLevelMenuItemCount, url }), 'utf-8');

    console.log('=== Mobile Structure Detection Complete ===');
    console.log(`rowCount: ${rowCount} (header bar: ${rowCountClosed}, menu list: ${topLevelMenuItemCount > 0 ? 1 : 0})`);
    console.log(`rows: ${JSON.stringify(rows)}`);
    console.log(`topLevelMenuItemCount: ${topLevelMenuItemCount}`);
    if (topLevelMenuItemCount === 0 && !hamburger) console.log('[WARN] Hamburger not found — topLevelMenuItemCount is 0.');
    debugLog(absValidationDir, 'PASS', `PASSED — rowCount=${rowCount}, topLevelMenuItemCount=${topLevelMenuItemCount}`);

    process.exit(0);
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    console.error(`FAIL: ${e.message}`);
    debugLog(absValidationDir, 'BLOCK', `FAILED — ${e.message}`);
    process.exit(1);
  }
}

main();
