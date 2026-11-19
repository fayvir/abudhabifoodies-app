import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../theme/useTheme';

const MARK = require('../../assets/images/logo-mark.png') as number;

export interface HeaderAction {
  /** Screen-reader name, e.g. "New search". */
  label: string;
  /** Short visible text next to the icon, e.g. "New". */
  text: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
}

interface Props {
  /** One button on the right (New search on Discover, Clear on Saved); none when omitted. */
  action?: HeaderAction;
}

/**
 * The website header as a fixed app bar:
 * 56pt, elevated background, 1px bottom border, brand mark + wordmark.
 * The outer SafeAreaView pads the top inset in the SAME background colour, so
 * the bar's colour runs under the status bar.
 */
export function AppHeader({ action }: Props) {
  const theme = useTheme();
  return (
    <SafeAreaView testID="app-header-safe-area" edges={['top']} style={{ backgroundColor: theme.bgElevated }}>
      <View
        testID="app-header-bar"
        style={[styles.bar, { backgroundColor: theme.bgElevated, borderBottomColor: theme.border }]}
      >
        <View style={styles.lockup}>
          <Image
            testID="app-header-mark"
            source={MARK}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.mark}
          />
          <Text accessibilityRole="header" numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.wordmark, { color: theme.text }]}>
            Abu Dhabi Foodies
          </Text>
        </View>
        {action ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={action.label}
            onPress={action.onPress}
            style={[styles.button, { borderColor: theme.border }]}
          >
            <Ionicons name={action.icon} size={16} color={theme.textSecondary} />
            <Text numberOfLines={1} style={[styles.buttonText, { color: theme.textSecondary }]}>
              {action.text}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 56,
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  lockup: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  mark: { width: 28, height: 28 },
  wordmark: { fontSize: 16, fontWeight: '700', flexShrink: 1 },
  button: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 999,
  },
  buttonText: { fontSize: 14, fontWeight: '600' },
});
