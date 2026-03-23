#!/usr/bin/env node

/*
 * mobile-dimensional-gate.js
 *
 * Mobile Dimensional Validation Gate — runs live DOM measurements (getBoundingClientRect,
 * getComputedStyle) on the rendered mobile nav to catch layout bugs that structural and
 * visual-similarity checks miss (e.g. .nav-list 199px vs viewport 375px).
 *
 * GENERIC: Auto-detects menu structure via semantic HTML (nav, ul, li, a) inside .header.
 * Selectors are overridable via config in runGate(viewportWidth, config).
 *
 * 7 check categories, 24 individual checks:
 *   1. Menu list width = viewport
 *   2. Each menu item width = viewport
 *   3. Edge-to-edge alignment (left=0, right=viewport)
 *   4. Chevron alignment (gap < 40px from right edge)
 *   5. Container chain widths (nav-inner → … → nav-list)
 *   6. Computed styles (font-size, font-weight)
 *   7. Secondary nav list width = viewport
 *
 * USAGE:
 *   Standalone (Node + Playwright):
 *     node scripts/mobile-dimensional-gate.js --url=<migrated-url> [--validation-dir=<path>] [--viewport=375x812]
 *   During migration (browser_evaluate): paste runGate(375) or runGate(375, { ... }) body;
 *   runGate is exported for MCP/browser — inject detectMenuList, buildContainerChain, elementLabel first.
 *
 * Exit: 0 = all checks passed; 1 = one or more failed; 2 = usage/runner error.
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
  const entry = `[${ts}] ${prefix} [SCRIPT:mobile-dimensional-gate] [${level}] ${msg}\n`;
  try {
    if (validationDir && fs.existsSync(validationDir)) {
      fs.appendFileSync(path.join(validationDir, 'debug.log'), entry);
    }
  } catch (_) { /* ignore */ }
}

/**
 * Auto-detects the primary nav list inside .header (nav > ul with most visible li children).
 */
function detectMenuList(headerEl) {
  const navs = headerEl.querySelectorAll('nav');

  function countVisibleItems(ul) {
    return Array.from(ul.children).filter((li) => {
      if (li.tagName !== 'LI') return false;
      const style = window.getComputedStyle(li);
      return style.display !== 'none' && li.getBoundingClientRect().height > 0;
    }).length;
  }

  let bestList = null;
  let bestCount = 0;
  navs.forEach((nav) => {
    nav.querySelectorAll(':scope > ul').forEach((ul) => {
      const count = countVisibleItems(ul);
      if (count > bestCount) {
        bestCount = count;
        bestList = ul;
      }
    });
  });
  if (bestList) return bestList;

  navs.forEach((nav) => {
    nav.querySelectorAll('ul').forEach((ul) => {
      const count = countVisibleItems(ul);
      if (count > bestCount) {
        bestCount = count;
        bestList = ul;
      }
    });
  });

  return bestList;
}

/**
 * Walks up from element to stopAt, collecting intermediate containers (for width chain).
 */
function buildContainerChain(element, stopAt) {
  const chain = [];
  let current = element;
  while (current && current !== stopAt && current !== document.body) {
    chain.push(current);
    current = current.parentElement;
  }
  if (stopAt && current === stopAt) chain.push(stopAt);
  return chain;
}

/**
 * Readable label for an element (tag.class or tag#id).
 */
function elementLabel(el) {
  const tag = el.tagName.toLowerCase();
  if (el.id) return `${tag}#${el.id}`;
  const cls = Array.from(el.classList).join('.');
  return cls ? `${tag}.${cls}` : tag;
}

/**
 * Core gate — runs inside browser (page.evaluate). Returns { gate, viewport, checks, passed, summary, detectedSelectors }.
 *
 * @param {number} viewportWidth — e.g. 375
 * @param {object} [config] — optional: header, menuList, menuItems, linkInItem, chevron, secondaryList, hamburger, minFontSize, minFontWeight
 */
