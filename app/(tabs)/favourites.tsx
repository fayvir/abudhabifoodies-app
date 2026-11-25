import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';

import { getRestaurantsByIds } from '../../src/api/client';
import type { PublicRestaurant } from '../../src/api/types';
import { AppHeader } from '../../src/components/AppHeader';
import { PhotoCarousel } from '../../src/components/PhotoCarousel';
import { RestaurantActions } from '../../src/components/RestaurantActions';
import { stickerShadow } from '../../src/components/stickerShadow';
import {
  clearBeenThere,
  clearWantToTry,
  moveBackToWantToTry,
  moveToBeenThere,
  removeBeenThere,
  removeFavourite,
} from '../../src/favourites/store';
import { useBeenThere } from '../../src/favourites/useBeenThere';
import { useFavourites } from '../../src/favourites/useFavourites';
import { clearHistory, removeHistoryEntry } from '../../src/history/store';
import { useHistory } from '../../src/history/useHistory';
import { priceTierSymbol } from '../../src/lib/price';
import { useTheme } from '../../src/theme/useTheme';

type Load = { kind: 'idle' } | { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; rows: PublicRestaurant[] };

type Segment = 'want' | 'been' | 'recent';

const SEGMENTS: { value: Segment; label: string }[] = [
  { value: 'want', label: 'Want To Try' },
  { value: 'been', label: 'Been There' },
  { value: 'recent', label: 'Recent' },
];

