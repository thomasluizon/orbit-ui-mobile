const {
  withAppBuildGradle,
  withAndroidStyles,
  withProjectBuildGradle,
  withGradleProperties,
  AndroidConfig,
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

  nextConfig = withRaisedReleaseBuildJvmMemory(nextConfig)
  nextConfig = withAndroidStyles(nextConfig, (mod) => {
    const appTheme = AndroidConfig.Styles.getAppThemeGroup()
    mod.modResults = AndroidConfig.Styles.removeStylesItem({
      name: 'android:statusBarColor',
      xml: mod.modResults,
      parent: appTheme,
    })
    mod.modResults = AndroidConfig.Styles.removeStylesItem({
      name: 'android:navigationBarColor',
      xml: mod.modResults,
      parent: appTheme,
    })
    return mod
  })

  return nextConfig
}

function forceJvmFlag(value, pattern, flag) {
  return pattern.test(value)
    ? value.replace(pattern, flag)
    : `${value} ${flag}`.trim()
}

// R8 and expo-updates KSP need larger heap and metaspace for SDK 57 release builds.
// Keep this plugin the sole writer of org.gradle.jvmargs so later setup preserves the flags.
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
