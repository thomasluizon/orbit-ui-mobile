import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'
import appJson from '../app.json'

const require = createRequire(import.meta.url)
const createConfig = require('../app.config.js') as () => typeof appJson.expo

describe('Android app variant', () => {
  afterEach(() => { delete process.env.ORBIT_APP_VARIANT })

  it('keeps the default production config byte identical', () => {
    delete process.env.ORBIT_APP_VARIANT
    const expected = {
      ...appJson.expo,
      plugins: [...appJson.expo.plugins, './plugins/with-android-release-build-fixes', './plugins/with-react-native-imperative-focus'],
    }
    expect(JSON.stringify(createConfig())).toBe(JSON.stringify(expected))
  })

  it('sets the staging package, launcher name, scheme, and App Link host', () => {
    process.env.ORBIT_APP_VARIANT = 'staging'
    const config = createConfig()
    expect(config.name).toBe('Orbit Staging')
    expect(config.scheme).toBe('orbit-staging')
    expect(config.android.package).toBe('org.useorbit.app.staging')
    expect(config.android.playStoreUrl).toBe('https://play.google.com/store/apps/details?id=org.useorbit.app.staging')
    expect(config.android.intentFilters.flatMap((filter) => filter.data.map((entry) => entry.host)))
      .toEqual(['app-staging.useorbit.org', 'app-staging.useorbit.org'])
    expect(config.extra.router.origin).toBe('https://app-staging.useorbit.org')
    expect(appJson.expo.android.package).toBe('org.useorbit.app')
  })

  it('rejects an unknown variant', () => {
    process.env.ORBIT_APP_VARIANT = 'unknown'
    expect(() => createConfig()).toThrow('Unknown Orbit app variant')
  })
})
