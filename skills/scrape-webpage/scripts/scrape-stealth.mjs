import { chromium } from 'playwright';
import fs from 'fs';

const url = 'https://www.abercrombie.com/shop/ca';
const outputDir = '/c/Users/remekie/Documents/Antigravity/import-work';

const browser = await chromium.launch({
  headless: true,
  args: [
    '--disable-blink-features=AutomationControlled',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-infobars',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
  ]
});

const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  viewport: { width: 1440, height: 900 },
  locale: 'en-CA',
  timezoneId: 'America/Toronto',
  extraHTTPHeaders: {
    'Accept-Language': 'en-CA,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'sec-ch-ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
  }
});

// Remove automation signals
await context.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  Object.defineProperty(navigator, 'languages', { get: () => ['en-CA', 'en'] });
  window.chrome = { runtime: {} };
});

const page = await context.newPage();

process.stderr.write('Navigating with stealth...\n');
try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
} catch(e) {
  process.stderr.write('Networkidle timeout, trying domcontentloaded...\n');
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(10000);
  } catch(e2) {
    process.stderr.write('Error: ' + e2.message + '\n');
  }
}

const title = await page.title();
process.stderr.write('Title: ' + title + '\n');

// Wait for main content
try {
  await page.waitForSelector('nav, header, main, [class*="hero"]', { timeout: 15000 });
  process.stderr.write('Main content found\n');
} catch(e) {
  process.stderr.write('No main content found: ' + e.message + '\n');
}

// Check if we're blocked
const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 500));
process.stderr.write('Body preview: ' + bodyText + '\n');

// Screenshot
await page.screenshot({ path: outputDir + '/screenshot-stealth.png', fullPage: false });

const html = await page.content();
fs.writeFileSync(outputDir + '/page-stealth.html', html);
process.stderr.write('Files saved\n');

await browser.close();
