/**
 * Brand tokens, copied from the website ("Sticker Pop 2.0").
 * Source channels are RGB triples there; here they are hex.
 *
 * RULE: text and icons on tangerine (`primary`) or lime (`lime`) use `onAccent`
 * in BOTH themes. `ink`/`text` flip to near-white in dark mode and white on
 * tangerine fails contrast (~3:1), so never use them on an accent fill.
 */
export interface Palette {
  bg: string;
  bgSecondary: string;
  bgElevated: string;
  bgOverlay: string;
  border: string;
  borderStrong: string;
  ink: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  primarySoft: string;
  /** Orange used as TEXT on the page background. */
  primaryDeep: string;
  /** Text/icons on tangerine or lime. Dark in both themes. */
  onAccent: string;
  /** The one secondary accent: status badges only. */
  lime: string;
  /** Solid surface that stays dark in both themes. */
  surfaceInvert: string;
  success: string;
  warning: string;
  error: string;
}

export const light: Palette = {
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

export const dark: Palette = {
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

export const palettes = { light, dark } as const;
