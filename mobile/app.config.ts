import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Remix Studio',
  slug: 'remixstudio',
  owner: 'your-expo-account',
  scheme: 'remixstudio',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  backgroundColor: '#0b0f10',
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.example.remixstudio',
    // Every Expo SDK 57 native module's podspec requires iOS 16.4 minimum
    // (only react-native's own hermes-engine podspec still declares 15.1,
    // which otherwise wins as the effective default and breaks the build).
    // This is the "built-in" property (SDK 56+); expo-build-properties' own
    // ios.deploymentTarget option is deprecated in favor of this.
    deploymentTarget: '16.4',
    infoPlist: {
      // Only exempt encryption (HTTPS) — skips the TestFlight compliance questionnaire.
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  plugins: [
    'expo-secure-store',
    'expo-audio',
    'expo-sharing',
    [
      'expo-share-extension',
      {
        activationRules: [
          { type: 'url', max: 1 },
          { type: 'text', max: 1 },
        ],
        // Dev tooling has no purpose inside a share extension bundle; trims its size.
        excludedPackages: ['expo-dev-client'],
      },
    ],
  ],
  extra: {
    eas: {
      projectId: 'your-eas-project-id',
    },
  },
});
