import { installExpoGlobalPolyfill } from 'expo-modules-core/src/polyfill/dangerous-internal'

installExpoGlobalPolyfill()

const secureStoreValues = new Map<string, string>()

function readSecureStoreValue(key: string): string | null {
  return secureStoreValues.get(key) ?? null
}

function writeSecureStoreValue(value: string, key: string): boolean {
  secureStoreValues.set(key, value)
  return true
}

globalThis.expo.modules.ExpoSecureStore = {
  AFTER_FIRST_UNLOCK: 0,
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1,
  ALWAYS: 2,
  WHEN_PASSCODE_SET_THIS_DEVICE_ONLY: 3,
  ALWAYS_THIS_DEVICE_ONLY: 4,
  WHEN_UNLOCKED: 5,
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
  getValueWithKeyAsync: (key: string) => Promise.resolve(readSecureStoreValue(key)),
  getValueWithKeySync: (key: string) => readSecureStoreValue(key),
  setValueWithKeyAsync: (value: string, key: string) =>
    Promise.resolve(writeSecureStoreValue(value, key)),
  setValueWithKeySync: (value: string, key: string) => writeSecureStoreValue(value, key),
  deleteValueWithKeyAsync: (key: string) => {
    secureStoreValues.delete(key)
    return Promise.resolve()
  },
  canUseBiometricAuthentication: () => false,
}

globalThis.expo.modules.ExpoApplication = {
  applicationName: null,
  applicationId: null,
  bundleId: null,
  nativeApplicationVersion: null,
  nativeBuildVersion: null,
  androidId: null,
  getInstallationTimeAsync: () => Promise.resolve(null),
}
