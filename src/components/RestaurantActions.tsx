import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { directionsUrl, reserveUrl, telUrl } from '../lib/links';
import { useTheme } from '../theme/useTheme';

interface Props {
  name: string;
  phone?: string | null;
  googleMaps?: string | null;
  website?: string | null;
  /** Icons instead of words (labels stay for screen readers). */
  iconOnly?: boolean;
  /** Another button drawn first in the same row (the detail page's Save). */
  before?: ReactNode;
}

function open(url: string): void {
  const failed = () => Alert.alert("Couldn't open that link");
  try {
    Linking.openURL(url).catch(failed);
  } catch {
    failed();
  }
}

/** Call / Directions / Reserve: equal 44pt buttons, each omitted without data. */
export function RestaurantActions({ name, phone, googleMaps, website, iconOnly = false, before }: Props) {
  const theme = useTheme();
  const tel = telUrl(phone);
  const maps = directionsUrl(googleMaps);
  const site = reserveUrl(website);
  if (!tel && !maps && !site && !before) return null;
  const content = (text: string, icon: ComponentProps<typeof Ionicons>['name'], color: string) =>
    iconOnly ? (
      <Ionicons name={icon} size={22} color={color} />
    ) : (
      <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.label, { color }]}>{text}</Text>
    );

  const outline = { borderColor: theme.borderStrong, backgroundColor: theme.bgElevated };
  return (
    <View style={styles.row}>
      {before}
      {tel ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Call ${name}`}
          onPress={() => open(tel)}
          style={[styles.button, outline]}
        >
          {content('Call', 'call-outline', theme.text)}
        </Pressable>
      ) : null}
      {maps ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Directions to ${name}`}
          onPress={() => open(maps)}
          style={[styles.button, outline]}
        >
          {content('Directions', 'navigate-outline', theme.text)}
        </Pressable>
      ) : null}
      {site ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Visit website for ${name}`}
          onPress={() => open(site)}
          style={[styles.button, { borderColor: theme.onAccent, backgroundColor: theme.primary }]}
        >
          {content('Reserve', 'globe-outline', theme.onAccent)}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  button: {
    flex: 1,
    minHeight: 44,
    borderWidth: 2,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  label: { fontSize: 13, fontWeight: '600' },
});
