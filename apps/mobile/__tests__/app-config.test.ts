import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { AndroidConfig, IOSConfig, compileModsAsync, withAndroidManifest } from '@expo/config-plugins'
import { afterEach, describe, expect, it, vi } from 'vitest'
import appJson from '../app.json'

const require = createRequire(import.meta.url)
const createConfig = require('../app.config.js') as () => typeof appJson.expo

describe('Android app variant', () => {
  afterEach(() => { delete process.env.ORBIT_APP_VARIANT; vi.unstubAllEnvs() })

  it('keeps the default production config with backup disabled and local plugins', () => {
    delete process.env.ORBIT_APP_VARIANT
    const expected = {
      ...appJson.expo,
      updates: { ...appJson.expo.updates, enabled: false },
      android: { ...appJson.expo.android, allowBackup: false },
      plugins: [...appJson.expo.plugins, './plugins/with-android-release-build-fixes', './plugins/with-react-native-imperative-focus', './plugins/with-ios-widget', './plugins/with-ios-scene'],
    }
    expect(JSON.stringify(createConfig())).toBe(JSON.stringify(expected))
  })

  it('sets the staging package, launcher name, scheme, and App Link host', () => {
    process.env.ORBIT_APP_VARIANT = 'staging'
    const config = createConfig()
    expect(config.runtimeVersion).toBe(`${appJson.expo.runtimeVersion}-staging`)
    expect(config.name).toBe('Orbit Staging')
    expect(config.scheme).toBe('orbit-staging')
    expect(config.android.package).toBe('org.useorbit.app.staging')
    expect(config.android.playStoreUrl).toBe('https://play.google.com/store/apps/details?id=org.useorbit.app.staging')
    expect(config.android.intentFilters.flatMap((filter) => filter.data.map((entry) => entry.host)))
      .toEqual(['app-staging.useorbit.org', 'app-staging.useorbit.org', 'app-staging.useorbit.org'])
    expect(config.extra.router.origin).toBe('https://app-staging.useorbit.org')
    expect(appJson.expo.android.package).toBe('org.useorbit.app')
  })

  it.each(['production', 'staging'])('selects a build version without changing the %s checkout config', (variant) => {
    vi.stubEnv('ORBIT_APP_VARIANT', variant)
    vi.stubEnv('ORBIT_APP_VERSION', '2.4.6')
    const config = createConfig()
    expect(config.version).toBe('2.4.6')
    expect(config.ios.buildNumber).toBe(appJson.expo.ios.buildNumber)
    expect(config.android.versionCode).toBe(appJson.expo.android.versionCode)
    vi.stubEnv('ORBIT_APP_VERSION', undefined)
    expect(createConfig().version).toBe(appJson.expo.version)
  })

  it.each(['', '1.2', '1.2.3-beta', ' 1.2.3', '1.2.3\n'])('rejects invalid build version %j', (version) => {
    vi.stubEnv('ORBIT_APP_VERSION', version)
    expect(() => createConfig()).toThrow('Invalid ORBIT_APP_VERSION; expected x.y.z')
  })

  it.each(['production', 'staging'])('generates a verified exact login path for %s without broadening callback or referral routing', async (variant) => {
    process.env.ORBIT_APP_VARIANT = variant
    const config = createConfig()
    const configured = AndroidConfig.IntentFilters.withAndroidIntentFilters({
      name: config.name, slug: config.slug, android: config.android,
    })
    let manifest!: AndroidConfig.Manifest.AndroidManifest
    const observed = withAndroidManifest(configured, (mod) => { manifest = mod.modResults; return mod })
    await compileModsAsync(observed, { projectRoot: process.cwd(), platforms: ['android'], introspect: true })
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(manifest)
    const filters = activity['intent-filter'] ?? []
    const verified = filters.filter((filter) => filter.$?.['android:autoVerify'] === 'true')
    const host = variant === 'staging' ? 'app-staging.useorbit.org' : 'app.useorbit.org'
    expect(verified.flatMap((filter) => filter.data?.map((entry) => entry.$))).toEqual([
      { 'android:scheme': 'https', 'android:host': host, 'android:path': '/login' },
      { 'android:scheme': 'https', 'android:host': host, 'android:pathPrefix': '/auth-callback' },
      { 'android:scheme': 'https', 'android:host': host, 'android:pathPrefix': '/r/' },
    ])
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

  it.each(['production', 'staging'])('ships only the embedded bundle in %s', (variant) => {
    process.env.ORBIT_APP_VARIANT = variant
    expect(createConfig().updates.enabled).toBe(false)
    expect(createConfig().updates.checkAutomatically).toBe('NEVER')
  })

  it.each(['production', 'staging'])('generates embedded-only update settings for %s', async (variant) => {
    process.env.ORBIT_APP_VARIANT = variant
    const config = createConfig()
    const version = (require('expo-updates/package.json') as { version: string }).version
    let manifest!: AndroidConfig.Manifest.AndroidManifest
    const configured = withAndroidManifest({ name: config.name, slug: config.slug }, async (mod) => {
      mod.modResults = await AndroidConfig.Updates.setUpdatesConfigAsync(
        mod.modRequest.projectRoot,
        config as Parameters<typeof AndroidConfig.Updates.setUpdatesConfigAsync>[1],
        mod.modResults, version,
      )
      manifest = mod.modResults
      return mod
    })
    await compileModsAsync(configured, {
      projectRoot: resolve(import.meta.dirname, '..'), platforms: ['android'], introspect: true,
    })
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest)
    const settings = Object.fromEntries((application['meta-data'] ?? []).map((entry) => [
      entry.$['android:name'], entry.$['android:value'],
    ]))
    expect(settings['expo.modules.updates.ENABLED']).toBe('false')
    expect(settings['expo.modules.updates.EXPO_UPDATES_CHECK_ON_LAUNCH']).toBe('NEVER')
    expect(settings).not.toHaveProperty('expo.modules.updates.UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY')
  })

  it('keeps production configuration stable across staging resolution', () => {
    const production = JSON.stringify(createConfig())
    process.env.ORBIT_APP_VARIANT = 'staging'
    expect(createConfig().updates.enabled).toBe(false)
    expect(createConfig().updates.checkAutomatically).toBe('NEVER')
    process.env.ORBIT_APP_VARIANT = 'production'
    expect(JSON.stringify(createConfig())).toBe(production)
  })

  it('rejects an unknown variant', () => {
    process.env.ORBIT_APP_VARIANT = 'unknown'
    expect(() => createConfig()).toThrow('Unknown Orbit app variant')
  })

  it.each(['production', 'staging'])('configures the iOS %s identity, minimum OS and embedded updates', async (variant) => {
    process.env.ORBIT_APP_VARIANT = variant
    const config = createConfig()
    expect(config.ios.supportsTablet).toBe(true)
    expect(IOSConfig.Orientation.setOrientation(config as Parameters<typeof IOSConfig.Orientation.setOrientation>[0], {}).UISupportedInterfaceOrientations).toEqual([
      'UIInterfaceOrientationPortrait', 'UIInterfaceOrientationPortraitUpsideDown',
      'UIInterfaceOrientationLandscapeLeft', 'UIInterfaceOrientationLandscapeRight',
    ])
    const host = variant === 'staging' ? 'app-staging.useorbit.org' : 'app.useorbit.org'
    expect(config.ios.bundleIdentifier).toBe(variant === 'staging' ? 'org.useorbit.app.staging' : 'org.useorbit.app')
    expect(config.ios.deploymentTarget).toBe('17.4')
    expect(config.plugins).toContainEqual(['expo-build-properties', expect.objectContaining({ ios: { deploymentTarget: '17.4' } })])
    expect(config.ios.config.usesNonExemptEncryption).toBe(false)
    expect(config.updates.enabled).toBe(false)
    const configured = IOSConfig.Entitlements.withAssociatedDomains({ name: config.name, slug: config.slug, ios: config.ios })
    const generated = await compileModsAsync(configured, { projectRoot: process.cwd(), platforms: ['ios'], introspect: true })
    expect(generated.ios?.entitlements?.['com.apple.developer.associated-domains']).toEqual([`applinks:${host}`, `webcredentials:${host}`])
    expect(config.ios.privacyManifests.NSPrivacyTracking).toBe(false)
    expect(config.ios.privacyManifests.NSPrivacyAccessedAPITypes).toHaveLength(4)
  })

  it.each(['production', 'staging'])('uses only provisioned Apple identifiers for %s', (variant) => {
    process.env.ORBIT_APP_VARIANT = variant
    vi.stubEnv('ORBIT_APPLE_TEAM_ID', 'TESTTEAM01')
    vi.stubEnv('ORBIT_IOS_APP_STORE_ID', '1234567890')
    expect(createConfig().ios).toMatchObject({ appleTeamId: 'TESTTEAM01', appStoreUrl: 'https://apps.apple.com/app/id1234567890' })
  })

  it('does not invent a store listing before enrollment', () => {
    vi.stubEnv('ORBIT_APPLE_TEAM_ID', '')
    vi.stubEnv('ORBIT_IOS_APP_STORE_ID', '')
    expect(createConfig().ios).not.toHaveProperty('appleTeamId')
    expect(createConfig().ios).not.toHaveProperty('appStoreUrl')
  })

  it('rejects malformed App Store identifiers', () => {
    vi.stubEnv('ORBIT_IOS_APP_STORE_ID', 'unknown')
    expect(() => createConfig()).toThrow('Invalid iOS App Store id')
  })
})
