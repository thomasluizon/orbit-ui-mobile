const {
  withAppBuildGradle,
  withProjectBuildGradle,
  withGradleProperties,
} = require('@expo/config-plugins')

const RELEASE_BUILD_HEAP_SIZE = '6144m'
const RELEASE_BUILD_METASPACE_SIZE = '2048m'
const ENCODING_FLAG = '-Dfile.encoding=UTF-8'
const HEAP_DUMP_FLAG = '-XX:+HeapDumpOnOutOfMemoryError'

const STAGING_DIR_MARKER = 'orbit.cmakeBuildStagingDirectory'

const APP_STAGING_SNIPPET = `android {
    if (project.hasProperty("${STAGING_DIR_MARKER}")) {
        externalNativeBuild {
            cmake {
                buildStagingDirectory = file(project.property("${STAGING_DIR_MARKER}"))
            }
        }
    }
`

const ROOT_STAGING_MARKER = 'orbit-android-library-cmake-staging-dir'
const ROOT_STAGING_SNIPPET = `// ${ROOT_STAGING_MARKER}
subprojects { subproject ->
    if (rootProject.hasProperty("${STAGING_DIR_MARKER}")) {
        subproject.plugins.withId("com.android.library") {
            android {
                externalNativeBuild {
                    cmake {
                        buildStagingDirectory = file("\${rootProject.property('${STAGING_DIR_MARKER}')}/\${subproject.name}")
                    }
                }
            }
        }
    }
}

`

const ADS_VERSION_PIN_MARKER = 'orbit-play-services-ads-version-pin'
const PINNED_PLAY_SERVICES_ADS_VERSION = '25.2.0'
const ADS_VERSION_PIN_SNIPPET = `// ${ADS_VERSION_PIN_MARKER}
allprojects {
    configurations.all {
        resolutionStrategy.eachDependency { details ->
            if (details.requested.group == 'com.google.android.gms'
                    && details.requested.name.startsWith('play-services-ads')
                    && details.requested.name != 'play-services-ads-identifier') {
                details.useVersion '${PINNED_PLAY_SERVICES_ADS_VERSION}'
                details.because 'play-services-ads 25.3.0+ ships Kotlin 2.3 metadata the Expo SDK 57 (Kotlin 2.1.20) toolchain cannot read; 25.2.0 is the last release before that bump and still has the AgeRestrictedTreatment API react-native-google-mobile-ads 16.3.3 needs'
            }
        }
    }
}

`

function withAndroidReleaseBuildFixes(config) {
  let nextConfig = withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') {
      return mod
    }

    if (!mod.modResults.contents.includes(STAGING_DIR_MARKER)) {
      mod.modResults.contents = mod.modResults.contents.replace(/android\s*\{/, APP_STAGING_SNIPPET)
    }

    return mod
  })

  nextConfig = withProjectBuildGradle(nextConfig, (mod) => {
    if (mod.modResults.language !== 'groovy') {
      return mod
    }

    if (mod.modResults.contents.includes(ROOT_STAGING_MARKER)) {
      return mod
    }

    const injectionPattern = /(^|\n)(apply plugin:\s*["']expo-root-project["'])/
    if (injectionPattern.test(mod.modResults.contents)) {
      mod.modResults.contents = mod.modResults.contents.replace(
        injectionPattern,
        `$1${ROOT_STAGING_SNIPPET}$2`,
      )
    } else {
      mod.modResults.contents = mod.modResults.contents.trimEnd() + '\n\n' + ROOT_STAGING_SNIPPET
    }

    return mod
  })

  nextConfig = withProjectBuildGradle(nextConfig, (mod) => {
    if (mod.modResults.language !== 'groovy') {
      return mod
    }

    if (mod.modResults.contents.includes(ADS_VERSION_PIN_MARKER)) {
      return mod
    }

    mod.modResults.contents = mod.modResults.contents.trimEnd() + '\n\n' + ADS_VERSION_PIN_SNIPPET

    return mod
  })

  nextConfig = withRaisedReleaseBuildJvmMemory(nextConfig)

  return nextConfig
}

function forceJvmFlag(value, pattern, flag) {
  return pattern.test(value)
    ? value.replace(pattern, flag)
    : `${value} ${flag}`.trim()
}

// The template's default org.gradle.jvmargs is too small for the SDK 57 release
// build: R8 minification of the Hermes bundle exhausts the default heap, and the
// expo-updates KSP AA worker exhausts the default metaspace
// (https://github.com/google/ksp/issues/1922). Force the flags authoritatively.
//
// This plugin is the only writer of org.gradle.jvmargs. configure-android-release-signing.js
// used to upsert the whole property after prebuild, which silently overwrote the
// heap and metaspace set here back down to -Xmx4g/1024m for every CI release, so
// the encoding and heap-dump flags it contributed live here now instead.
function withRaisedReleaseBuildJvmMemory(config) {
  return withGradleProperties(config, (mod) => {
    const heapFlag = `-Xmx${RELEASE_BUILD_HEAP_SIZE}`
    const metaspaceFlag = `-XX:MaxMetaspaceSize=${RELEASE_BUILD_METASPACE_SIZE}`
    const jvmArgs = mod.modResults.find(
      (item) => item.type === 'property' && item.key === 'org.gradle.jvmargs',
    )

    if (!jvmArgs) {
      mod.modResults.push({
        type: 'property',
        key: 'org.gradle.jvmargs',
        value: `${heapFlag} ${metaspaceFlag} ${ENCODING_FLAG} ${HEAP_DUMP_FLAG}`,
      })
      return mod
    }

    let value = forceJvmFlag(jvmArgs.value, /-Xmx\S+/, heapFlag)
    value = forceJvmFlag(value, /-XX:MaxMetaspaceSize=\S+/, metaspaceFlag)
    value = forceJvmFlag(value, /-Dfile\.encoding=\S+/, ENCODING_FLAG)
    value = forceJvmFlag(value, /-XX:\+HeapDumpOnOutOfMemoryError/, HEAP_DUMP_FLAG)
    jvmArgs.value = value

    return mod
  })
}

module.exports = withAndroidReleaseBuildFixes