export function runGate(viewportWidth = 375, config = {}) {
  const TOLERANCE = 2;
  const WIDTH_RATIO_THRESHOLD = 0.95;
  const report = {
    gate: 'mobile-dimensional-gate',
    viewport: viewportWidth,
    timestamp: new Date().toISOString(),
    checks: [],
    passed: true,
    summary: '',
    detectedSelectors: {},
  };

  function addCheck(id, label, expected, actual, pass, note = '') {
    report.checks.push({ id, label, expected, actual, pass, note });
    if (!pass) report.passed = false;
  }

  const headerSelector = config.header || '.header';
  const headerEl = document.querySelector(headerSelector);
  if (!headerEl) {
    addCheck('header-exists', `Header block (${headerSelector}) exists`, true, false, false, 'Header element not found');
    report.summary = 'FAIL — header not found';
    return report;
  }

  let menuList;
  if (config.menuList) {
    menuList = headerEl.querySelector(config.menuList);
    report.detectedSelectors.menuList = config.menuList;
  } else {
    menuList = detectMenuList(headerEl);
    report.detectedSelectors.menuList = menuList ? `auto-detected: ${elementLabel(menuList)}` : 'not found';
  }

  if (!menuList) {
    addCheck(
      'menu-list-exists',
      'Primary nav list exists',
      true,
      false,
      false,
      'Could not find a <ul> with <li> menu items inside <nav>. Pass config.menuList to specify manually.',
    );
    report.summary = 'FAIL — menu list not found';
    return report;
  }

  const menuListWidth = Math.round(menuList.getBoundingClientRect().width);
  addCheck(
    'menu-list-width',
    `Menu list (${elementLabel(menuList)}) width equals viewport`,
    `${viewportWidth}px (±${TOLERANCE}px)`,
    `${menuListWidth}px`,
    Math.abs(menuListWidth - viewportWidth) <= TOLERANCE,
    menuListWidth < viewportWidth * WIDTH_RATIO_THRESHOLD
      ? `CRITICAL: list is only ${Math.round((menuListWidth / viewportWidth) * 100)}% of viewport — items will appear half-width`
      : '',
  );

  const itemSelector = config.menuItems || ':scope > li';
  const allItems = menuList.querySelectorAll(itemSelector);
  const visibleItems = Array.from(allItems).filter((item) => {
    const style = window.getComputedStyle(item);
    return style.display !== 'none' && item.getBoundingClientRect().height > 0;
  });

  const linkSelector = config.linkInItem || ':scope > a';
  visibleItems.forEach((item, i) => {
    const itemWidth = Math.round(item.getBoundingClientRect().width);
    const link = item.querySelector(linkSelector) || item.querySelector('a');
    const label = link ? link.textContent.trim().split('\n')[0] : `item-${i}`;

    addCheck(
      `menu-item-width-${i}`,
      `Menu item "${label}" width equals viewport`,
      `${viewportWidth}px (±${TOLERANCE}px)`,
      `${itemWidth}px`,
      Math.abs(itemWidth - viewportWidth) <= TOLERANCE,
      itemWidth < viewportWidth * WIDTH_RATIO_THRESHOLD
        ? `Item is only ${Math.round((itemWidth / viewportWidth) * 100)}% of viewport width`
        : '',
    );
  });

  if (visibleItems.length > 0) {
    const firstRect = visibleItems[0].getBoundingClientRect();

    addCheck(
      'items-left-edge',
      'First menu item starts at left edge (x=0)',
      `0px (±${TOLERANCE}px)`,
      `${Math.round(firstRect.left)}px`,
      Math.abs(firstRect.left) <= TOLERANCE,
    );

    addCheck(
      'items-right-edge',
      'Menu items extend to right edge',
      `${viewportWidth}px (±${TOLERANCE}px)`,
      `${Math.round(firstRect.right)}px`,
      Math.abs(firstRect.right - viewportWidth) <= TOLERANCE,
    );
  }

  visibleItems.forEach((item, i) => {
    let chevron = null;

    if (config.chevron) {
      chevron = item.querySelector(config.chevron);
    } else {
      const candidates = Array.from(item.querySelectorAll(':scope > span, :scope > svg, :scope > i, :scope > a > span'));
      const itemRect = item.getBoundingClientRect();
      candidates.forEach((c) => {
        const cRect = c.getBoundingClientRect();
        const cStyle = window.getComputedStyle(c);
        if (cStyle.display !== 'none' && cRect.width <= 20 && cRect.width > 0
          && cRect.left > itemRect.left + itemRect.width * 0.5) {
          chevron = c;
        }
      });
    }

    if (chevron) {
      const chevronRect = chevron.getBoundingClientRect();
      const rightGap = viewportWidth - chevronRect.right;
      const link = item.querySelector(linkSelector) || item.querySelector('a');
      const label = link ? link.textContent.trim().split('\n')[0] : `item-${i}`;

      addCheck(
        `chevron-alignment-${i}`,
        `Chevron for "${label}" near right edge`,
        'gap < 40px from right edge',
        `${Math.round(rightGap)}px from right edge`,
        rightGap < 40 && rightGap >= 0,
        rightGap >= 40 ? 'Chevron too far from right edge — likely width/layout issue' : '',
      );
    }
  });

  const chain = buildContainerChain(menuList, headerEl);
  chain.forEach((el) => {
    const w = Math.round(el.getBoundingClientRect().width);
    const label = elementLabel(el);
    addCheck(
      `container-width-${label.replace(/[.#]/g, '_')}`,
      `Container ${label} width equals viewport`,
      `${viewportWidth}px (±${TOLERANCE}px)`,
      `${w}px`,
      Math.abs(w - viewportWidth) <= TOLERANCE,
      w < viewportWidth * WIDTH_RATIO_THRESHOLD
        ? `Container is only ${Math.round((w / viewportWidth) * 100)}% of viewport — breaks child widths`
        : '',
    );
  });

  if (visibleItems.length > 0) {
    const firstLink = visibleItems[0].querySelector(linkSelector) || visibleItems[0].querySelector('a');
    if (firstLink) {
      const computed = window.getComputedStyle(firstLink);
      const minFont = config.minFontSize ?? 16;
      const minWeight = config.minFontWeight ?? 600;

      addCheck(
        'link-font-size',
        `Nav link font-size >= ${minFont}px`,
        `>= ${minFont}px`,
        computed.fontSize,
        parseFloat(computed.fontSize) >= minFont,
        parseFloat(computed.fontSize) < minFont ? 'Font size smaller than expected for mobile nav' : '',
      );

      addCheck(
        'link-font-weight',
        `Nav link font-weight >= ${minWeight}`,
        `>= ${minWeight}`,
        computed.fontWeight,
        parseInt(computed.fontWeight, 10) >= minWeight,
        parseInt(computed.fontWeight, 10) < minWeight ? 'Font weight lighter than expected' : '',
      );
    }
  }

  let secondaryList = null;
  if (config.secondaryList) {
    secondaryList = headerEl.querySelector(config.secondaryList);
  } else {
    const allNavUls = headerEl.querySelectorAll('nav ul');
    Array.from(allNavUls).forEach((ul) => {
      if (ul !== menuList && !menuList.contains(ul) && !ul.contains(menuList)) {
        const items = Array.from(ul.children).filter((li) => li.tagName === 'LI'
          && window.getComputedStyle(li).display !== 'none'
          && li.getBoundingClientRect().height > 0);
        if (items.length > 0) secondaryList = ul;
      }
    });
  }

  if (secondaryList) {
    const secWidth = Math.round(secondaryList.getBoundingClientRect().width);
    addCheck(
      'secondary-nav-width',
      `Secondary nav (${elementLabel(secondaryList)}) width equals viewport`,
      `${viewportWidth}px (±${TOLERANCE}px)`,
      `${secWidth}px`,
      Math.abs(secWidth - viewportWidth) <= TOLERANCE,
    );
  }

  const failCount = report.checks.filter((c) => !c.pass).length;
  const totalCount = report.checks.length;
  report.summary = report.passed
    ? `PASS — all ${totalCount} dimensional checks passed`
    : `FAIL — ${failCount}/${totalCount} checks failed`;

  return report;
}

