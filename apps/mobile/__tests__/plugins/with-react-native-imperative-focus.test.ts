import {
  AndroidConfig,
  type ExportedConfig,
  type ExportedConfigWithProps,
} from '@expo/config-plugins'
import { describe, expect, it } from 'vitest'

import withReactNativeImperativeFocus from '../../plugins/with-react-native-imperative-focus'

type ApplicationProjectFile = AndroidConfig.Paths.ApplicationProjectFile

const MAIN_APPLICATION_TEMPLATE = `package org.useorbit.app

import android.app.Application
import android.content.res.Configuration

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint
import com.facebook.react.internal.featureflags.ReactNativeFeatureFlags
import com.facebook.react.internal.featureflags.ReactNativeFeatureFlagsDefaults

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ExpoReactHostFactory

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    ExpoReactHostFactory.getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        }
    )
  }

  override fun onCreate() {
    ReactNativeFeatureFlags.override(object : ReactNativeFeatureFlagsDefaults() {
      override fun enableKeyEvents(): Boolean = true
      override fun enableImperativeFocus(): Boolean = true
    })
    super.onCreate()
    DefaultNewArchitectureEntryPoint.releaseLevel = try {
      ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
    } catch (e: IllegalArgumentException) {
      ReleaseLevel.STABLE
    }
    loadReactNative(this)
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
`

/**
 * What `npx expo prebuild` writes before any plugin runs. Root `.gitignore:86` ignores
 * `apps/mobile/android/`, so every CI and EAS build starts from exactly this.
 */
const PRISTINE_MAIN_APPLICATION_TEMPLATE = MAIN_APPLICATION_TEMPLATE.replace(
  `import com.facebook.react.internal.featureflags.ReactNativeFeatureFlags
import com.facebook.react.internal.featureflags.ReactNativeFeatureFlagsDefaults
`,
  '',
).replace(
  `    ReactNativeFeatureFlags.override(object : ReactNativeFeatureFlagsDefaults() {
      override fun enableKeyEvents(): Boolean = true
      override fun enableImperativeFocus(): Boolean = true
    })
`,
  '',
)

/** A template that never imports ReleaseLevel, so nothing but the plugin can supply it. */
const TEMPLATE_WITHOUT_RELEASE_LEVEL = PRISTINE_MAIN_APPLICATION_TEMPLATE.replace(
  'import com.facebook.react.common.ReleaseLevel\n',
  '',
).replace(
  `    DefaultNewArchitectureEntryPoint.releaseLevel = try {
      ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
    } catch (e: IllegalArgumentException) {
      ReleaseLevel.STABLE
    }
`,
  '',
)

/** An `android/` tree an older revision of this plugin patched with a block this one cannot match. */
const STALE_MAIN_APPLICATION_TEMPLATE = PRISTINE_MAIN_APPLICATION_TEMPLATE.replace(
  'import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint\n',
  `import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint
import com.facebook.react.internal.featureflags.ReactNativeFeatureFlags
import com.facebook.react.internal.featureflags.ReactNativeFeatureFlagsDefaults
`,
).replace(
  '    super.onCreate()\n',
  `    super.onCreate()
    ReactNativeFeatureFlags.override(object : ReactNativeFeatureFlagsDefaults() {
      override fun enableKeyEvents(): Boolean = true
    })
`,
)

async function resolveMainApplication(contents: string): Promise<string> {
  const config = withReactNativeImperativeFocus({ name: 'Orbit', slug: 'orbit' }) as ExportedConfig
  const mainApplicationMod = config.mods?.android?.mainApplication

  if (!mainApplicationMod) {
    throw new Error('plugin registered no mainApplication mod')
  }

  const modResults: ApplicationProjectFile = {
    contents,
    language: 'kt',
    path: 'android/app/src/main/java/org/useorbit/app/MainApplication.kt',
  }
  const modConfig: ExportedConfigWithProps<ApplicationProjectFile> = {
    ...config,
    modResults,
    modRequest: {
      projectRoot: '.',
      platformProjectRoot: 'android',
      modName: 'mainApplication',
      platform: 'android',
      introspect: false,
    },
    modRawConfig: config,
  }

  const result = await mainApplicationMod(modConfig)
  return result.modResults.contents
}

function importLineCount(contents: string, importLine: string): number {
  return contents.split('\n').filter((line) => line.trim() === importLine).length
}

