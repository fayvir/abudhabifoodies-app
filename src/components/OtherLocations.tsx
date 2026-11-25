import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { BranchLocation } from '../api/types';
import { useTheme } from '../theme/useTheme';
import { RestaurantActions } from './RestaurantActions';

/** "Also at N other locations", tap to list each with its area, address, Call and Directions. */
export function OtherLocations({ locations }: { locations: readonly BranchLocation[] | null | undefined }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  if (!locations || locations.length === 0) return null;
  const n = locations.length;
  const label = `Also at ${n} other location${n === 1 ? '' : 's'}`;
  return (
    <View style={[styles.box, { borderColor: theme.border, backgroundColor: theme.bgSecondary }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        style={styles.toggle}
      >
        <Ionicons name="location-outline" size={18} color={theme.text} />
        <Text style={[styles.toggleText, { color: theme.text }]}>{label}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={theme.textMuted} />
      </Pressable>
      {open
        ? locations.map((l) => (
            <View key={l.id} testID="other-location" style={[styles.item, { borderTopColor: theme.border }]}>
              <Text style={[styles.name, { color: theme.text }]}>{l.area ?? l.name}</Text>
              {l.address ? <Text style={[styles.address, { color: theme.textMuted }]}>{l.address}</Text> : null}
              <RestaurantActions name={l.area ? `${l.name}, ${l.area}` : l.name} phone={l.phone} googleMaps={l.google_maps} />
            </View>
          ))
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1.5, borderRadius: 14, overflow: 'hidden' },
  toggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  toggleText: { flex: 1, fontSize: 14, fontWeight: '700' },
  item: { borderTopWidth: 1, padding: 12, gap: 6 },
  name: { fontSize: 14, fontWeight: '700' },
  address: { fontSize: 12, lineHeight: 17 },
});
