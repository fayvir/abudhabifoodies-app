import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { loadAnalyticsPreference } from '../src/settings/analyticsPreference';
import { applyThemePreference, loadThemePreference } from '../src/settings/themePreference';

export default function RootLayout() {
  // Apply the saved light/dark/system choice once at start. Until the (fast)
  // read resolves the app follows the phone, which is the default anyway.
  useEffect(() => {
    let active = true;
    void loadThemePreference().then((preference) => {
      if (active) applyThemePreference(preference);
    });
    return () => {
      active = false;
    };
  }, []);

  // Same for the analytics switch: the default is on, so before this resolves
  // tracking behaves as the default; a saved "off" takes over within ms.
  useEffect(() => {
    void loadAnalyticsPreference();
  }, []);

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
