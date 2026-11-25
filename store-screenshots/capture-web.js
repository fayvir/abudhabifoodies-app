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
    await route.fulfill({ response: res, headers: { ...res.headers(), 'access-control-allow-origin': '*' } });
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto('http://localhost:8099/');
  const t = (s) => page.getByText(s, { exact: true }).first();
  await t('What are you in the mood for?').waitFor({ timeout: 60000 });
  await page.waitForTimeout(3000);
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
