// Raw captures from the web build (expo export --platform web, served on :8099) with the live API.
// CORS is bypassed by proxying API calls in Playwright; analytics POSTs are swallowed so no fake searches are logged.
// node store-screenshots/capture-web.js <dir>/raw
const { chromium } = require('playwright');
const out = process.argv[2];
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: 'light' });
  await ctx.route(/abudhabifoodies\.ae/, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    // analytics posts: swallow, don't log fake searches
    if (route.request().method() === 'POST') return route.fulfill({ status: 200, body: '{}', headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' } });
    const res = await route.fetch();
    let body = await res.body();
    // Until the site sends `hours` on snapshot cards, fill them in from the public API (same data).
    if (route.request().url().includes('/api/discovery/snapshot')) {
      const snap = JSON.parse(body.toString());
      const cards = Object.values(snap.cards);
      if (!cards.some((c) => c.hours)) {
        const ids = [...new Set(cards.map((c) => c.restaurant_id).filter(Boolean))];
        const hours = new Map();
        for (let i = 0; i < ids.length; i += 100) {
          const r = await ctx.request.get(`https://www.abudhabifoodies.ae/api/restaurants?ids=${ids.slice(i, i + 100).join(',')}&limit=500`);
          for (const x of (await r.json()).restaurants ?? []) hours.set(x.id, x.hours);
        }
        for (const c of cards) c.hours = hours.get(c.restaurant_id) ?? null;
        body = Buffer.from(JSON.stringify(snap));
      }
    }
    const headers = { ...res.headers(), 'content-length': String(body.length), 'access-control-allow-origin': '*' };
    delete headers['content-encoding']; // body() is already decoded
    await route.fulfill({ status: res.status(), body, headers });
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto('http://localhost:8099/');
  const t = (s) => page.getByText(s, { exact: true }).first();
  await t('What are you in the mood for?').waitFor({ timeout: 60000 });
  await page.waitForTimeout(3000);
  // Dinner time in Abu Dhabi, so cards read "Open · closes …" as when people browse.
  // Set only after the splash: a frozen clock from the start freezes its fade-out.
  await page.clock.setFixedTime(new Date('2026-11-26T19:30:00+04:00'));
  await t('Italian').click();
  await t("What's your budget per person?").waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  await t('Mid').click();
  await t('Date Night').waitFor({ timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/raw-questions.png` });
  await t('Date Night').click();
  await t("Here's what we'd recommend:").waitFor({ timeout: 30000 });
  await page.getByTestId('result-photo-0').first().waitFor({ timeout: 15000 }).catch(() => console.log('no photo'));
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${out}/raw-result.png` });
  await page.getByLabel('Save to favourites').first().click();
  await t('Start a new search').click();
  await t('Japanese').waitFor({ timeout: 30000 }); await page.waitForTimeout(1500);
  await t('Japanese').click();
  await t("What's your budget per person?").waitFor(); await page.waitForTimeout(1500);
  await t('Mid').click();
  await t('Hidden Gem').waitFor(); await page.waitForTimeout(1500);
  await t('Hidden Gem').click();
  await t("Here's what we'd recommend:").waitFor({ timeout: 30000 }); await page.waitForTimeout(1500);
  await page.getByLabel('Save to favourites').first().click();
  await page.getByTestId('tab-saved').click();
  await t('Want To Try').waitFor();
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${out}/raw-saved.png` });
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
