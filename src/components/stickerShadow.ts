import { Platform, type ViewStyle } from 'react-native';

import type { Palette } from '../theme/tokens';

/**
 * Hard-offset "sticker" shadow: zero blur, ink in light, tangerine in dark.
 * iOS only; Android keeps the plain 2px border (elevation is blurred).
 */
export function stickerShadow(theme: Palette, dark: boolean, offset = 4): ViewStyle {
  if (Platform.OS !== 'ios') return {};
  return {
    shadowColor: dark ? theme.primary : theme.borderStrong,
    shadowOffset: { width: offset, height: offset },
    shadowOpacity: 1,
    shadowRadius: 0,
  };
}
