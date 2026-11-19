import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

import { useTheme } from '../../src/theme/useTheme';

type IconName = ComponentProps<typeof Ionicons>['name'];

function icon(filled: IconName, outline: IconName, testID: string) {
  return function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <Ionicons testID={testID} name={focused ? filled : outline} size={22} color={color as string} />;
  };
}

// Created once: a new component type per render would remount the icons.
const DiscoverIcon = icon('restaurant', 'restaurant-outline', 'tab-icon-discover');
const SavedIcon = icon('heart', 'heart-outline', 'tab-icon-saved');
const SettingsIcon = icon('settings', 'settings-outline', 'tab-icon-settings');

export default function TabsLayout() {
  const theme = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primaryDeep,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarStyle: { backgroundColor: theme.bg, borderTopColor: theme.border },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Discover', tabBarIcon: DiscoverIcon, tabBarButtonTestID: 'tab-discover' }} />
      <Tabs.Screen name="favourites" options={{ title: 'Saved', tabBarIcon: SavedIcon, tabBarButtonTestID: 'tab-saved' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: SettingsIcon, tabBarButtonTestID: 'tab-settings' }} />
    </Tabs>
  );
}
