import { renderHook } from '@testing-library/react-native';
import { useColorScheme } from 'react-native';

import { dark, light } from '../tokens';
import { useTheme } from '../useTheme';

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const mockScheme = (value: unknown): void => {
  (useColorScheme as unknown as jest.Mock).mockReturnValue(value);
};

describe('useTheme', () => {
  it('returns the dark palette for the dark scheme', async () => {
    mockScheme('dark');
    expect((await renderHook(() => useTheme())).result.current).toBe(dark);
  });

  it('returns the light palette for the light scheme', async () => {
    mockScheme('light');
    expect((await renderHook(() => useTheme())).result.current).toBe(light);
  });

  it('returns light when the scheme is null', async () => {
    mockScheme(null);
    expect((await renderHook(() => useTheme())).result.current).toBe(light);
  });

  it('returns light for an unknown scheme value', async () => {
    mockScheme('unspecified');
    expect((await renderHook(() => useTheme())).result.current).toBe(light);
  });
});
