import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compileModsAsync } from '@expo/config-plugins'
import { expect, it } from 'vitest'
import withAndroidReleaseBuildFixes from '../../plugins/with-android-release-build-fixes'
import withReactNativeImperativeFocus from '../../plugins/with-react-native-imperative-focus'

const require = createRequire(import.meta.url)

it('applies the Android build and focus adapters to the installed SDK template', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'orbit-sdk-template-'))
  try {
    execFileSync('/usr/bin/tar', ['-xzf', require.resolve('expo/template.tgz'), '-C', directory, 'package/android'])
    const projectRoot = join(directory, 'package')
    const configured = withReactNativeImperativeFocus(withAndroidReleaseBuildFixes({ name: 'HelloWorld', slug: 'orbit', android: { package: 'com.helloworld' } }))
    await compileModsAsync(configured, { projectRoot, platforms: ['android'] })
    const application = readFileSync(join(projectRoot, 'android/app/src/main/java/com/helloworld/MainApplication.kt'), 'utf8')
    expect(application).toContain('ReactNativeFeatureFlags.dangerouslyForceOverride')
    expect(application.indexOf('loadReactNative(this)')).toBeLessThan(application.indexOf('ReactNativeFeatureFlags.dangerouslyForceOverride'))
    const properties = readFileSync(join(projectRoot, 'android/gradle.properties'), 'utf8')
    expect(properties).toContain('-Xmx6144m')
    expect(properties).toContain('-XX:MaxMetaspaceSize=2048m')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
