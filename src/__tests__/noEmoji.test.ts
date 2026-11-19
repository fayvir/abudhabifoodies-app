/**
 * Product decision (2026-11-18): no emoji anywhere in the app. Icons come from
 * @expo/vector-icons. This guard fails if an emoji or a pictographic symbol
 * (hearts, stars, ticks, arrows used as icons) appears in app or src code.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const FORBIDDEN = /\p{Extended_Pictographic}|[←-⇿✀-➿■-◿›️]/u;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : files(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('no emoji in the app', () => {
  const sources = [...files(join(ROOT, 'app')), ...files(join(ROOT, 'src'))];

  it('scans the app and src source files', () => {
    expect(sources.length).toBeGreaterThan(10);
  });

  it.each(sources.map((f) => [f.slice(ROOT.length + 1), f]))('%s has no emoji or pictographic symbols', (_rel, file) => {
    const offending = readFileSync(file, 'utf8')
      .split('\n')
      .map((line, i) => ({ line: i + 1, text: line }))
      .filter(({ text }) => FORBIDDEN.test(text));
    expect(offending).toEqual([]);
  });
});
