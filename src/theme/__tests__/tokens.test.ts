import { dark, light, palettes } from '../tokens';

const HEX = /^#[0-9A-Fa-f]{6}$/;

describe('brand tokens', () => {
  it('uses tangerine as the light primary', () => {
    expect(light.primary).toBe('#FF6200');
  });

  it('has identical key sets in light and dark', () => {
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
  });

  it('keeps onAccent the same in both themes', () => {
    expect(light.onAccent).toBe(dark.onAccent);
  });

  it('only contains valid hex colours', () => {
    for (const palette of [light, dark]) {
      for (const [key, value] of Object.entries(palette)) {
        expect({ key, valid: HEX.test(value) }).toEqual({ key, valid: true });
      }
    }
  });

  it('exposes both palettes by scheme', () => {
    expect(palettes.light).toBe(light);
    expect(palettes.dark).toBe(dark);
  });

  // Expected values come from the website's light and dark themes.
  // The Palette keys map to CSS channels: bg=--c-bg-primary, text/ink=--c-ink,
  // textSecondary=--c-text-secondary, textMuted=--c-text-muted, etc.
  // NOTE: this table passes immediately against the scaffold; it exists to fail on drift.
  const EXPECTED_LIGHT = {
    bg: '#FFFFFF',
    bgSecondary: '#F5F6F8',
    bgElevated: '#FFFFFF',
    bgOverlay: '#ECEEF2',
    border: '#E3E6EB',
    borderStrong: '#15161A',
    ink: '#15161A',
    text: '#15161A',
    textSecondary: '#5B6070',
    textMuted: '#6B7180',
    primary: '#FF6200',
    primarySoft: '#FFE8D9',
    primaryDeep: '#C44A00',
    onAccent: '#15161A',
    lime: '#C8F04A',
    surfaceInvert: '#15161A',
    success: '#228B4A',
    warning: '#C47800',
    error: '#D0342C',
  };
  const EXPECTED_DARK = {
    bg: '#0E0F12',
    bgSecondary: '#16181D',
    bgElevated: '#1A1C22',
    bgOverlay: '#22252C',
    border: '#2A2E36',
    borderStrong: '#3A3F4A',
    ink: '#F4F5F7',
    text: '#F4F5F7',
    textSecondary: '#C6CAD3',
    textMuted: '#A0A6B2',
    primary: '#FF6200',
    primarySoft: '#3A1F0D',
    primaryDeep: '#FF7A26',
    onAccent: '#15161A',
    lime: '#C8F04A',
    surfaceInvert: '#08090B',
    success: '#5CC980',
    warning: '#F0B040',
    error: '#FF6B60',
  };

  it('matches the website light palette exactly (globals.css :root)', () => {
    expect(light).toEqual(EXPECTED_LIGHT);
  });

  it('matches the website dark palette exactly (globals.css [data-theme="dark"])', () => {
    expect(dark).toEqual(EXPECTED_DARK);
  });
});
