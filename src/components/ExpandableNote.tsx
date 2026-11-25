import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native';

import { useTheme } from '../theme/useTheme';

const LINES = 2;
/** Without a text measurement (some web builds), longer than this is assumed to pass two lines. */
const FALLBACK_CHARS = 90;

/** A quoted note clamped to two lines, with More / Less only when it is actually longer. */
export function ExpandableNote({ text, style }: { text: string; style?: TextStyle }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<number | null>(null);
  const long = lines !== null ? lines > LINES : text.length > FALLBACK_CHARS;
  const quoted = `“${text}”`;
  return (
    <View>
      {/* Measures the full note off-screen, so the toggle shows only when it is needed. */}
      <Text
        testID="note-measure"
        style={[style, styles.measure]}
        onTextLayout={(e) => setLines(e.nativeEvent.lines.length)}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {quoted}
      </Text>
      <Text testID="note" numberOfLines={open ? undefined : LINES} style={style}>
        {quoted}
      </Text>
      {long ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={open ? 'Less' : 'More'}
          accessibilityHint={open ? 'Shows less of the note' : 'Shows the whole note'}
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen((o) => !o)}
          hitSlop={8}
          style={styles.toggle}
        >
          <Text style={[styles.toggleText, { color: theme.primaryDeep }]}>{open ? 'Less' : 'More'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  measure: { position: 'absolute', opacity: 0, left: 0, right: 0 },
  toggle: { alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' },
  toggleText: { fontSize: 14, fontWeight: '700' },
});
