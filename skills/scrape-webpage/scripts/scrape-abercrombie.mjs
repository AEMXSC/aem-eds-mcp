import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const url = 'https://www.abercrombie.com/shop/ca';
const outputDir = '/c/Users/remekie/Documents/Antigravity/import-work';

if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

process.stderr.write('Launching browser...\n');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 900 });

process.stderr.write('Navigating to ' + url + '...\n');
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  process.stderr.write('Page loaded\n');
} catch(e) {
  process.stderr.write('Nav error: ' + e.message + '\n');
}

const title = await page.title();
process.stderr.write('Title: ' + title + '\n');

// Take screenshot
const screenshotPath = path.join(outputDir, 'screenshot.png');
await page.screenshot({ path: screenshotPath, fullPage: false });
process.stderr.write('Screenshot saved to ' + screenshotPath + '\n');

// Analyse page structure
const analysis = await page.evaluate(() => {
  const result = {
    title: document.title,
    metaDesc: document.querySelector('meta[name="description"]')?.content || '',
    nav: [],
    sections: [],
    hasCarousel: false,
    hasVideo: false,
    hasGridLayout: false
  };

  // Nav items
  const navLinks = document.querySelectorAll('nav a, [role="navigation"] a');
  result.nav = Array.from(navLinks).slice(0, 30).map(a => a.textContent.trim()).filter(Boolean);

  // Major sections/blocks
  const majorEls = document.querySelectorAll('section, main > div, [class*="hero"], [class*="banner"], [class*="promo"], [class*="grid"], [class*="collection"]');
  result.sections = Array.from(majorEls).slice(0, 25).map(el => ({
    tag: el.tagName,
    classes: el.className.toString().substring(0, 100),
    text: el.textContent.trim().substring(0, 120),
    hasImg: el.querySelectorAll('img').length,
    hasVideo: el.querySelectorAll('video').length
  }));

  result.hasCarousel = !!document.querySelector('[class*="carousel"], [class*="slider"], [class*="swiper"]');
  result.hasVideo = !!document.querySelector('video');
  result.hasGridLayout = !!document.querySelector('[class*="grid"]');

  // Count images
  result.imageCount = document.querySelectorAll('img').length;

  // Get CTA buttons
  result.ctas = Array.from(document.querySelectorAll('a[class*="btn"], button, a[class*="cta"]'))
    .slice(0, 15)
    .map(el => el.textContent.trim())
    .filter(t => t.length > 0 && t.length < 60);

  return result;
});

// Save full HTML
const html = await page.content();
fs.writeFileSync(path.join(outputDir, 'page.html'), html);
process.stderr.write('HTML saved\n');

fs.writeFileSync(path.join(outputDir, 'analysis.json'), JSON.stringify(analysis, null, 2));
process.stderr.write('Analysis saved\n');

console.log(JSON.stringify(analysis, null, 2));

await browser.close();
