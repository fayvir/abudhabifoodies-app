import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Alert, Image, Linking, Pressable, Share, StyleSheet, Text, View, useColorScheme } from 'react-native';

import type { ResultCard as ResultCardData } from '../api/types';
import { useFavourites } from '../favourites/useFavourites';
import { instagramUrl } from '../lib/links';
import { priceAedLabel } from '../lib/price';
import { buildShareText } from '../lib/share';
import { useTheme } from '../theme/useTheme';
import { RestaurantActions } from './RestaurantActions';
import { stickerShadow } from './stickerShadow';

function openLink(url: string): void {
  const failed = () => Alert.alert("Couldn't open that link");
  try {
    Linking.openURL(url).catch(failed);
  } catch {
    failed();
  }
}

export function ResultCard({ card }: { card: ResultCardData }) {
  const theme = useTheme();
  const dark = useColorScheme() === 'dark';
  const favourites = useFavourites();
  // Google photo URLs are short-lived: a failed one is dropped, not retried.
  const [failed, setFailed] = useState<readonly string[]>([]);

  const photo = (card.photos ?? []).find((u) => !failed.includes(u));
  const cuisines = card.cuisine ?? [];
  const price = priceAedLabel(card.price_range);
  const advertiser = card.advertiser_name?.trim();
  const instagram = instagramUrl(card.instagram_url);
  const saved = card.restaurant_id ? favourites.isFavourite(card.restaurant_id) : false;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.bgElevated, borderColor: theme.borderStrong },
        stickerShadow(theme, dark),
      ]}
    >
      {photo ? (
        <Image
          testID="result-photo"
          source={{ uri: photo }}
          accessibilityIgnoresInvertColors
          onError={() => setFailed((f) => [...f, photo])}
          style={[styles.photo, { borderBottomColor: theme.borderStrong }]}
          resizeMode="cover"
        />
      ) : (
        <View
          testID="photo-placeholder"
          style={[styles.photo, styles.placeholder, { backgroundColor: theme.primarySoft, borderBottomColor: theme.borderStrong }]}
        >
          <Ionicons name="restaurant-outline" size={36} color={theme.primaryDeep} />
          <Text style={[styles.placeholderName, { color: theme.primaryDeep }]}>Abu Dhabi Foodies</Text>
        </View>
      )}

      <View style={styles.body}>
        {card.is_sponsored === true ? (
          <View style={[styles.sponsored, { backgroundColor: theme.surfaceInvert, borderColor: theme.borderStrong }]}>
            <Text style={[styles.sponsoredText, { color: '#FFFFFF' }]}>
              {advertiser ? `Sponsored · ${advertiser}` : 'Sponsored'}
            </Text>
          </View>
        ) : null}

        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: theme.text }]}>{card.restaurant_name}</Text>
          {card.rating != null ? (
            <View
              accessible
              accessibilityLabel={`Rated ${card.rating.toFixed(1)}`}
              style={[styles.rating, { borderColor: theme.borderStrong, backgroundColor: theme.bgSecondary }]}>
              <Ionicons name="star" size={12} color={theme.text} />
              <Text style={[styles.ratingText, { color: theme.text }]}>{card.rating.toFixed(1)}</Text>
            </View>
          ) : null}
        </View>

        {card.note ? <Text style={[styles.note, { color: theme.textSecondary }]}>{`“${card.note}”`}</Text> : null}

        <View style={styles.chips}>
          {cuisines.map((c) => (
            <View key={c} style={[styles.chip, { borderColor: theme.border, backgroundColor: theme.bgSecondary }]}>
              <Text style={[styles.chipText, { color: theme.text }]}>{c}</Text>
            </View>
          ))}
          {card.area ? <Text style={[styles.meta, { color: theme.textMuted }]}>{card.area}</Text> : null}
          {price ? <Text style={[styles.meta, styles.mono, { color: theme.textMuted }]}>{price}</Text> : null}
        </View>

        <View style={styles.iconRow}>
          {card.restaurant_id ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={saved ? 'Remove from favourites' : 'Save to favourites'}
              onPress={() => void favourites.toggle(card.restaurant_id as string)}
              style={[styles.iconButton, { borderColor: theme.borderStrong }]}
            >
              <Ionicons name={saved ? 'heart' : 'heart-outline'} size={22} color={saved ? theme.primary : theme.text} />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Share recommendation"
            onPress={() => {
              Share.share({ message: buildShareText(card) }).catch(() => undefined);
            }}
            style={[styles.iconButton, { borderColor: theme.borderStrong }]}
          >
            <Ionicons name="share-outline" size={22} color={theme.text} />
          </Pressable>
        </View>

        {instagram ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Watch ${card.restaurant_name} on Instagram`}
            onPress={() => openLink(instagram)}
            style={[styles.watch, { borderColor: theme.borderStrong, backgroundColor: theme.bgSecondary }]}
          >
            <Ionicons name="logo-instagram" size={18} color={theme.text} />
            <Text style={[styles.watchText, { color: theme.text }]}>Watch on Instagram</Text>
          </Pressable>
        ) : null}

        <RestaurantActions
          name={card.restaurant_name}
          phone={card.phone}
          googleMaps={card.google_maps}
          website={card.website}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 2, borderRadius: 20, marginRight: 4, marginBottom: 4 },
  photo: { width: '100%', aspectRatio: 16 / 9, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomWidth: 2 },
  placeholder: { alignItems: 'center', justifyContent: 'center', gap: 4 },
  placeholderName: { fontSize: 13, fontWeight: '800' },
  body: { padding: 16, gap: 12 },
  sponsored: { alignSelf: 'flex-start', borderWidth: 2, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  sponsoredText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  title: { flex: 1, fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  ratingText: { fontSize: 12, fontWeight: '700' },
  note: { fontSize: 14, fontStyle: 'italic', lineHeight: 20 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontSize: 12, fontWeight: '600' },
  meta: { fontSize: 12 },
  mono: { fontWeight: '700' },
  iconRow: { flexDirection: 'row', gap: 8 },
  iconButton: { minWidth: 44, minHeight: 44, borderWidth: 2, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  watch: { flexDirection: 'row', gap: 8, minHeight: 44, borderWidth: 2, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  watchText: { fontSize: 13, fontWeight: '600' },
});
