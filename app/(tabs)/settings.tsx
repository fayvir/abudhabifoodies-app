import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View, useColorScheme } from 'react-native';
import * as Application from 'expo-application';
import * as WebBrowser from 'expo-web-browser';

import { AppHeader } from '../../src/components/AppHeader';
import { stickerShadow } from '../../src/components/stickerShadow';
import { FEEDBACK_EMAIL, feedbackUrl } from '../../src/lib/links';
import {
  isAnalyticsEnabled,
  loadAnalyticsPreference,
  saveAnalyticsPreference,
} from '../../src/settings/analyticsPreference';
import {
  applyThemePreference,
  loadThemePreference,
  saveThemePreference,
  type ThemePreference,
} from '../../src/settings/themePreference';
import { useTheme } from '../../src/theme/useTheme';

const SITE = 'https://www.abudhabifoodies.ae';

const OPTIONS: { value: ThemePreference; label: string; hint: string }[] = [
  { value: 'system', label: 'System', hint: 'Follow your phone' },
  { value: 'light', label: 'Light', hint: 'Always light' },
  { value: 'dark', label: 'Dark', hint: 'Always dark' },
];

function failed(): void {
  Alert.alert("Couldn't open that link");
}

function openInApp(url: string): void {
  try {
    WebBrowser.openBrowserAsync(url).catch(failed);
  } catch {
    failed();
  }
}

function openExternal(url: string): void {
  try {
    Linking.openURL(url).catch(failed);
  } catch {
    failed();
  }
}

/** "1.0.0 (3.1)": the store version and the build number; null where the app has neither (web, tests). */
function appVersion(): string | null {
  const version = Application.nativeApplicationVersion;
  const build = Application.nativeBuildVersion;
  if (!version) return null;
  return build ? `${version} (${build})` : version;
}

function sendFeedback(): void {
  const failed = () => Alert.alert("Couldn't open your email app", `Please write to ${FEEDBACK_EMAIL}.`);
  try {
    Linking.openURL(feedbackUrl(appVersion())).catch(failed);
  } catch {
    failed();
  }
}

const FOOTER_LINKS: { label: string; onPress: () => void }[] = [
  { label: 'Terms', onPress: () => openInApp(`${SITE}/terms`) },
  { label: 'Privacy', onPress: () => openInApp(`${SITE}/privacy`) },
];

