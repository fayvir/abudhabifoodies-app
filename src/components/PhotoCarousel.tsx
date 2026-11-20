import { useState } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { useTheme } from '../theme/useTheme';

interface Props {
  photos: readonly string[];
  /** Called when a photo fails to load, so the card can drop it. */
  onPhotoError(url: string): void;
}

/**
 * Swipeable restaurant photos (as the website's PhotoCarousel): one photo per
 * page, dots below when there is more than one. The parent drops failed URLs,
 * so this only ever shows photos that have not failed.
 */
export function PhotoCarousel({ photos, onPhotoError }: Props) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const current = Math.min(index, photos.length - 1);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width > 0) setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  return (
    <View testID="photo-carousel" onLayout={onLayout} style={[styles.frame, { borderBottomColor: theme.borderStrong }]}>
      <ScrollView
        testID="photo-scroller"
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        accessibilityLabel={photos.length > 1 ? `Photos, swipe for more (${photos.length})` : 'Photo'}
      >
        {photos.map((url, i) => (
          <Image
            key={url}
            testID={`result-photo-${i}`}
            source={{ uri: url }}
            accessibilityIgnoresInvertColors
            accessibilityLabel={`Photo ${i + 1} of ${photos.length}`}
            onError={() => onPhotoError(url)}
            style={[styles.photo, { width: width || undefined }]}
            resizeMode="cover"
          />
        ))}
      </ScrollView>
      {photos.length > 1 ? (
        <View
          testID="photo-dots"
          style={styles.dots}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {photos.map((url, i) => (
            <View
              key={url}
              testID={i === current ? 'photo-dot-active' : 'photo-dot'}
              style={[styles.dot, { backgroundColor: i === current ? '#FFFFFF' : 'rgba(255,255,255,0.5)' }]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', aspectRatio: 16 / 9, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomWidth: 2, overflow: 'hidden' },
  photo: { height: '100%' },
  dots: { position: 'absolute', bottom: 10, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
});
