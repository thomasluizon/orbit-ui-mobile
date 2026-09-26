export const AppOwnership = {
  Expo: 'expo',
  Standalone: 'standalone',
  Guest: 'guest',
} as const

export const ExecutionEnvironment = {
  Bare: 'bare',
  Standalone: 'standalone',
  StoreClient: 'storeClient',
} as const

export const standaloneRuntime = {
  executionEnvironment: ExecutionEnvironment.Standalone,
  expoGoConfig: { name: 'Orbit' },
} as const

export const expoGoRuntime = {
  executionEnvironment: ExecutionEnvironment.StoreClient,
  expoGoConfig: { name: 'Orbit' },
} as const

export const developmentClientRuntime = {
  executionEnvironment: ExecutionEnvironment.StoreClient,
  expoGoConfig: { name: 'Orbit' },
} as const

const Constants = {
  appOwnership: AppOwnership.Standalone,
  ...standaloneRuntime,
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
