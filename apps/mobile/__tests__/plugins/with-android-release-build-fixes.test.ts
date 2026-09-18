import {
  AndroidConfig,
  type ExportedConfig,
  type ExportedConfigWithProps,
} from '@expo/config-plugins'
import { describe, expect, it } from 'vitest'

import withAndroidReleaseBuildFixes from '../../plugins/with-android-release-build-fixes'

type PropertiesItem = AndroidConfig.Properties.PropertiesItem
type ResourceXML = AndroidConfig.Resources.ResourceXML
type ApplicationProjectFile = AndroidConfig.Paths.ApplicationProjectFile

const TEMPLATE_DEFAULT = '-Xmx2048m -XX:MaxMetaspaceSize=512m'
const CLOBBERED_VALUE = '-Xmx4g -XX:MaxMetaspaceSize=1024m -Dfile.encoding=UTF-8'
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

async function resolveJvmArgs(startingValue: string | null): Promise<string> {
  const config = withAndroidReleaseBuildFixes({ name: 'Orbit', slug: 'orbit' }) as ExportedConfig
  const gradlePropertiesMod = config.mods?.android?.gradleProperties

  if (!gradlePropertiesMod) {
    throw new Error('plugin registered no gradleProperties mod')
  }

  const modResults: PropertiesItem[] =
    startingValue === null
      ? []
      : [{ type: 'property', key: 'org.gradle.jvmargs', value: startingValue }]

  const modConfig: ExportedConfigWithProps<PropertiesItem[]> = {
    ...config,
    modResults,
    modRequest: {
      projectRoot: '.',
      platformProjectRoot: '.',
      modName: 'gradleProperties',
      platform: 'android',
      introspect: false,
    },
    modRawConfig: config,
  }

  const result = await gradlePropertiesMod(modConfig)

  const jvmArgs = result.modResults.find(
    (property): property is Extract<PropertiesItem, { type: 'property' }> =>
      property.type === 'property' && property.key === 'org.gradle.jvmargs',
  )

  return jvmArgs?.value ?? ''
}

async function resolveMainApplication(contents: string): Promise<string> {
  const config = withAndroidReleaseBuildFixes({ name: 'Orbit', slug: 'orbit' }) as ExportedConfig
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

describe('withAndroidReleaseBuildFixes gradle.properties memory', () => {
  it('raises the template heap and metaspace to the values R8 and the KSP worker need', async () => {
    const value = await resolveJvmArgs(TEMPLATE_DEFAULT)

    expect(value).toContain('-Xmx6144m')
    expect(value).toContain('-XX:MaxMetaspaceSize=2048m')
  })

  it('carries the encoding and heap-dump flags so nothing has to re-add them after prebuild', async () => {
    const value = await resolveJvmArgs(TEMPLATE_DEFAULT)

    expect(value).toContain('-Dfile.encoding=UTF-8')
    expect(value).toContain('-XX:+HeapDumpOnOutOfMemoryError')
  })

  it('writes the property when the template omits it entirely', async () => {
    const value = await resolveJvmArgs(null)

    expect(value).toContain('-Xmx6144m')
    expect(value).toContain('-XX:MaxMetaspaceSize=2048m')
  })

  it('restores the heap when something already lowered it', async () => {
    const value = await resolveJvmArgs(CLOBBERED_VALUE)

    expect(value).toContain('-Xmx6144m')
    expect(value).toContain('-XX:MaxMetaspaceSize=2048m')
    expect(value).not.toContain('-Xmx4g')
    expect(value).not.toContain('MaxMetaspaceSize=1024m')
  })

  it('is idempotent and never duplicates a flag', async () => {
    const once = await resolveJvmArgs(TEMPLATE_DEFAULT)
    const twice = await resolveJvmArgs(once)

    expect(twice).toBe(once)
    expect(twice.match(/-Xmx/g)).toHaveLength(1)
    expect(twice.match(/-XX:MaxMetaspaceSize=/g)).toHaveLength(1)
    expect(twice.match(/-Dfile\.encoding=/g)).toHaveLength(1)
  })
})

describe('withAndroidReleaseBuildFixes system bars', () => {
  it('removes the deprecated transparent system bar colors after the Expo system-bars plugin adds them', async () => {
    const config = AndroidConfig.SystemBars.withSystemBars(
      withAndroidReleaseBuildFixes({ name: 'Orbit', slug: 'orbit' }),
    ) as ExportedConfig
    const stylesMod = config.mods?.android?.styles

    if (!stylesMod) {
      throw new Error('plugin registered no Android styles mod')
    }

    const modResults: ResourceXML = {
      resources: {
        style: [
          {
            $: { name: 'AppTheme', parent: 'Theme.AppCompat.DayNight.NoActionBar' },
            item: [],
          },
        ],
      },
    }
    const modConfig: ExportedConfigWithProps<ResourceXML> = {
      ...config,
      modResults,
      modRequest: {
        projectRoot: '.',
        platformProjectRoot: '.',
        modName: 'styles',
        platform: 'android',
        introspect: false,
      },
      modRawConfig: config,
    }

    const result = await stylesMod(modConfig)
    const appTheme = AndroidConfig.Styles.getStylesGroupAsObject(
      result.modResults,
      AndroidConfig.Styles.getAppThemeGroup(),
    )

    expect(appTheme).not.toHaveProperty('android:statusBarColor')
    expect(appTheme).not.toHaveProperty('android:navigationBarColor')
  })
})

describe('withAndroidReleaseBuildFixes React Native imperative focus', () => {
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
      mainApplication
        .split('\n')
        .filter(
          (line) =>
            line.trim() === 'import com.facebook.react.internal.featureflags.ReactNativeFeatureFlags',
        ),
    ).toHaveLength(1)
    expect(mainApplication).toContain('DefaultNewArchitectureEntryPoint.releaseLevel')
    expect(mainApplication).toContain('ReleaseLevel.EXPERIMENTAL ->')
    expect(mainApplication).toContain('ReleaseLevel.CANARY ->')
    expect(mainApplication).toContain('ReleaseLevel.STABLE ->')
    expect(mainApplication).toContain('override fun enableImperativeFocus(): Boolean = true')
    expect(mainApplication).not.toContain('override fun enableKeyEvents(): Boolean = true')
    expect(overrideIndex).toBeGreaterThan(loadReactNativeIndex)
    expect(overrideIndex).toBeLessThan(lifecycleDispatcherIndex)
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
