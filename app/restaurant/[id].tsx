import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getRestaurantsByIds } from '../../src/api/client';
import type { PublicRestaurant } from '../../src/api/types';
import { OpenStatus } from '../../src/components/OpenStatus';
import { PhotoCarousel } from '../../src/components/PhotoCarousel';
import { RestaurantActions } from '../../src/components/RestaurantActions';
import { stickerShadow } from '../../src/components/stickerShadow';
import { useFavourites } from '../../src/favourites/useFavourites';
import { weekHours } from '../../src/lib/hours';
import { priceAedLabel } from '../../src/lib/price';
import { noteFor } from '../../src/snapshot/notes';
import { useSnapshot } from '../../src/snapshot/useSnapshot';
import { useTheme } from '../../src/theme/useTheme';

type Load = { kind: 'loading' } | { kind: 'error' } | { kind: 'missing' } | { kind: 'ready'; r: PublicRestaurant };

/** One saved or recent restaurant in full: every photo, open now, the week's hours and the actions. */
export default function RestaurantDetail() {
  const theme = useTheme();
  const dark = useColorScheme() === 'dark';
  const { id } = useLocalSearchParams<{ id: string }>();
  const favourites = useFavourites();
  const { snapshot } = useSnapshot();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [failed, setFailed] = useState<readonly string[]>([]);

  const fetchOne = useCallback(async () => {
    if (!id) return setLoad({ kind: 'missing' });
    setLoad({ kind: 'loading' });
    const result = await getRestaurantsByIds([id]);
    if (!result.ok) return setLoad({ kind: 'error' });
    const r = result.data.find((x) => x.id === id);
    setLoad(r ? { kind: 'ready', r } : { kind: 'missing' });
  }, [id]);

  useEffect(() => {
    void fetchOne();
  }, [fetchOne]);

  const back = () => (router.canGoBack() ? router.back() : router.navigate('/favourites'));

  let body;
  if (load.kind === 'loading') {
    body = <View style={styles.centered}><ActivityIndicator color={theme.primary} /></View>;
  } else if (load.kind !== 'ready') {
    body = (
      <View style={styles.centered}>
        <Text style={[styles.sub, { color: theme.text }]}>
          {load.kind === 'error' ? "Couldn't load this restaurant." : 'This restaurant is no longer listed.'}
        </Text>
        {load.kind === 'error' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Try again"
            onPress={() => void fetchOne()}
            style={[styles.primary, { backgroundColor: theme.primary, borderColor: theme.onAccent }]}
          >
            <Text style={[styles.primaryText, { color: theme.onAccent }]}>Try again</Text>
          </Pressable>
        ) : null}
      </View>
    );
  } else {
    const r = load.r;
    const photos = [...new Set(r.photos ?? [])].filter((u) => !failed.includes(u));
    const price = priceAedLabel(r.price_range);
    const saved = favourites.isFavourite(r.id);
    const week = weekHours(r.hours);
    const note = noteFor(snapshot, r.id);
    body = (
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, { backgroundColor: theme.bgElevated, borderColor: theme.borderStrong }, stickerShadow(theme, dark)]}>
          {photos.length > 0 ? (
            <PhotoCarousel photos={photos} onPhotoError={(url) => setFailed((f) => (f.includes(url) ? f : [...f, url]))} />
          ) : null}
          <View style={styles.body}>
            <View style={styles.titleRow}>
              <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>{r.name}</Text>
              {r.rating != null ? (
                <View
                  accessible
                  accessibilityLabel={`Rated ${r.rating.toFixed(1)}`}
                  style={[styles.rating, { borderColor: theme.borderStrong, backgroundColor: theme.bgSecondary }]}
                >
                  <Ionicons name="star" size={12} color={theme.text} />
                  <Text style={[styles.ratingText, { color: theme.text }]}>{r.rating.toFixed(1)}</Text>
                </View>
              ) : null}
            </View>
            {note ? <Text style={[styles.note, { color: theme.textSecondary }]}>{`“${note}”`}</Text> : null}
            <View style={styles.chips}>
              {(r.cuisine ?? []).map((c) => (
                <View key={c} style={[styles.chip, { borderColor: theme.border, backgroundColor: theme.bgSecondary }]}>
                  <Text style={[styles.chipText, { color: theme.text }]}>{c}</Text>
                </View>
              ))}
              {r.area ? <Text style={[styles.meta, { color: theme.textMuted }]}>{r.area}</Text> : null}
              {price ? <Text style={[styles.meta, styles.bold, { color: theme.textMuted }]}>{price}</Text> : null}
            </View>
            <OpenStatus hours={r.hours} />
            <RestaurantActions
              name={r.name}
              phone={r.phone}
              googleMaps={r.google_maps}
              website={r.website}
              iconOnly
              before={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={saved ? 'Remove from favourites' : 'Save to favourites'}
                  onPress={() => void favourites.toggle(r.id)}
                  style={[styles.save, { borderColor: theme.borderStrong, backgroundColor: theme.bgElevated }]}
                >
                  <Ionicons name={saved ? 'heart' : 'heart-outline'} size={22} color={saved ? theme.primary : theme.text} />
                </Pressable>
              }
            />
          </View>
        </View>

        {week.length > 0 ? (
          <View testID="week-hours" style={[styles.hours, { borderColor: theme.border, backgroundColor: theme.bgSecondary }]}>
            <Text style={[styles.hoursTitle, { color: theme.text }]}>Opening hours</Text>
            {week.map((w) => (
              <View key={w.day} style={styles.hoursRow}>
                <Text style={[styles.hoursDay, { color: theme.text }]}>{w.day}</Text>
                <Text style={[styles.hoursText, { color: theme.textSecondary }]}>{w.text}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: theme.bgElevated }}>
        <View style={[styles.bar, { borderBottomColor: theme.border }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={back} hitSlop={8} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={theme.text} />
            <Text style={[styles.backText, { color: theme.text }]}>Saved</Text>
          </Pressable>
        </View>
      </SafeAreaView>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  bar: { height: 56, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  backButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 },
  backText: { fontSize: 16, fontWeight: '600' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  sub: { fontSize: 15, textAlign: 'center' },
  primary: { minHeight: 44, borderWidth: 2, borderRadius: 14, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 14, fontWeight: '700' },
  content: { padding: 16, gap: 16 },
  card: { borderWidth: 2, borderRadius: 20, marginRight: 4, marginBottom: 4 },
  body: { padding: 16, gap: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  title: { flex: 1, fontSize: 24, fontWeight: '800', letterSpacing: -0.4 },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  ratingText: { fontSize: 12, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontSize: 12, fontWeight: '600' },
  meta: { fontSize: 12 },
  bold: { fontWeight: '700' },
  note: { fontSize: 15, fontStyle: 'italic', lineHeight: 21 },
  save: { flex: 1, minHeight: 44, borderWidth: 2, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  hours: { borderWidth: 1.5, borderRadius: 16, padding: 16, gap: 8 },
  hoursTitle: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  hoursRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  hoursDay: { fontSize: 14, fontWeight: '600' },
  hoursText: { flex: 1, textAlign: 'right', fontSize: 14 },
});
