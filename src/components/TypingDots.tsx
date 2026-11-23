import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { useTheme } from '../theme/useTheme';

const DOT = 8;
const STEP_MS = 160;

/**
 * Three dots pulsing in turn, like the dots in the logo's speech bubble.
 * Used in the chat's typing bubble and on the splash screen.
 */
export function TypingDots({ color }: { color?: string }) {
  const theme = useTheme();
  const values = useRef([0, 1, 2].map(() => new Animated.Value(0.3))).current;

  useEffect(() => {
    const pulse = (v: Animated.Value) =>
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: STEP_MS * 2, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.3, duration: STEP_MS * 2, useNativeDriver: true }),
      ]);
    const loop = Animated.loop(Animated.stagger(STEP_MS, values.map(pulse)));
    loop.start();
    return () => loop.stop();
  }, [values]);

  return (
    <View style={styles.row} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {values.map((v, i) => (
        <Animated.View key={i} style={[styles.dot, { backgroundColor: color ?? theme.textMuted, opacity: v }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 5, alignItems: 'center', height: DOT * 2 },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2 },
});
