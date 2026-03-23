import { chromium } from 'playwright';
import fs from 'fs';

const url = 'https://www.abercrombie.com/shop/ca';
const outputDir = '/c/Users/remekie/Documents/Antigravity/import-work';

const browser = await chromium.launch({ headless: true, args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'] });
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  viewport: { width: 1440, height: 900 },
  locale: 'en-CA',
  extraHTTPHeaders: {
    'Accept-Language': 'en-CA,en;q=0.9',
    'sec-ch-ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
  }
});
await context.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  window.chrome = { runtime: {} };
});

const page = await context.newPage();
process.stderr.write('Loading page...\n');
try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
} catch(e) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(8000);
}

// Scroll to trigger lazy load
process.stderr.write('Scrolling...\n');
await page.evaluate(async () => {
  await new Promise(resolve => {
    let totalHeight = 0;
    const distance = 300;
    const timer = setInterval(() => {
      window.scrollBy(0, distance);
      totalHeight += distance;
      if (totalHeight >= document.body.scrollHeight) { clearInterval(timer); resolve(); }
    }, 150);
  });
});
await page.waitForTimeout(3000);
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(1000);

// Full-page screenshot
process.stderr.write('Taking screenshot...\n');
await page.screenshot({ path: outputDir + '/screenshot-full.png', fullPage: true });

// Detailed analysis
process.stderr.write('Extracting DOM structure...\n');
const analysis = await page.evaluate(() => {
  const data = {
    title: document.title,
    metaDesc: document.querySelector('meta[name="description"]')?.content || '',
    ogImage: document.querySelector('meta[property="og:image"]')?.content || '',
    canonical: document.querySelector('link[rel="canonical"]')?.href || '',
    
    // Navigation
    nav: {
      topBanner: document.querySelector('[class*="promo"], [class*="announcement"], [class*="top-banner"]')?.innerText?.trim().substring(0,200) || '',
      mainNavItems: Array.from(document.querySelectorAll('nav a, [role="navigation"] a'))
        .map(a => a.innerText.trim())
        .filter(t => t && t.length < 40)
        .slice(0, 30),
    },
    
    // Hero / above fold
    hero: {
      html: document.querySelector('[class*="hero"], [class*="homepage-hero"], [class*="homepage-banner"]')?.innerHTML?.substring(0, 2000) || '',
      hasVideo: !!document.querySelector('[class*="hero"] video'),
      hasSlider: !!document.querySelector('[class*="hero"] [class*="slider"], [class*="hero"] [class*="carousel"]'),
      ctaTexts: Array.from(document.querySelectorAll('[class*="hero"] a, [class*="banner"] a'))
        .map(a => a.innerText.trim())
        .filter(Boolean)
        .slice(0, 10),
    },
    
    // Page sections - map every major content block
    sections: Array.from(document.querySelectorAll('main > *, #root > * > *, [class*="page"] > *, [class*="homepage"] > *'))
      .filter(el => el.offsetHeight > 50)
      .slice(0, 30)
      .map((el, i) => ({
        index: i,
        tag: el.tagName,
        classes: el.className.toString().substring(0, 150),
        approxHeight: el.offsetHeight,
        innerTextPreview: el.innerText?.trim().substring(0, 200) || '',
        imgCount: el.querySelectorAll('img').length,
        linkCount: el.querySelectorAll('a').length,
        hasVideo: !!el.querySelector('video'),
        hasForm: !!el.querySelector('form'),
        childSections: Array.from(el.children).slice(0, 5).map(c => ({
          tag: c.tagName,
          classes: c.className.toString().substring(0, 80),
          text: c.innerText?.trim().substring(0, 80) || ''
        }))
      })),
    
    // Product grids
    productGrids: Array.from(document.querySelectorAll('[class*="product-grid"], [class*="product-list"], [class*="grid"]'))
      .slice(0, 5)
      .map(g => ({
        classes: g.className.toString().substring(0, 100),
        itemCount: g.querySelectorAll('[class*="product-card"], [class*="tile"], li, article').length,
        firstItemText: g.querySelector('[class*="product-card"], [class*="tile"], li')?.innerText?.trim().substring(0, 100) || ''
      })),
    
    // All CTAs
    allCTAs: Array.from(document.querySelectorAll('a[class*="btn"], a[class*="button"], button[class*="btn"]'))
      .map(el => ({ text: el.innerText.trim(), href: el.href || '' }))
      .filter(c => c.text)
      .slice(0, 30),
    
    // Footer
    footer: {
      text: document.querySelector('footer')?.innerText?.trim().substring(0, 500) || '',
      linkCount: document.querySelector('footer')?.querySelectorAll('a').length || 0
    },
    
    // Images
    images: Array.from(document.querySelectorAll('img[src]'))
      .map(img => ({ src: img.src, alt: img.alt, width: img.naturalWidth, height: img.naturalHeight }))
      .filter(img => img.src && !img.src.startsWith('data:'))
      .slice(0, 20)
  };
  return data;
});

fs.writeFileSync(outputDir + '/analysis-full.json', JSON.stringify(analysis, null, 2));
process.stderr.write('Analysis saved to analysis-full.json\n');

// Save cleaned HTML
const html = await page.content();
fs.writeFileSync(outputDir + '/page-full.html', html);
process.stderr.write('HTML saved (' + html.length + ' bytes)\n');

console.log(JSON.stringify(analysis, null, 2));
await browser.close();
