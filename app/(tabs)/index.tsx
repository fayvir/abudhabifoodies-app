import { useCallback, useEffect, useRef } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
} from 'react-native';

import { AppHeader } from '../../src/components/AppHeader';
import { Chip } from '../../src/components/Chip';
import { ResultCard } from '../../src/components/ResultCard';
import { TypingDots } from '../../src/components/TypingDots';
import { SKIP_LABEL } from '../../src/flow/engine';
import { useDiscoveryFlow } from '../../src/flow/useDiscoveryFlow';
import { recordPick } from '../../src/history/store';
import { useTheme } from '../../src/theme/useTheme';

/** How close to the end (px) still counts as "at the bottom". */
const NEAR_BOTTOM = 120;

export default function Discover() {
  const theme = useTheme();
  const flow = useDiscoveryFlow();
  const { status, outcome } = flow;
  const scrollRef = useRef<ScrollViewInstance>(null);
  const lastHeight = useRef(0);
  const atBottom = useRef(true);
  const newItem = useRef(false);
  // Chat-like: once the visitor has answered something, new content scrolls into view.
  const started = flow.transcript.length > 0 || outcome !== null;

  // A new question/answer or the result is "a new message": always bring it into view.
  // Other growth (an image finishing loading, a spinner) only follows a reader who is
  // already at the bottom, so scrolling up to re-read earlier answers is never undone.
  useEffect(() => {
    newItem.current = true;
  }, [flow.transcript.length, outcome]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    atBottom.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - NEAR_BOTTOM;
  };

  const onContentSizeChange = (_w: number, h: number) => {
    const grew = h > lastHeight.current;
    lastHeight.current = h;
    if (grew && started && (newItem.current || atBottom.current)) {
      newItem.current = false;
      atBottom.current = true;
      scrollRef.current?.scrollToEnd({ animated: true });
    }
  };

  // Remember each pick that was shown, with the answers that led to it (Saved > Recent).
  const transcriptRef = useRef(flow.transcript);
  transcriptRef.current = flow.transcript;
  useEffect(() => {
    if (outcome?.kind !== 'pick') return;
    const answers = transcriptRef.current.map((t) => t.answerLabel).filter((a) => a !== SKIP_LABEL);
    for (const card of outcome.picks) void recordPick(card, answers);
  }, [outcome]);

  const { restart: restartFlow } = flow;
  const restart = useCallback(() => {
    restartFlow();
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [restartFlow]);

  const notice = (text: string) => <Text style={[styles.notice, { color: theme.text }]}>{text}</Text>;

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <AppHeader action={started ? { label: 'New search', text: 'New', icon: 'refresh', onPress: restart } : undefined} />
      <ScrollView
        ref={scrollRef}
        testID="discover-scroll"
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={onContentSizeChange}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {status === 'load_error' ? (
          <View style={styles.center}>
            {notice('Something went wrong loading the guide.')}
            <Chip label="Try again" onPress={flow.retry} />
          </View>
        ) : null}

        {status === 'ready' && flow.transcript.length === 0 ? (
          <Text accessibilityRole="header" style={[styles.intro, { color: theme.text }]}>
            Answer a few questions. Find the best.{' '}
            <Text style={{ color: theme.primaryDeep }}>Eat well.</Text>
          </Text>
        ) : null}

        {flow.transcript.map((entry, i) => (
          <View key={`${entry.questionKey}-${i}`} style={styles.exchange}>
            <View style={[styles.bot, { backgroundColor: theme.bgSecondary, borderColor: theme.borderStrong }]}>
              <Text style={[styles.bubbleText, { color: theme.text }]}>{entry.questionLabel}</Text>
            </View>
            <View style={[styles.user, { backgroundColor: theme.surfaceInvert }]}>
              <Text style={[styles.userText, { color: '#FFFFFF' }]}>{entry.answerLabel}</Text>
            </View>
          </View>
        ))}

        {flow.question ? (
          <View style={styles.exchange}>
            <View style={[styles.bot, { backgroundColor: theme.bgSecondary, borderColor: theme.borderStrong }]}>
              <Text style={[styles.bubbleText, { color: theme.text }]}>{flow.question.label}</Text>
            </View>
            <View style={styles.chips}>
              {flow.options.map((o) => (
                <Chip key={o.id} label={o.label} chevron={flow.chevronIds.has(o.id)} onPress={() => flow.answer(o)} />
              ))}
              {flow.canSkip ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Skip"
                  onPress={flow.skip}
                  style={[styles.skip, { borderColor: theme.border }]}
                >
                  <Text style={[styles.skipText, { color: theme.textMuted }]}>Skip</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}

        {status === 'thinking' ? (
          <View
            testID="flow-typing"
            accessibilityLabel="Typing"
            style={[styles.bot, styles.typing, { backgroundColor: theme.bgSecondary, borderColor: theme.borderStrong }]}
          >
            <TypingDots />
          </View>
        ) : null}

        {status === 'loading' ? (
          <View testID="flow-loading" style={styles.center}>
            <ActivityIndicator color={theme.primary} />
          </View>
        ) : null}

        {outcome?.kind === 'pick' ? (
          <View style={styles.results}>
            <Text style={[styles.notice, { color: theme.text }]}>Here's what we'd recommend:</Text>
            {outcome.picks.map((p, i) => (
              <ResultCard key={`${p.restaurant_id ?? p.restaurant_name}-${i}`} card={p} />
            ))}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Start a new search"
              onPress={restart}
              style={[styles.newSearch, { backgroundColor: theme.primary, borderColor: theme.onAccent }]}
            >
              <Ionicons name="refresh" size={18} color={theme.onAccent} />
              <Text style={[styles.newSearchText, { color: theme.onAccent }]}>Start a new search</Text>
            </Pressable>
          </View>
        ) : null}
        {outcome?.kind === 'no_match' ? notice(outcome.note) : null}
        {outcome?.kind === 'error' ? notice(outcome.message) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 48, gap: 16 },
  center: { alignItems: 'center', gap: 12, paddingVertical: 16 },
  intro: { fontSize: 34, lineHeight: 38, fontWeight: '800', letterSpacing: -1 },
  exchange: { gap: 12 },
  bot: {
    alignSelf: 'flex-start',
    maxWidth: '85%',
    borderWidth: 2,
    borderRadius: 20,
    borderBottomLeftRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  bubbleText: { fontSize: 15, fontWeight: '600' },
  typing: { paddingVertical: 14, paddingHorizontal: 16 },
  user: {
    alignSelf: 'flex-end',
    maxWidth: '75%',
    borderRadius: 20,
    borderBottomRightRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  userText: { fontSize: 15, fontWeight: '500' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  skip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 999,
  },
  skipText: { fontSize: 14, fontWeight: '600' },
  notice: { fontSize: 16, fontWeight: '600', textAlign: 'left' },
  results: { gap: 12 },
  newSearch: { minHeight: 48, borderWidth: 2, borderRadius: 14, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  newSearchText: { fontSize: 15, fontWeight: '700' },
});
