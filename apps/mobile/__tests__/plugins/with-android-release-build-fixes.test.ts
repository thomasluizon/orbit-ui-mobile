import {
  AndroidConfig,
  compileModsAsync,
  withAndroidManifest,
  type ExportedConfig,
  type ExportedConfigWithProps,
} from '@expo/config-plugins'
import { describe, expect, it } from 'vitest'

import withAndroidReleaseBuildFixes from '../../plugins/with-android-release-build-fixes'

type PropertiesItem = AndroidConfig.Properties.PropertiesItem
type ResourceXML = AndroidConfig.Resources.ResourceXML

const TEMPLATE_DEFAULT = '-Xmx2048m -XX:MaxMetaspaceSize=512m'
const CLOBBERED_VALUE = '-Xmx4g -XX:MaxMetaspaceSize=1024m -Dfile.encoding=UTF-8'

const ROOT_GRADLE_TEMPLATE = `buildscript {
  repositories {
    google()
    mavenCentral()
  }
  dependencies {
    classpath('com.android.tools.build:gradle')
    classpath('com.facebook.react:react-native-gradle-plugin')
    classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')
  }
}

allprojects {
  repositories {
    google()
    mavenCentral()
    maven { url 'https://www.jitpack.io' }
  }
}

apply plugin: "expo-root-project"
apply plugin: "com.facebook.react.rootproject"
`

async function resolveRootGradle(contents: string, language: 'groovy' | 'kt' = 'groovy'): Promise<string> {
  const config = withAndroidReleaseBuildFixes({ name: 'Orbit', slug: 'orbit' }) as ExportedConfig
  const gradleMod = config.mods?.android?.projectBuildGradle
  if (!gradleMod) throw new Error('plugin registered no projectBuildGradle mod')

  const modConfig: ExportedConfigWithProps<AndroidConfig.Paths.GradleProjectFile> = {
    ...config,
    modResults: { contents, language, path: 'android/build.gradle' },
    modRequest: {
      projectRoot: '.', platformProjectRoot: '.', modName: 'projectBuildGradle',
      platform: 'android', introspect: false,
    },
    modRawConfig: config,
  }
  return (await gradleMod(modConfig)).modResults.contents
}

describe('withAndroidReleaseBuildFixes shared Android NDK', () => {
  it('sets the app and every library NDK before Expo can evaluate native projects', async () => {
    const contents = await resolveRootGradle(ROOT_GRADLE_TEMPLATE)
    const ndkMarker = contents.indexOf('// orbit-android-shared-ndk-version')
    expect(ndkMarker).toBeGreaterThanOrEqual(0)
    expect(ndkMarker).toBeLessThan(contents.indexOf('apply plugin: "expo-root-project"'))
    expect(contents).toContain('["com.android.application", "com.android.library"].each')
    expect(contents).toContain('subproject.extensions.getByName("android").ndkVersion = rootProject.ext.ndkVersion')
    expect(contents).toContain('subproject.extensions.getByName("androidComponents").finalizeDsl')
    expect(contents).toContain('android.ndkVersion = rootProject.ext.ndkVersion')
  })

  it('preserves CMake staging and never duplicates the policy on repeated prebuilds', async () => {
    const previous = await resolveRootGradle(ROOT_GRADLE_TEMPLATE)
    const contents = await resolveRootGradle(previous)
    expect(contents).toBe(previous)
    expect(contents.match(/\/\/ orbit-android-shared-ndk-version/g)).toHaveLength(1)
    expect(contents.match(/\/\/ orbit-android-library-cmake-staging-dir/g)).toHaveLength(1)
    expect(contents).toContain('buildStagingDirectory = file(')
  })

  it('updates a root that already has the CMake staging policy', async () => {
    const current = await resolveRootGradle(ROOT_GRADLE_TEMPLATE)
    const previous = current.replace(/\/\/ orbit-android-shared-ndk-version[\s\S]*?\n}\n\n/, '')
    expect(previous).not.toContain('orbit-android-shared-ndk-version')
    const updated = await resolveRootGradle(previous)
    expect(updated).toContain('android.ndkVersion = rootProject.ext.ndkVersion')
    expect(updated.match(/\/\/ orbit-android-library-cmake-staging-dir/g)).toHaveLength(1)
    expect(updated.indexOf('// orbit-android-shared-ndk-version')).toBeLessThan(
      updated.indexOf('apply plugin: "expo-root-project"'),
    )
    expect(await resolveRootGradle(updated)).toBe(updated)
  })

  it('stops prebuild if the root cannot register the policy before Expo evaluates projects', async () => {
    await expect(resolveRootGradle('allprojects {}')).rejects.toThrow(
      'Cannot register the shared Android NDK policy before expo-root-project.',
    )
    await expect(resolveRootGradle(ROOT_GRADLE_TEMPLATE, 'kt')).rejects.toThrow(
      'The shared Android NDK policy requires a Groovy root build.gradle.',
    )
  })
})

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


describe('Android fold and rotation configuration', () => {
  it('keeps the running activity resizable across window changes', async () => {
    const configured = withAndroidReleaseBuildFixes({ name: 'Orbit', slug: 'orbit' }) as ExportedConfig
    let manifest!: AndroidConfig.Manifest.AndroidManifest
    const observed = withAndroidManifest(configured, (mod) => {
      manifest = mod.modResults
      return mod
    })
    await compileModsAsync(observed, { projectRoot: process.cwd(), platforms: ['android'], introspect: true })
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(manifest)
    expect(activity.$['android:resizeableActivity']).toBe('true')
    expect(activity.$['android:configChanges']?.split('|')).toEqual(expect.arrayContaining([
      'screenSize', 'smallestScreenSize', 'screenLayout', 'orientation',
    ]))
    expect(activity.$['android:screenOrientation']).toBeUndefined()
  })
})