export default function Favourites() {
  const theme = useTheme();
  const dark = useColorScheme() === 'dark';
  const want = useFavourites();
  const been = useBeenThere();
  const history = useHistory();
  const [segment, setSegment] = useState<Segment>('want');
  // Google photo URLs are short-lived: a failed one is dropped, not retried (as on the result card).
  const [failedPhotos, setFailedPhotos] = useState<readonly string[]>([]);
  // Restaurants for both lists load through one request set: moving a place
  // between lists leaves this union unchanged, so it never refetches.
  const ids = useMemo(
    () => [...want.ids, ...been.ids.filter((id) => !want.ids.includes(id))],
    [want.ids, been.ids],
  );
  const loaded = want.loaded && been.loaded;
  const activeIds = segment === 'been' ? been.ids : want.ids;
  const [load, setLoad] = useState<Load>({ kind: 'idle' });
  // Latest saved ids, so a reload (Try again) never needs `ids` as a dependency:
  // un-hearting must not refetch.
  const idsRef = useRef(ids);
  idsRef.current = ids;
  // Ids already requested from the server. Anything saved later (tabs stay
  // mounted, so a heart tapped on Discover lands here) is "missing" and triggers
  // a fetch; un-hearting only shrinks the set, so it never does.
  const requested = useRef<Set<string>>(new Set());
  const latest = useRef(0);

  const loadRef = useRef(load);
  loadRef.current = load;

  const fetchRows = useCallback(async () => {
    const wanted = idsRef.current;
    const mine = (latest.current += 1);
    requested.current = new Set(wanted);
    setLoad({ kind: 'loading' });
    const result = await getRestaurantsByIds(wanted);
    if (mine !== latest.current) return; // a newer request superseded this one
    setLoad(result.ok ? { kind: 'ready', rows: result.data } : { kind: 'error' });
  }, []);

  // Rows are already showing: fetch only the new ids and merge them in, never
  // blanking the list. A failure just leaves them out and lets a later add retry.
  const fetchMissing = useCallback(async (missing: string[]) => {
    const generation = latest.current;
    for (const id of missing) requested.current.add(id);
    const result = await getRestaurantsByIds(missing);
    if (generation !== latest.current) return; // a full reload superseded this one
    if (!result.ok) {
      for (const id of missing) requested.current.delete(id);
      return;
    }
    setLoad((prev) => {
      if (prev.kind !== 'ready') return prev;
      const fresh = new Set(result.data.map((r) => r.id));
      return { kind: 'ready', rows: [...prev.rows.filter((r) => !fresh.has(r.id)), ...result.data] };
    });
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (ids.length === 0) {
      // Once everything is un-hearted a later save should fetch afresh.
      requested.current = new Set();
      return;
    }
    const missing = ids.filter((id) => !requested.current.has(id));
    if (missing.length === 0) return;
    if (loadRef.current.kind === 'ready') void fetchMissing(missing);
    else void fetchRows();
  }, [loaded, ids, fetchRows, fetchMissing]);

  const rows = load.kind === 'ready' ? load.rows.filter((r) => activeIds.includes(r.id)) : [];
  const label = SEGMENTS.find((s) => s.value === segment)?.label ?? '';
  // Only when cards are actually on screen: never offer Clear above an empty state.
  const hasItems = segment === 'recent' ? history.entries.length > 0 : load.kind === 'ready' && rows.length > 0;

  // Clear empties only the list on screen (each card also has its own Remove button).
  const confirmClear = () => {
    const clear = segment === 'want' ? clearWantToTry : segment === 'been' ? clearBeenThere : clearHistory;
    Alert.alert(`Clear ${label}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => void clear() },
    ]);
  };

  const removeButton = (name: string, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Remove ${name}`}
      onPress={onPress}
      hitSlop={4}
      style={[styles.remove, { borderColor: theme.borderStrong }]}
    >
      <Ionicons name="trash-outline" size={20} color={theme.textMuted} />
    </Pressable>
  );

  const card = (
    key: string,
    name: string,
    area: string | null,
    priceRange: number | null,
    onRemove: () => void,
    extra: React.ReactNode,
    actions: { phone: string | null; googleMaps: string | null; website: string | null },
    rawPhotos: readonly string[] = [],
  ) => {
    const meta = [area, priceTierSymbol(priceRange)].filter((m) => m && m !== '—').join(' · ');
    const photos = [...new Set(rawPhotos)].filter((u) => !failedPhotos.includes(u));
    return (
      <View
        key={key}
        style={[styles.row, { backgroundColor: theme.bgElevated, borderColor: theme.borderStrong }, stickerShadow(theme, dark, 3)]}
      >
        {photos.length > 0 ? (
          <PhotoCarousel photos={photos} onPhotoError={(url) => setFailedPhotos((f) => (f.includes(url) ? f : [...f, url]))} />
        ) : null}
        <View style={styles.rowBody}>
          <View style={styles.rowHead}>
            <View style={styles.rowTitle}>
              <Text style={[styles.name, { color: theme.text }]}>{name}</Text>
              {meta ? <Text style={[styles.meta, { color: theme.textMuted }]}>{meta}</Text> : null}
            </View>
            {removeButton(name, onRemove)}
          </View>
          {extra}
          <RestaurantActions name={name} phone={actions.phone} googleMaps={actions.googleMaps} website={actions.website} />
        </View>
      </View>
    );
  };

  const empty = (icon: React.ComponentProps<typeof Ionicons>['name'], text: string, cta?: React.ReactNode) => (
    <Centered>
      <Ionicons name={icon} size={40} color={theme.textMuted} />
      <Text style={[styles.heading, { color: theme.text }]}>{text}</Text>
      {cta}
    </Centered>
  );

  let body;
  if (segment === 'recent') {
    if (!history.loaded) {
      body = <Centered><ActivityIndicator color={theme.primary} /></Centered>;
    } else if (history.entries.length === 0) {
      body = empty('time-outline', 'No history yet.');
    } else {
      body = (
        <FlatList
          data={history.entries}
          keyExtractor={(e) => e.key}
          contentContainerStyle={styles.list}
          renderItem={({ item }) =>
            card(
              item.key,
              item.name,
              item.area,
              item.price_range,
              () => void removeHistoryEntry(item.key),
              item.answers.length > 0 ? (
                <Text style={[styles.meta, { color: theme.textSecondary }]}>{item.answers.join(' · ')}</Text>
              ) : null,
              { phone: item.phone, googleMaps: item.google_maps, website: item.website },
            )
          }
        />
      );
    }
  } else if (!loaded) {
    body = <Centered><ActivityIndicator color={theme.primary} /></Centered>;
  } else if (activeIds.length === 0 || (load.kind === 'ready' && rows.length === 0)) {
    body =
      segment === 'want'
        ? empty(
            'heart-outline',
            'Nothing saved yet',
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Find somewhere to eat"
              onPress={() => router.navigate('/')}
              style={[styles.primary, { backgroundColor: theme.primary, borderColor: theme.onAccent }]}
            >
              <Text style={[styles.primaryText, { color: theme.onAccent }]}>Find somewhere to eat</Text>
            </Pressable>,
          )
        : empty('checkmark-circle-outline', "Mark places you've visited");
  } else if (load.kind === 'error') {
    body = (
      <Centered>
        <Text style={[styles.sub, { color: theme.text }]}>Couldn't load your saved places.</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Try again"
          onPress={() => void fetchRows()}
          style={[styles.primary, { backgroundColor: theme.primary, borderColor: theme.onAccent }]}
        >
          <Text style={[styles.primaryText, { color: theme.onAccent }]}>Try again</Text>
        </Pressable>
      </Centered>
    );
  } else if (load.kind === 'ready') {
    body = (
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) =>
          card(
            item.id,
            item.name,
            item.area,
            item.price_range,
            () => void (segment === 'want' ? removeFavourite(item.id) : removeBeenThere(item.id)),
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={segment === 'want' ? `Mark ${item.name} as Been There` : `Move ${item.name} back to Want To Try`}
              onPress={() => void (segment === 'want' ? moveToBeenThere(item.id) : moveBackToWantToTry(item.id))}
              style={[styles.move, { borderColor: theme.borderStrong, backgroundColor: theme.bgSecondary }]}
            >
              <Text style={[styles.moveText, { color: theme.text }]}>{segment === 'want' ? 'Been There' : 'Move back'}</Text>
            </Pressable>,
            { phone: item.phone, googleMaps: item.google_maps, website: item.website },
            item.photos ?? [],
          )
        }
      />
    );
  } else {
    body = <Centered><ActivityIndicator color={theme.primary} /></Centered>;
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <AppHeader action={hasItems ? { label: `Clear ${label}`, text: 'Clear', icon: 'trash-outline', onPress: confirmClear } : undefined} />
      {body}
      <View accessibilityRole="tablist" style={styles.segments}>
        {SEGMENTS.map((s) => {
          const selected = segment === s.value;
          return (
            <Pressable
              key={s.value}
              accessibilityRole="tab"
              accessibilityLabel={s.label}
              accessibilityState={{ selected }}
              onPress={() => setSegment(s.value)}
              style={[
                styles.segment,
                {
                  borderColor: theme.borderStrong,
                  backgroundColor: selected ? theme.primary : theme.bgElevated,
                },
              ]}
            >
              <Text numberOfLines={1} style={[styles.segmentText, { color: selected ? theme.onAccent : theme.text }]}>{s.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <View style={styles.centered}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  heading: { fontSize: 22, fontWeight: '800' },
  sub: { fontSize: 15, textAlign: 'center' },
  primary: { minHeight: 44, borderWidth: 2, borderRadius: 14, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 14, fontWeight: '700' },
  list: { padding: 16, gap: 16 },
  row: { borderWidth: 2, borderRadius: 20, marginRight: 3, marginBottom: 3 },
  rowBody: { padding: 14, gap: 12 },
  rowHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  rowTitle: { flex: 1, gap: 4 },
  name: { fontSize: 18, fontWeight: '800' },
  meta: { fontSize: 13 },
  remove: { minWidth: 44, minHeight: 44, borderWidth: 2, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  move: { minHeight: 44, borderWidth: 2, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  moveText: { fontSize: 13, fontWeight: '600' },
  segments: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 },
  segment: { flex: 1, minHeight: 44, borderWidth: 2, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontSize: 14, fontWeight: '700' },
});
