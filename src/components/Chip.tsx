import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';

import { useTheme } from '../theme/useTheme';

export interface ChipProps {
  label: string;
  onPress: () => void;
  chevron?: boolean;
  disabled?: boolean;
}

const OFFSET = 2;

/** The one choice-chip style: surface, 2px ink border, flat offset "sticker" shadow. */
export function Chip({ label, onPress, chevron = false, disabled = false }: ChipProps) {
  const theme = useTheme();
  const shadow = useColorScheme() === 'dark' ? theme.primary : theme.borderStrong;
  return (
    <View style={styles.wrap}>
      {/* Flat offset shadow as a plain View: identical on iOS and Android. */}
      <View style={[styles.shadow, { backgroundColor: shadow }]} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.chip,
          {
            backgroundColor: pressed ? theme.primary : theme.bgElevated,
            borderColor: theme.borderStrong,
            opacity: disabled ? 0.5 : 1,
          },
        ]}
      >
        {({ pressed }) => (
          <>
            <Text style={[styles.label, { color: pressed ? theme.onAccent : theme.text }]}>{label}</Text>
            {chevron ? (
              <Ionicons
                testID="chip-chevron"
                name="chevron-forward"
                size={16}
                color={pressed ? theme.onAccent : theme.textSecondary}
                style={styles.chevron}
              />
            ) : null}
          </>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginRight: OFFSET, marginBottom: OFFSET, maxWidth: '100%' },
  shadow: {
    position: 'absolute',
    top: OFFSET,
    left: OFFSET,
    right: -OFFSET,
    bottom: -OFFSET,
    borderRadius: 999,
  },
  chip: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderWidth: 2,
    borderRadius: 999,
    flexShrink: 1,
  },
  label: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
  chevron: { marginLeft: 6 },
});
