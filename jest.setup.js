// Icons render as a plain View in tests: the real component loads its font through
// expo-font/expo-asset, which jest cannot resolve. `iconName` lets tests check which icon.
jest.mock('@expo/vector-icons/Ionicons', () => {
  const React = require('react');
  const { View } = require('react-native');
  function Ionicons({ name, testID, style }) {
    return React.createElement(View, { testID, style, iconName: name });
  }
  return { __esModule: true, default: Ionicons };
});