/**
 * Builds a single browser script that defines helpers and runs runGate (for page.evaluate).
 */
function buildBrowserScript(viewportWidth) {
  return `
    ${detectMenuList.toString()}
    ${buildContainerChain.toString()}
    ${elementLabel.toString()}
    return (${runGate.toString()})(${viewportWidth});
  `;
}

async function main() {
  const args = process.argv.slice(2);
  let url = null;
  let validationDir = null;
  let viewport = '375x812';
  for (const a of args) {
    if (a.startsWith('--url=')) url = a.slice(6);
    else if (a.startsWith('--validation-dir=')) validationDir = a.slice(17);
    else if (a.startsWith('--viewport=')) viewport = a.slice(11);
  }

  if (!url) {
    console.error('Usage: node scripts/mobile-dimensional-gate.js --url=<migrated-url> [--validation-dir=<path>] [--viewport=375x812]');
    console.error('Example: node scripts/mobile-dimensional-gate.js --url=http://localhost:3000/content/index --validation-dir=blocks/header/navigation-validation');
    process.exit(2);
  }

  const [vw, vh] = viewport.split('x').map(Number) || [375, 812];
  const absValidationDir = validationDir ? path.resolve(validationDir) : null;
  if (absValidationDir) {
    debugLog(absValidationDir, 'START', `mobile-dimensional-gate.js — url=${url}, viewport=${viewport}`);
  }

  let chromium;
  try {
    const pw = await import('playwright');
    chromium = pw.chromium;
  } catch (e) {
    console.error('Playwright not found. Install from scripts folder: npm install playwright');
    if (absValidationDir) debugLog(absValidationDir, 'ERROR', `Playwright import failed: ${e.message}`);
    process.exit(2);
  }

  const execPath = findLocalChromiumExecutable();
  const launchOpts = { headless: true };
  if (execPath) launchOpts.executablePath = execPath;

  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage();

  try {
    await page.setViewportSize({ width: vw, height: vh });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const hamburger = await page.$('.header button[aria-label*="nav" i], .header button[aria-label*="menu" i], .header button[aria-expanded]');
    if (hamburger) {
      await hamburger.click();
      await page.waitForTimeout(500);
    } else {
      console.error('ERROR: Could not find hamburger button in header. Open the mobile menu manually or use a custom selector.');
      await browser.close();
      if (absValidationDir) debugLog(absValidationDir, 'ERROR', 'Hamburger not found');
      process.exit(2);
    }

    const browserScript = buildBrowserScript(vw);
    const report = await page.evaluate(browserScript);

    if (absValidationDir) {
      const mobileDir = path.join(absValidationDir, 'mobile');
      if (!fs.existsSync(mobileDir)) fs.mkdirSync(mobileDir, { recursive: true });
      const reportPath = path.join(mobileDir, 'mobile-dimensional-gate-report.json');
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
      debugLog(absValidationDir, report.passed ? 'PASS' : 'BLOCK', report.summary);
    }

    console.log(JSON.stringify(report, null, 2));
    console.log(`\n${'='.repeat(60)}`);
    console.log(`GATE RESULT: ${report.summary}`);
    console.log(`${'='.repeat(60)}`);

    if (!report.passed) {
      console.log('\nFailed checks:');
      report.checks
        .filter((c) => !c.pass)
        .forEach((c) => {
          console.log(`  ✗ ${c.label}`);
          console.log(`    Expected: ${c.expected}`);
          console.log(`    Actual:   ${c.actual}`);
          if (c.note) console.log(`    Note:     ${c.note}`);
        });
    }

    await browser.close();
    process.exit(report.passed ? 0 : 1);
  } catch (err) {
    console.error('Gate runner error:', err.message);
    if (absValidationDir) debugLog(absValidationDir, 'ERROR', err.message);
    await browser.close();
    process.exit(2);
  }
}

const isMain = typeof process !== 'undefined'
  && process.argv[1]
  && process.argv[1].includes('mobile-dimensional-gate');
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(2);
  });
}
