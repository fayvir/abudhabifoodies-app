import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..', '..');
const readJson = (file: string) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const expo = readJson('app.json').expo;
const exists = (rel: string) => fs.existsSync(path.join(root, rel));

/** IHDR of a PNG: width, height, colour type (4 = grey+alpha, 6 = RGBA). */
function ihdr(rel: string) {
  const b = fs.readFileSync(path.join(root, rel));
  expect(b.subarray(1, 4).toString('ascii')).toBe('PNG');
  expect(b.subarray(12, 16).toString('ascii')).toBe('IHDR');
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), colorType: b[25] };
}

describe('app.json identity', () => {
  it('keeps name, slug, scheme and bundle ids', () => {
    expect(expo.name).toBe('Abu Dhabi Foodies');
    expect(expo.slug).toBe('abudhabifoodies');
    expect(expo.scheme).toBe('abudhabifoodies');
    expect(expo.ios.bundleIdentifier).toBe('ae.abudhabifoodies.app');
    expect(expo.android.package).toBe('ae.abudhabifoodies.app');
  });

  it('has version fields, portrait phone-only, no encryption export questionnaire', () => {
    expect(expo.version).toBe('1.0.1');
    expect(expo.ios.buildNumber).toBe('1');
    expect(expo.android.versionCode).toBe(1);
    expect(expo.ios.supportsTablet).toBe(false);
    expect(expo.orientation).toBe('portrait');
    expect(expo.ios.infoPlist.ITSAppUsesNonExemptEncryption).toBe(false);
  });

  it('points at icon, adaptive icon and splash files that exist', () => {
    const splash = (expo.plugins as unknown[]).find(
      (p): p is [string, { image: string; backgroundColor: string }] => Array.isArray(p) && p[0] === 'expo-splash-screen',
    );
    expect(splash).toBeDefined();
    const refs = [
      expo.icon,
      expo.android.adaptiveIcon.foregroundImage,
      splash?.[1].image,
      expo.web.favicon,
    ] as string[];
    for (const ref of refs) expect(exists(ref)).toBe(true);
    expect(expo.android.adaptiveIcon.backgroundColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(splash?.[1].backgroundColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('does not keep template images that nothing references', () => {
    expect(exists('assets/images/android-icon-background.png')).toBe(false);
    expect(exists('assets/images/android-icon-monochrome.png')).toBe(false);
  });
});

describe('icon files', () => {
  it('icon.png is 1024x1024 with no alpha channel', () => {
    const { width, height, colorType } = ihdr('assets/images/icon.png');
    expect([width, height]).toEqual([1024, 1024]);
    expect([4, 6]).not.toContain(colorType);
  });

  it('the adaptive foreground is 1024x1024', () => {
    const { width, height } = ihdr('assets/images/android-icon-foreground.png');
    expect([width, height]).toEqual([1024, 1024]);
  });
});

describe('eas.json', () => {
  const eas = readJson('eas.json');
  it('has development, preview (internal) and production (autoIncrement) builds', () => {
    expect(eas.build.development.developmentClient).toBe(true);
    expect(eas.build.preview.distribution).toBe('internal');
    expect(eas.build.production.autoIncrement).toBe(true);
  });
  it('has an empty production submit profile and no account or project ids', () => {
    expect(eas.submit.production).toEqual({});
    expect(JSON.stringify(eas)).not.toMatch(/projectId|ascAppId|appleId|serviceAccount/);
  });
});
