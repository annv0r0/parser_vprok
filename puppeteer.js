import fs from 'fs';
import puppeteer from 'puppeteer';

import path from 'path';

const DATA_DIR = path.resolve('data');

const [url, region] = process.argv.slice(2);
if (!url || !region) throw new Error('Usage: node puppeteer.js <url> "<region>"');

const norm = (s) =>
  (s || '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const num = (s) => {
  if (!s) return '';
  const m = String(s)
    .replace(/\u00A0/g, ' ')
    .replace(',', '.')
    .match(/\d+(?:\.\d+)?/);
  return m ? m[0] : '';
};

const digits = (s) => (s ? (String(s).match(/\d+/g) || []).join('') : '');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });

  try {
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'ru-RU,ru;q=0.9' });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    const REGION_BTN = 'button[class*="Region_region__"]';
    const REGION_TEXT = 'span[class*="Region_text__"]';
    const wantRegion = norm(region);

    await page.waitForSelector(REGION_BTN, { timeout: 30000 });

    // open region dropdown via DOM
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error('Region button not found');
      el.scrollIntoView({ block: 'center' });
      el.click();
    }, REGION_BTN);

    await page.waitForSelector('ul[role="list"] button', { timeout: 30000 });

    // pick region
    await page.evaluate((want) => {
      const btns = [...document.querySelectorAll('ul[role="list"] button')];
      const get = (el) =>
        (el.textContent || '')
          .replace(/\u00A0/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();

      const btn = btns.find((b) => get(b) === want) || btns.find((b) => get(b).includes(want));
      if (!btn) throw new Error(`Region not found: ${want}`);
      btn.scrollIntoView({ block: 'center' });
      btn.click();
    }, wantRegion);

    // wait until header shows region
    await page.waitForFunction(
      (want, sel) => {
        const t = (document.querySelector(sel)?.textContent || '')
          .replace(/\u00A0/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();
        return t.includes(want);
      },
      { timeout: 45000 },
      wantRegion,
      REGION_TEXT,
    );

    // extract values (stable structure)
    await page.waitForSelector('a[class*="ActionsRow_stars__"]', { timeout: 30000 });

    const raw = await page.evaluate(() => {
      const t = (sel) => document.querySelector(sel)?.textContent?.trim() || '';
      const a = (sel, attr) => document.querySelector(sel)?.getAttribute(attr) || '';

      const rating = a('a[class*="ActionsRow_stars__"]', 'title') || t('a[class*="ActionsRow_stars__"]');
      const reviews = t('a[class*="ActionsRow_reviews__"]');

      const price =
        t('span[class*="Price_price__"][class*="Price_role_discount__"]') ||
        t('span[class*="Price_price__"][class*="Price_role_regular__"]') ||
        t('span[class*="Price_price__"]');

      const old = t('span[class*="Price_role_old__"]') || t('del');

      return { price, old, rating, reviews };
    });

    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    fs.writeFileSync(
      path.join(DATA_DIR, 'product.txt'),
      `price=${num(raw.price)}\npriceOld=${num(raw.old)}\nrating=${num(raw.rating)}\nreviewCount=${digits(
        raw.reviews,
      )}\n`,
      'utf8',
    );

    await page.screenshot({
      path: path.join(DATA_DIR, 'screenshot.jpg'),
      fullPage: true,
    });

    console.log('Saved screenshot.jpg and product.txt');
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error('FAILED:', e);
  process.exitCode = 1;
});
