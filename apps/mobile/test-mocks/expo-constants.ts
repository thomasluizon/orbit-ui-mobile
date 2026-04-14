export const AppOwnership = {
  Expo: 'expo',
  Standalone: 'standalone',
  Guest: 'guest',
} as const

const Constants = {
  appOwnership: AppOwnership.Standalone,
  expoConfig: {
    version: '1.0.0',
    android: {
      package: 'org.useorbit.app',
    },
    extra: {},
  },
  easConfig: {
    projectId: 'test-project-id',
  },
}

export default Constants