describe('withReactNativeImperativeFocus', () => {
  it('preserves the release provider and enables only imperative focus after React Native initializes', async () => {
    const mainApplication = await resolveMainApplication(MAIN_APPLICATION_TEMPLATE)
    const loadReactNativeIndex = mainApplication.indexOf('loadReactNative(this)')
    const overrideIndex = mainApplication.indexOf('ReactNativeFeatureFlags.dangerouslyForceOverride')
    const lifecycleDispatcherIndex = mainApplication.indexOf(
      'ApplicationLifecycleDispatcher.onApplicationCreate(this)',
    )

    expect(mainApplication.match(/ReactNativeFeatureFlags\.override\(/g) ?? []).toHaveLength(0)
    expect(mainApplication).toContain('DefaultNewArchitectureEntryPoint.releaseLevel')
    expect(mainApplication).toContain('ReleaseLevel.EXPERIMENTAL ->')
    expect(mainApplication).toContain('ReleaseLevel.CANARY ->')
    expect(mainApplication).toContain('ReleaseLevel.STABLE ->')
    expect(mainApplication).toContain('override fun enableImperativeFocus(): Boolean = true')
    expect(mainApplication).not.toContain('override fun enableKeyEvents(): Boolean = true')
    expect(overrideIndex).toBeGreaterThan(loadReactNativeIndex)
    expect(overrideIndex).toBeLessThan(lifecycleDispatcherIndex)
  })

  it('patches the pristine template a release build actually starts from', async () => {
    expect(PRISTINE_MAIN_APPLICATION_TEMPLATE).not.toContain('ReactNativeFeatureFlags')

    const mainApplication = await resolveMainApplication(PRISTINE_MAIN_APPLICATION_TEMPLATE)
    const loadReactNativeIndex = mainApplication.indexOf('loadReactNative(this)')
    const overrideIndex = mainApplication.indexOf('ReactNativeFeatureFlags.dangerouslyForceOverride')
    const lifecycleDispatcherIndex = mainApplication.indexOf(
      'ApplicationLifecycleDispatcher.onApplicationCreate(this)',
    )

    expect(mainApplication).toContain(
      'import com.facebook.react.internal.featureflags.ReactNativeFeatureFlagsProvider',
    )
    expect(mainApplication).toContain(
      'import com.facebook.react.internal.featureflags.ReactNativeFeatureFlagsOverrides_RNOSS_Canary_Android',
    )
    expect(mainApplication).toContain(
      'import com.facebook.react.internal.featureflags.ReactNativeFeatureFlagsOverrides_RNOSS_Experimental_Android',
    )
    expect(mainApplication).toContain(
      'import com.facebook.react.internal.featureflags.ReactNativeFeatureFlagsOverrides_RNOSS_Stable_Android',
    )
    expect(
      importLineCount(
        mainApplication,
        'import com.facebook.react.internal.featureflags.ReactNativeFeatureFlags',
      ),
    ).toBe(1)
    expect(mainApplication).toContain('DefaultNewArchitectureEntryPoint.releaseLevel')
    expect(mainApplication).toContain('ReleaseLevel.EXPERIMENTAL ->')
    expect(mainApplication).toContain('ReleaseLevel.CANARY ->')
    expect(mainApplication).toContain('ReleaseLevel.STABLE ->')
    expect(mainApplication).toContain('override fun enableImperativeFocus(): Boolean = true')
    expect(mainApplication).not.toContain('override fun enableKeyEvents(): Boolean = true')
    expect(overrideIndex).toBeGreaterThan(loadReactNativeIndex)
    expect(overrideIndex).toBeLessThan(lifecycleDispatcherIndex)
  })

  it('supplies the ReleaseLevel import its own when branch needs, rather than borrowing the template one', async () => {
    expect(TEMPLATE_WITHOUT_RELEASE_LEVEL).not.toContain('ReleaseLevel')

    const mainApplication = await resolveMainApplication(TEMPLATE_WITHOUT_RELEASE_LEVEL)

    expect(mainApplication).toContain('ReleaseLevel.STABLE ->')
    expect(importLineCount(mainApplication, 'import com.facebook.react.common.ReleaseLevel')).toBe(1)
  })

  it('never duplicates an import the template already carries', async () => {
    const mainApplication = await resolveMainApplication(PRISTINE_MAIN_APPLICATION_TEMPLATE)

    expect(importLineCount(mainApplication, 'import com.facebook.react.common.ReleaseLevel')).toBe(1)
  })

  it('refuses a template whose load anchor no longer matches, rather than skipping the override', async () => {
    const reindentedAnchor = PRISTINE_MAIN_APPLICATION_TEMPLATE.replace(
      '    loadReactNative(this)',
      '  loadReactNative(this)',
    )

    await expect(resolveMainApplication(reindentedAnchor)).rejects.toThrow(
      'MainApplication.kt is missing the React Native load anchor',
    )
  })

  it('logs the flags React Native read before the override instead of discarding them', async () => {
    const mainApplication = await resolveMainApplication(PRISTINE_MAIN_APPLICATION_TEMPLATE)

    expect(mainApplication).toContain(
      'val featureFlagsReadBeforeOverride =\n      ReactNativeFeatureFlags.dangerouslyForceOverride(',
    )
    expect(mainApplication).toContain('if (featureFlagsReadBeforeOverride != null) {')
    expect(mainApplication).toContain('android.util.Log.w(')
  })

  it('keeps the legacy import while a block an older revision wrote still constructs it', async () => {
    expect(STALE_MAIN_APPLICATION_TEMPLATE).toContain('ReactNativeFeatureFlagsDefaults()')

    const mainApplication = await resolveMainApplication(STALE_MAIN_APPLICATION_TEMPLATE)

    expect(mainApplication).toContain('ReactNativeFeatureFlagsDefaults()')
    expect(mainApplication).toContain(
      'import com.facebook.react.internal.featureflags.ReactNativeFeatureFlagsDefaults',
    )
  })
})
