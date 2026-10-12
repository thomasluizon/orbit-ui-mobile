import { createRequire } from 'node:module'
import { AndroidConfig, compileModsAsync, withAndroidManifest } from '@expo/config-plugins'
import { afterEach, describe, expect, it } from 'vitest'
import appJson from '../app.json'

const require = createRequire(import.meta.url)
const createConfig = require('../app.config.js') as () => typeof appJson.expo

describe('Android app variant', () => {
  afterEach(() => { delete process.env.ORBIT_APP_VARIANT })

  it('keeps the default production config with backup disabled and local plugins', () => {
    delete process.env.ORBIT_APP_VARIANT
    const expected = {
      ...appJson.expo,
      android: { ...appJson.expo.android, allowBackup: false },
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

  it.each(['production', 'staging'])('disables Android backup in the %s config', (variant) => {
    process.env.ORBIT_APP_VARIANT = variant
    expect(createConfig().android).toHaveProperty('allowBackup', false)
  })

  it.each(['production', 'staging'])('disables Android backup in the generated %s manifest', async (variant) => {
    process.env.ORBIT_APP_VARIANT = variant
    const config = createConfig()
    const configured = AndroidConfig.AllowBackup.withAllowBackup({
      name: config.name,
      slug: config.slug,
      android: config.android,
    })
    let manifest!: AndroidConfig.Manifest.AndroidManifest
    const observed = withAndroidManifest(configured, (mod) => {
      manifest = mod.modResults
      return mod
    })
    await compileModsAsync(observed, { projectRoot: process.cwd(), platforms: ['android'], introspect: true })
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest)
    expect(application.$['android:allowBackup']).toBe('false')
  })

  it('rejects an unknown variant', () => {
    process.env.ORBIT_APP_VARIANT = 'unknown'
    expect(() => createConfig()).toThrow('Unknown Orbit app variant')
  })
})
