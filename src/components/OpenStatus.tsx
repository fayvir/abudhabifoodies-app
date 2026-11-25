import { StyleSheet, Text, View } from 'react-native';

import { openStatus, type Hours } from '../lib/hours';
import { useTheme } from '../theme/useTheme';

/** "Open · closes 11 PM" (green dot) / "Closed · opens 6 PM" (grey dot); nothing without readable hours. */
export function OpenStatus({ hours, now }: { hours: Hours; now?: Date }) {
  const theme = useTheme();
  const status = openStatus(hours, now);
  if (!status) return null;
  const color = status.open ? theme.success : theme.textMuted;
  return (
    <View testID="open-status" style={styles.row} accessible accessibilityLabel={status.label}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.text, { color: status.open ? theme.success : theme.textSecondary }]}>{status.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { fontSize: 13, fontWeight: '700' },
});
