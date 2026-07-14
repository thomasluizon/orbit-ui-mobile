import { beforeEach, describe, expect, it, vi } from 'vitest'
import { APP_VERSION_HEADER } from '@orbit/shared/utils'

import { buildAppVersionHeaders, getAppVersion } from '@/lib/app-version'

const appMocks = vi.hoisted(() => ({
  nativeVersion: null as string | null,
  configVersion: undefined as string | null | undefined,
}))

vi.mock('expo-application', () => ({
  get nativeApplicationVersion() {
    return appMocks.nativeVersion
  },
}))

vi.mock('expo-constants', () => ({
  default: {
    get expoConfig() {
      return { version: appMocks.configVersion }
    },
  },
}))

describe('getAppVersion', () => {
  beforeEach(() => {
    appMocks.nativeVersion = null
    appMocks.configVersion = undefined
  })

  it('prefers the native APK version over the Expo config version', () => {
    appMocks.nativeVersion = '2.3.1'
    appMocks.configVersion = '1.0.0'

    expect(getAppVersion()).toBe('2.3.1')
  })

  it('falls back to the Expo config version when there is no native version', () => {
    appMocks.nativeVersion = null
    appMocks.configVersion = '1.4.2'

    expect(getAppVersion()).toBe('1.4.2')
  })

  it('returns null when neither source resolves a version', () => {
    appMocks.nativeVersion = null
    appMocks.configVersion = null

    expect(getAppVersion()).toBeNull()
  })
})

describe('buildAppVersionHeaders', () => {
  beforeEach(() => {
    appMocks.nativeVersion = null
    appMocks.configVersion = undefined
  })

  it('emits the X-App-Version header when a version resolves', () => {
    appMocks.nativeVersion = '2.3.1'

    expect(buildAppVersionHeaders()).toEqual({ [APP_VERSION_HEADER]: '2.3.1' })
  })

  it('emits an empty object so the request stays unjudged when no version resolves', () => {
    appMocks.nativeVersion = null
    appMocks.configVersion = null

    expect(buildAppVersionHeaders()).toEqual({})
  })
})