export default function Settings() {
  const theme = useTheme();
  const dark = useColorScheme() === 'dark';
  // null until the saved choice has loaded, so nothing is shown as chosen prematurely.
  const [preference, setPreference] = useState<ThemePreference | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let active = true;
    void loadThemePreference().then((saved) => {
      if (active) setPreference((current) => current ?? saved); // a tap made while loading wins
    });
    return () => {
      active = false;
    };
  }, []);

  const [analytics, setAnalytics] = useState<boolean>(isAnalyticsEnabled());

  useEffect(() => {
    let active = true;
    void loadAnalyticsPreference().then((on) => {
      if (active) setAnalytics(on);
    });
    return () => {
      active = false;
    };
  }, []);

  const toggleAnalytics = (on: boolean) => {
    setAnalytics(on);
    void saveAnalyticsPreference(on);
  };

  const select = (value: ThemePreference) => {
    setPreference(value);
    setMenuOpen(false);
    applyThemePreference(value);
    void saveThemePreference(value);
  };

  const version = appVersion();
  const current = OPTIONS.find((o) => o.value === preference);

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <AppHeader />
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={[styles.title, { color: theme.primaryDeep }]}>
          Settings
        </Text>
        <Text accessibilityRole="header" style={[styles.section, { color: theme.textMuted }]}>
          About
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          Every pick in this app comes from the Abu Dhabi Foodies community: places our followers love, share and keep
          going back to. Tell us what you’re in the mood for and we’ll match you to one of them.
        </Text>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Instagram @abudhabifoodies"
          onPress={() => openExternal('https://www.instagram.com/abudhabifoodies')}
          hitSlop={8}
          style={styles.instagram}
        >
          <Ionicons name="logo-instagram" size={28} color={theme.primaryDeep} />
          <Text style={[styles.rowText, { color: theme.primaryDeep }]}>@abudhabifoodies</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send feedback"
          onPress={sendFeedback}
          style={[
            styles.row,
            { borderColor: theme.borderStrong, backgroundColor: theme.bgElevated },
            stickerShadow(theme, dark, 2),
          ]}
        >
          <Text style={[styles.rowText, { color: theme.text }]}>Send feedback</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.primaryDeep} />
        </Pressable>
        <Text accessibilityRole="header" style={[styles.section, { color: theme.textMuted }]}>
          Appearance
        </Text>
        <View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Appearance"
            accessibilityValue={{ text: current?.label ?? '' }}
            accessibilityState={{ expanded: menuOpen }}
            onPress={() => setMenuOpen((open) => !open)}
            style={[
              styles.row,
              { borderColor: theme.borderStrong, backgroundColor: theme.bgElevated },
              stickerShadow(theme, dark, 2),
            ]}
          >
            <Text style={[styles.rowText, { color: theme.text }]}>Theme</Text>
            <View style={styles.value}>
              <Text style={[styles.rowText, { color: theme.primaryDeep }]}>{current?.label ?? ''}</Text>
              <Ionicons name={menuOpen ? 'chevron-up' : 'chevron-down'} size={18} color={theme.primaryDeep} />
            </View>
          </Pressable>
          {menuOpen ? (
            <View style={[styles.menu, { borderColor: theme.borderStrong, backgroundColor: theme.bgElevated }]}>
              {OPTIONS.map((o) => {
                const selected = preference === o.value;
                return (
                  <Pressable
                    key={o.value}
                    accessibilityRole="button"
                    accessibilityLabel={o.label}
                    accessibilityHint={o.hint}
                    accessibilityState={{ selected }}
                    onPress={() => select(o.value)}
                    style={[styles.menuItem, { backgroundColor: selected ? theme.primarySoft : 'transparent' }]}
                  >
                    <Text style={[styles.rowText, { color: theme.text }]}>{o.label}</Text>
                    {selected ? <Ionicons testID="theme-check" name="checkmark" size={20} color={theme.primaryDeep} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
        <Text accessibilityRole="header" style={[styles.section, { color: theme.textMuted }]}>
          Privacy
        </Text>
        <View
          style={[
            styles.row,
            { borderColor: theme.borderStrong, backgroundColor: theme.bgElevated },
            stickerShadow(theme, dark, 2),
          ]}
        >
          <Text style={[styles.rowText, styles.labels, { color: theme.text }]}>Share anonymous usage stats</Text>
          <Switch
            accessibilityLabel="Share anonymous usage stats"
            value={analytics}
            onValueChange={toggleAnalytics}
            trackColor={{ false: theme.border, true: theme.primary }}
            thumbColor={theme.bgElevated}
          />
        </View>
        {version ? <Text style={[styles.version, { color: theme.textMuted }]}>{`Version ${version}`}</Text> : null}
      </ScrollView>
      <View style={styles.footer}>
        {FOOTER_LINKS.map((link, i) => (
          <View key={link.label} style={styles.footerItem}>
            {i > 0 ? <Text style={[styles.footerText, { color: theme.textMuted }]}>·</Text> : null}
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={link.label}
              onPress={link.onPress}
              hitSlop={8}
              style={styles.footerLink}
            >
              <Text style={[styles.footerText, styles.footerUnderline, { color: theme.textMuted }]}>{link.label}</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 32, gap: 16 },
  title: { fontSize: 34, lineHeight: 38, fontWeight: '800', letterSpacing: -1 },
  section: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  body: { fontSize: 15, lineHeight: 23 },
  row: {
    minHeight: 48,
    borderWidth: 2,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  menu: { borderWidth: 2, borderRadius: 14, marginTop: 8, overflow: 'hidden' },
  menuItem: {
    minHeight: 48,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  labels: { flexShrink: 1 },
  rowText: { fontSize: 15, fontWeight: '600' },
  version: { fontSize: 13, textAlign: 'center' },
  value: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  instagram: { minHeight: 44, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8 },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingBottom: 8 },
  footerItem: { flexDirection: 'row', alignItems: 'center' },
  footerLink: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 10 },
  footerText: { fontSize: 13 },
  footerUnderline: { textDecorationLine: 'underline' },
});
