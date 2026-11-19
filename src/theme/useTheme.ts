import { useColorScheme } from 'react-native';

import { palettes, type Palette } from './tokens';

/** Palette for the device colour scheme (light when unknown). */
export function useTheme(): Palette {
  return useColorScheme() === 'dark' ? palettes.dark : palettes.light;
}
