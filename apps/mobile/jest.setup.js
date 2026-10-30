/* global jest */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Native safe-area insets do not exist under Jest: render a plain View that
// keeps the props (testID, style, edges) so layout contracts stay assertable.
jest.mock('react-native-safe-area-context', () => {
  const { createElement } = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, ...props }) =>
      createElement(View, props, children),
  };
});
