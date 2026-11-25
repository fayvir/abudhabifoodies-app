# App Store screenshots

Three framed images (questions, result, saved) at 1320x2868 (6.9") and 1206x2622 (6.3").

Needs Playwright with Chromium (`npm i -g playwright && npx playwright install chromium` if not already installed); it is deliberately not an app dependency.
The phone bleeding off the bottom edge is intentional.

```bash
npx expo export --platform web --output-dir /tmp/abf-web
(cd /tmp/abf-web && python3 -m http.server 8099 &)
mkdir -p store-screenshots/work/raw
node store-screenshots/capture-web.js store-screenshots/work/raw
node store-screenshots/frame.js store-screenshots/work
```

Headlines live in `frame.js`; the look in `frame.html`. `work/` is git-ignored.
The native alternative for raw captures is the `iOS screenshots` workflow (Maestro), which
names its shots the same way; drop them into `work/raw/` and run `frame.js`.
