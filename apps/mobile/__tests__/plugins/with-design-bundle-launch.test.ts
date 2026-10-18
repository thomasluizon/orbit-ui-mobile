import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AndroidConfig, ExportedConfig, ExportedConfigWithProps } from '@expo/config-plugins'
import withDesignBundleLaunch from '../../plugins/with-design-bundle-launch'

const require = createRequire(import.meta.url)
const template = execFileSync('tar', [
  '-xOf', require.resolve('expo/template.tgz'),
  'package/android/app/src/main/java/com/helloworld/MainApplication.kt',
], { encoding: 'utf8' })

async function apply(contents: string): Promise<string> {
  const config = withDesignBundleLaunch({ name: 'Orbit', slug: 'orbit' }) as ExportedConfig
  const mod = config.mods?.android?.mainApplication
  if (!mod) throw new Error('Missing application mod')
  const request: ExportedConfigWithProps<AndroidConfig.Paths.ApplicationProjectFile> = {
    ...config,
    modResults: { path: 'MainApplication.kt', language: 'kt', contents },
    modRequest: { projectRoot: '.', platformProjectRoot: '.', modName: 'mainApplication', platform: 'android', introspect: false },
    modRawConfig: config,
  }
  return (await mod(request)).modResults.contents
}

describe('embedded design startup', () => {
  it('clears the verified persisted Expo override before constructing its startup procedure', () => {
    const native = readFileSync(resolve(import.meta.dirname, '../../modules/orbit-design-bundle/android/src/main/java/org/useorbit/app/bundle/OrbitDesignBundleModule.kt'), 'utf8')
    const expoRoot = resolve(require.resolve('expo-updates/package.json'), '..')
    const override = readFileSync(resolve(expoRoot, 'android/src/main/java/expo/modules/updates/UpdatesConfigurationOverride.kt'), 'utf8')
    expect(override).toContain('UPDATES_PREFS_FILE = "dev.expo.updates.prefs"')
    expect(override).toContain('UPDATES_PREFS_KEY_UPDATES_CONFIGURATION_OVERRIDE = "updatesConfigOverride"')
    expect(native).toContain('getSharedPreferences("dev.expo.updates.prefs", Context.MODE_PRIVATE)')
    expect(native).toContain('.remove("updatesConfigOverride")')
    expect(native.indexOf('.remove("updatesConfigOverride")')).toBeLessThan(native.indexOf('UpdatesController.initialize('))
  })

  it('prepares the embedded bundle before React Native loads in the installed Expo template', async () => {
    const contents = await apply(template)
    expect(contents.indexOf('prepareEmbeddedLaunch(this)')).toBeGreaterThan(contents.indexOf('super.onCreate()'))
    expect(contents.indexOf('prepareEmbeddedLaunch(this)')).toBeLessThan(contents.indexOf('loadReactNative(this)'))
    expect(contents).toContain('if (!BuildConfig.DEBUG)')
    expect(await apply(contents)).toBe(contents)
  })

  it('rejects a template with no supported startup anchor', async () => {
    await expect(apply(template.replace('super.onCreate()', 'super.onCreateChanged()'))).rejects.toThrow('creation anchor')
  })
})
