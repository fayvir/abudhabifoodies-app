// Frames raw captures into App Store images: node store-screenshots/frame.js <dir>
// reads <dir>/raw/raw-{questions,result,saved}.png, writes <dir>/app-store/{6.9in,6.3in}/*.png.
// Run from the repo root (uses the preinstalled Playwright + Chromium).
const { chromium } = require('playwright');
const path = require('path');
const base = path.resolve(process.argv[2] || 'store-screenshots/work');
require('fs').mkdirSync(path.join(base, 'app-store', '6.9in'), { recursive: true });
require('fs').mkdirSync(path.join(base, 'app-store', '6.3in'), { recursive: true });
const shots = [
  { n: '01-questions', bg: 't', img: 'raw-questions.png', h: 'Answer a few <em>questions</em>', p: 'Your craving, your budget, your vibe.' },
  { n: '02-result', bg: 'k', img: 'raw-result.png', h: 'Get the <em>best pick</em>', p: 'Hand-picked by you, the Abu Dhabi Foodies community. No more endless scrolling.' },
  { n: '03-saved', bg: 't', img: 'raw-saved.png', h: 'Save it.<br><em>Eat well.</em>', p: 'Keep a list of spots to try and places you’ve been.' },
];
const sizes = [{ dir: '6.9in', w: 440, h: 956 }, { dir: '6.3in', w: 402, h: 874 }];
(async () => {
  const browser = await chromium.launch();
  for (const s of sizes) {
    const page = await browser.newPage({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 3 });
    for (const shot of shots) {
      const u = new URL('file://' + path.join(__dirname, 'frame.html'));
      for (const k of ['bg', 'h', 'p']) u.searchParams.set(k, shot[k]);
      u.searchParams.set('img', 'file://' + path.join(base, 'raw', shot.img));
      await page.goto(u.href);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => document.getElementById('img').complete);
      if (!(await page.evaluate(() => document.getElementById('img').naturalWidth > 0))) throw new Error(`missing raw capture: ${shot.img}`);
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(base, 'app-store', s.dir, shot.n + '.png') });
    }
    await page.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
