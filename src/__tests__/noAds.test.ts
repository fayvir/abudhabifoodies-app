/**
 * The free app shows no ads (product decision, 2026-11-16). Guards against an ad
 * slot, an ad request or an ad label creeping back into app code. The website's
 * ads are unaffected; this only covers mobile/app and mobile/src.
 */
import fs from 'fs';
import path from 'path';

import * as client from '../api/client';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const ROOT = path.resolve(__dirname, '../..');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' || e.name === '__fixtures__' ? [] : sourceFiles(p);
    return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}

const files = [...sourceFiles(path.join(ROOT, 'app')), ...sourceFiles(path.join(ROOT, 'src'))];

describe('no ads in the app', () => {
  it('scans real source files', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('no source file requests the ads API or renders an ad label', () => {
    const offenders = files.filter((f) => {
      const src = fs.readFileSync(f, 'utf8');
      return (
        /\/api\/ads|['"`]Advertisement['"`]|>\s*Ad\s*</.test(src) ||
        /\b(getAd|trackAdEvent|useAd|TopBanner|PopupAd|AdSlot|AdPlacement|AdEventType)\b/.test(src)
      );
    });
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  it('there is no ads folder', () => {
    for (const dir of ['src/ads', 'app/ads', 'src/components/ads']) {
      expect(fs.existsSync(path.join(ROOT, dir))).toBe(false);
    }
  });

  it('the API client exposes no ad functions', () => {
    expect('getAd' in client).toBe(false);
    expect('trackAdEvent' in client).toBe(false);
  });
});
