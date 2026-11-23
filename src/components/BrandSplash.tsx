import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';

import { useSnapshot } from '../snapshot/useSnapshot';
import { useTheme } from '../theme/useTheme';
import { TypingDots } from './TypingDots';

const LOGO = require('../../assets/images/splash-icon.png') as number;

/** Never flash: shown at least this long. */
export const SPLASH_MIN_MS = 1200;
/** Never trap: a slow first download drops to Discover's own loading state after this. */
export const SPLASH_MAX_MS = 8000;
const FADE_MS = 300;
/** Same size and position as the native splash image (app.json), so the handoff doesn't jump. */
const LOGO_SIZE = 200;

/**
 * The app's splash: the logo (exactly where the native splash put it), the
 * brand name and a typing-dot loader, over the whole app (tab bar included)
 * until the guide's snapshot is ready, then a short fade. The native splash
 * is held until this has drawn its first frame, so there is no blank gap.
 */
export function BrandSplash() {
  const theme = useTheme();
  const { status } = useSnapshot();
  const [minDone, setMinDone] = useState(false);
  const [maxDone, setMaxDone] = useState(false);
  const [gone, setGone] = useState(false);
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const min = setTimeout(() => setMinDone(true), SPLASH_MIN_MS);
    const max = setTimeout(() => setMaxDone(true), SPLASH_MAX_MS);
    return () => {
      clearTimeout(min);
      clearTimeout(max);
    };
  }, []);

  const leaving = maxDone || (minDone && status !== 'loading');

  useEffect(() => {
    if (!leaving) return;
    const fade = Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true });
    fade.start(() => setGone(true));
    return () => fade.stop();
  }, [leaving, opacity]);

  if (gone) return null;

  return (
    <Animated.View
      testID="brand-splash"
      pointerEvents={leaving ? 'none' : 'auto'}
      accessibilityLabel="Abu Dhabi Foodies, loading"
      onLayout={() => {
        void SplashScreen.hideAsync().catch(() => undefined);
      }}
      style={[StyleSheet.absoluteFill, styles.root, { backgroundColor: theme.bg, opacity }]}
    >
      <Image source={LOGO} style={styles.logo} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
      <View style={styles.below}>
        <Text style={[styles.name, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
          Abu Dhabi Foodies
        </Text>
        <TypingDots color={theme.primary} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  logo: { width: LOGO_SIZE, height: LOGO_SIZE },
  below: { position: 'absolute', top: '50%', marginTop: LOGO_SIZE / 2 - 8, alignItems: 'center', gap: 16 },
  name: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
});
