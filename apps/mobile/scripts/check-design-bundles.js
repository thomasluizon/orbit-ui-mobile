const { existsSync, readFileSync, readdirSync } = require('node:fs')
const { resolve, join } = require('node:path')

function read(root, path) {
  return readFileSync(resolve(root, path), 'utf8')
}

function requireEqualFile(legacyRoot, redesignRoot, path) {
  if (!existsSync(resolve(redesignRoot, path)) || read(legacyRoot, path) !== read(redesignRoot, path)) {
    throw new Error(`The redesign must carry the native union file: ${path}`)
  }
}

function compareDirectory(legacyRoot, redesignRoot, directory) {
  for (const entry of readdirSync(resolve(legacyRoot, directory), { withFileTypes: true })) {
    if (['build', '.gradle', 'node_modules'].includes(entry.name)) continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) compareDirectory(legacyRoot, redesignRoot, path)
    else requireEqualFile(legacyRoot, redesignRoot, path)
  }
}

function compareNativeVersions(legacyRoot, redesignRoot) {
  for (const root of [legacyRoot, redesignRoot]) {
    if (!existsSync(resolve(root, 'node_modules/expo/package.json'))) {
      throw new Error('Install both locked dependency trees before checking native compatibility')
    }
  }
  const legacy = JSON.parse(read(legacyRoot, 'package-lock.json')).packages
  const redesign = JSON.parse(read(redesignRoot, 'package-lock.json')).packages
  for (const [path, dependency] of Object.entries(redesign)) {
    if (!path.includes('node_modules/')) continue
    const native = ['expo-module.config.json', 'android/build.gradle', 'android/build.gradle.kts', 'ReactAndroid/build.gradle.kts']
      .some(marker => existsSync(resolve(redesignRoot, path, marker)))
    if (!native && !path.endsWith('/hermes-compiler')) continue
    if (legacy[path]?.version !== dependency.version) {
      throw new Error(`Native version mismatch for ${path}: legacy=${legacy[path]?.version ?? 'missing'}, redesign=${dependency.version}`)
    }
  }
}

function checkDesignBundles(legacyRoot, redesignRoot) {
  compareNativeVersions(legacyRoot, redesignRoot)
  for (const directory of ['orbit-app-update', 'orbit-design-bundle']) {
    compareDirectory(legacyRoot, redesignRoot, `apps/mobile/modules/${directory}`)
  }
  for (const path of [
    'apps/mobile/modules/orbit-widget/android/build.gradle',
    'apps/mobile/modules/orbit-widget/android/src/main/java/org/useorbit/app/widget/OrbitWidgetModule.kt',
    'apps/mobile/modules/orbit-widget/src/OrbitWidget.types.ts',
    'apps/mobile/plugins/with-android-release-build-fixes.js',
    'apps/mobile/plugins/with-react-native-imperative-focus.js',
    'apps/mobile/plugins/with-design-bundle-launch.js',
    'apps/mobile/lib/design-bundle.ts',
    'apps/mobile/lib/design-flag-refresh.ts',
  ]) requireEqualFile(legacyRoot, redesignRoot, path)

  for (const [root, design] of [[legacyRoot, 'legacy'], [redesignRoot, 'redesign']]) {
    if (!read(root, 'apps/mobile/lib/design-bundle-identity.ts').includes(`= '${design}'`)) {
      throw new Error(`The ${design} source must declare its own bundle identity`)
    }
    const providers = read(root, 'apps/mobile/lib/providers.tsx')
    for (const call of ['launchAccountDesign(', 'subscribeToDesignFlag()', 'refreshDesignFlag()']) {
      if (!providers.includes(call)) throw new Error(`The ${design} provider must call ${call}`)
    }
  }

  const legacyConfig = require(resolve(legacyRoot, 'apps/mobile/app.config.js'))()
  const redesignConfig = require(resolve(redesignRoot, 'apps/mobile/app.config.js'))()
  if (typeof legacyConfig.runtimeVersion !== 'string' || legacyConfig.runtimeVersion !== redesignConfig.runtimeVersion) {
    throw new Error('Both designs must use the same fixed runtimeVersion')
  }
  if (!redesignConfig.updates.enabled || legacyConfig.updates.url !== redesignConfig.updates.url) {
    throw new Error('Both designs must enable the same update server')
  }
}

module.exports = { checkDesignBundles }

if (require.main === module) {
  if (process.argv.length !== 4) {
    process.stderr.write('Usage: node check-design-bundles.js <legacy-root> <redesign-root>\n')
    process.exitCode = 2
  } else {
    try {
      checkDesignBundles(resolve(process.argv[2]), resolve(process.argv[3]))
      process.stdout.write('Both bundles match the Android native union.\n')
    } catch (error) {
      process.stderr.write(`${error.message}\n`)
      process.exitCode = 1
    }
  }
}
