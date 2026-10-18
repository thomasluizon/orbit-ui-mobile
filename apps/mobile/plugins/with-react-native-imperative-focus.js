const { withMainApplication } = require('@expo/config-plugins')

const FEATURE_FLAGS_IMPORT_ANCHOR =
  'import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint'
const LEGACY_FEATURE_FLAGS_DEFAULTS_CLASS = 'ReactNativeFeatureFlagsDefaults'
const LEGACY_FEATURE_FLAGS_DEFAULTS_IMPORT =
  `import com.facebook.react.internal.featureflags.${LEGACY_FEATURE_FLAGS_DEFAULTS_CLASS}`
const FEATURE_FLAGS_IMPORTS = [
  'import com.facebook.react.common.ReleaseLevel',
  'import com.facebook.react.internal.featureflags.ReactNativeFeatureFlags',
  'import com.facebook.react.internal.featureflags.ReactNativeFeatureFlagsOverrides_RNOSS_Canary_Android',
  'import com.facebook.react.internal.featureflags.ReactNativeFeatureFlagsOverrides_RNOSS_Experimental_Android',
  'import com.facebook.react.internal.featureflags.ReactNativeFeatureFlagsOverrides_RNOSS_Stable_Android',
  'import com.facebook.react.internal.featureflags.ReactNativeFeatureFlagsProvider',
]
const LEGACY_FEATURE_FLAGS_OVERRIDE = `    ReactNativeFeatureFlags.override(object : ReactNativeFeatureFlagsDefaults() {
      override fun enableKeyEvents(): Boolean = true
      override fun enableImperativeFocus(): Boolean = true
    })
`
const FEATURE_FLAGS_OVERRIDE = `    val reactNativeFeatureFlagsProvider: ReactNativeFeatureFlagsProvider =
      when (DefaultNewArchitectureEntryPoint.releaseLevel) {
        ReleaseLevel.EXPERIMENTAL ->
          ReactNativeFeatureFlagsOverrides_RNOSS_Experimental_Android()
        ReleaseLevel.CANARY -> ReactNativeFeatureFlagsOverrides_RNOSS_Canary_Android()
        ReleaseLevel.STABLE -> ReactNativeFeatureFlagsOverrides_RNOSS_Stable_Android()
      }
    val featureFlagsReadBeforeOverride =
      ReactNativeFeatureFlags.dangerouslyForceOverride(
        object : ReactNativeFeatureFlagsProvider by reactNativeFeatureFlagsProvider {
          override fun enableImperativeFocus(): Boolean = true
        }
      )
    if (featureFlagsReadBeforeOverride != null) {
      android.util.Log.w(
        "OrbitFeatureFlags",
        "React Native read feature flags before the override: \$featureFlagsReadBeforeOverride"
      )
    }
`

// Kotlin puts one import on a line, so an exact line match stops the longer
// ReactNativeFeatureFlagsProvider from standing in for the shorter ReactNativeFeatureFlags.
function hasImportLine(contents, importLine) {
  return contents.split('\n').some((line) => line.trim() === importLine)
}

// enableImperativeFocus() is off in every release level React Native ships, so a
// View.focus() call reaches no native view without this override. The override runs
// after loadReactNative(this) because that call already overrode the flags once, and
// a second ReactNativeFeatureFlags.override throws. This applies to debug and release
// alike, so it lives outside the release-build plugin.
function withReactNativeImperativeFocus(config) {
  return withMainApplication(config, (mod) => {
    if (mod.modResults.language !== 'kt') return mod

    if (!mod.modResults.contents.includes(FEATURE_FLAGS_IMPORT_ANCHOR)) {
      throw new Error('MainApplication.kt is missing the React Native import anchor')
    }

    mod.modResults.contents = mod.modResults.contents.replace(LEGACY_FEATURE_FLAGS_OVERRIDE, '')
    // The import goes only once nothing constructs the class, so an android/ tree that an older
    // revision patched with a different block keeps the import that block still needs.
    if (!mod.modResults.contents.includes(`${LEGACY_FEATURE_FLAGS_DEFAULTS_CLASS}()`)) {
      mod.modResults.contents = mod.modResults.contents.replace(
        `${LEGACY_FEATURE_FLAGS_DEFAULTS_IMPORT}\n`,
        '',
      )
    }

    const missingImports = FEATURE_FLAGS_IMPORTS.filter(
      (featureFlagsImport) => !hasImportLine(mod.modResults.contents, featureFlagsImport),
    )
    if (missingImports.length > 0) {
      mod.modResults.contents = mod.modResults.contents.replace(
        FEATURE_FLAGS_IMPORT_ANCHOR,
        `${FEATURE_FLAGS_IMPORT_ANCHOR}\n${missingImports.join('\n')}`,
      )
    }

    if (!mod.modResults.contents.includes('ReactNativeFeatureFlags.dangerouslyForceOverride')) {
      const loadReactNativeAnchor = '    loadReactNative(this)'
      if (!mod.modResults.contents.includes(loadReactNativeAnchor)) {
        throw new Error('MainApplication.kt is missing the React Native load anchor')
      }
      mod.modResults.contents = mod.modResults.contents.replace(
        loadReactNativeAnchor,
        `${loadReactNativeAnchor}\n${FEATURE_FLAGS_OVERRIDE}`,
      )
    }

    return mod
  })
}

module.exports = withReactNativeImperativeFocus
