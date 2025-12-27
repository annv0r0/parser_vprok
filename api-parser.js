import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';

const DATA_DIR = path.resolve('data');

const [categoryUrl] = process.argv.slice(2);
if (!categoryUrl) throw new Error('Usage: node api-parser.js <categoryUrl>');

const abs = (base, u) => (u ? new URL(u, base).toString() : '');
const n = (v) => (v && v > 0 ? String(v) : '');

const format = (p, base) => {
  const price = n(p.price);
  const old = n(p.oldPrice);
  const promo = old ? price : '';
  const discount = n(p.discountPercent) || n(p.discount);

  return [
    `Название товара: ${p.name ?? ''}`,
    `Ссылка на страницу товара: ${abs(base, p.url)}`,
    `Рейтинг: ${p.rating ?? ''}`,
    `Количество отзывов: ${p.reviews ?? ''}`,
    `Цена: ${price}`,
    `Акционная цена: ${promo}`,
    `Цена до акции: ${old}`,
    `Размер скидки: ${discount}`,
  ].join('\n');
};

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });

  try {
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'ru-RU,ru;q=0.9' });

    await page.goto(categoryUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('#__NEXT_DATA__', { timeout: 60000 });

    // read raw JSON string from DOM
    const raw = await page.$eval('#__NEXT_DATA__', (el) => el.textContent || '');

    // is full JSON
    const txt = raw.trim();
    if (!txt.startsWith('{') || !txt.endsWith('}')) {
      throw new Error(`__NEXT_DATA__ looks incomplete (len=${txt.length})`);
    }

    let nextData;
    try {
      nextData = JSON.parse(txt);
    } catch (e) {
      fs.writeFileSync('next-data-broken.json', txt, 'utf8');
      throw new Error(`Broken __NEXT_DATA__ JSON. Saved as next-data-broken.json. ${e.message}`);
    }

    const products =
      nextData?.props?.pageProps?.initialStore?.catalogPage?.products ||
      nextData?.props?.pageProps?.catalogPage?.products;

    if (!Array.isArray(products)) throw new Error('Products not found at catalogPage.products');

    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(DATA_DIR, 'products-api.txt'),
      products.map((p) => format(p, categoryUrl)).join('\n\n') + '\n',
      'utf8',
    );

    console.log(`Saved products-api.txt (${products.length} products)`);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error('FAILED:', e);
  process.exitCode = 1;
});
