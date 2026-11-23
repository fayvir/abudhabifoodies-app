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

// No chat pauses in tests unless a test sets them (src/flow/pacing.ts).
const { FLOW_PACING } = require('./src/flow/pacing');
FLOW_PACING.questionMs = 0;
FLOW_PACING.resultMs = 0;
