const { existsSync, readFileSync, readdirSync } = require('node:fs')
const { resolve, join } = require('node:path')

function read(root, path) {
  return readFileSync(resolve(root, path), 'utf8')
}

function requireEqualFile(legacyRoot, redesignRoot, path) {
  if (!existsSync(resolve(legacyRoot, path)) || !existsSync(resolve(redesignRoot, path)) ||
    !readFileSync(resolve(legacyRoot, path)).equals(readFileSync(resolve(redesignRoot, path)))) {
    throw new Error(`The redesign must carry the native union file: ${path}`)
  }
}

function compareDirectory(legacyRoot, redesignRoot, directory) {
  const entries = new Map()
  for (const root of [legacyRoot, redesignRoot]) {
    if (!existsSync(resolve(root, directory))) continue
    for (const entry of readdirSync(resolve(root, directory), { withFileTypes: true })) entries.set(entry.name, entry)
  }
  for (const [name, entry] of entries) {
    if (['build', '.gradle', 'node_modules'].includes(name)) continue
    const path = join(directory, name)
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
  const locks = [legacyRoot, redesignRoot].map(root => JSON.parse(read(root, 'package-lock.json')).packages)
  for (const path of new Set(locks.flatMap(lock => Object.keys(lock)))) {
    if (!path.includes('node_modules/')) continue
    const native = ['expo-module.config.json', 'android/build.gradle', 'android/build.gradle.kts', 'ReactAndroid/build.gradle.kts']
      .some(marker => [legacyRoot, redesignRoot].some(root => existsSync(resolve(root, path, marker))))
    if (!native && !path.endsWith('/hermes-compiler')) continue
    if (locks[0][path]?.version !== locks[1][path]?.version) {
      throw new Error(`Native version mismatch for ${path}: legacy=${locks[0][path]?.version ?? 'missing'}, redesign=${locks[1][path]?.version ?? 'missing'}`)
    }
  }
}

function checkDesignBundles(legacyRoot, redesignRoot) {
  const binaryConfig = require(resolve(legacyRoot, 'apps/mobile/app.config.js'))()
  if (read(legacyRoot, 'apps/mobile/lib/design-bundle-identity.ts').includes("= 'redesign'")) {
    if (binaryConfig.updates.enabled !== false) {
      throw new Error('The promoted redesign must disable updates and ship its embedded bundle')
    }
    return 'The embedded redesign bundle is ready.'
  }
  if (!redesignRoot) throw new Error('A legacy binary requires a redesign source tree')
  compareNativeVersions(legacyRoot, redesignRoot)
  const modulesPath = 'apps/mobile/modules'
  const names = new Set([legacyRoot, redesignRoot].flatMap(root => readdirSync(resolve(root, modulesPath))))
  for (const name of names) {
    const directory = `${modulesPath}/${name}`
    if (name !== 'orbit-widget') compareDirectory(legacyRoot, redesignRoot, `${directory}/android`)
    requireEqualFile(legacyRoot, redesignRoot, `${directory}/expo-module.config.json`)
    const bridge = name === 'orbit-widget' ? 'src/OrbitWidget.types.ts' : 'index.ts'
    requireEqualFile(legacyRoot, redesignRoot, `${directory}/${bridge}`)
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
  const pluginNames = config => config.plugins.map(plugin => Array.isArray(plugin) ? plugin[0] : plugin)
  const plugins = pluginNames(legacyConfig)
  if (JSON.stringify(plugins) !== JSON.stringify(pluginNames(redesignConfig))) {
    throw new Error('Config plugin registrations must match across designs')
  }
  const locks = [legacyRoot, redesignRoot].map(root => JSON.parse(read(root, 'package-lock.json')).packages)
  for (const plugin of plugins) {
    if (plugin.startsWith('.')) requireEqualFile(legacyRoot, redesignRoot, `apps/mobile/${plugin}.js`)
    else {
      const packageName = plugin.startsWith('@') ? plugin.split('/').slice(0, 2).join('/') : plugin.split('/')[0]
      const path = `node_modules/${packageName}`
      if (!locks[0][path]?.version || locks[0][path].version !== locks[1][path]?.version) {
        throw new Error(`Config plugin version mismatch: ${packageName}`)
      }
    }
  }
  if (typeof legacyConfig.runtimeVersion !== 'string' || legacyConfig.runtimeVersion !== redesignConfig.runtimeVersion) {
    throw new Error('Both designs must use the same fixed runtimeVersion')
  }
  if (legacyConfig.updates.enabled !== redesignConfig.updates.enabled ||
    legacyConfig.updates.url !== redesignConfig.updates.url) {
    throw new Error('Both designs must use the same update configuration')
  }
  return 'Both bundles match the Android native union.'
}

module.exports = { checkDesignBundles }

if (require.main === module) {
  if (process.argv.length < 3 || process.argv.length > 4) {
    process.stderr.write('Usage: node check-design-bundles.js <binary-root> [redesign-root]\n')
    process.exitCode = 2
  } else {
    try {
      const result = checkDesignBundles(resolve(process.argv[2]), process.argv[3] ? resolve(process.argv[3]) : undefined)
      process.stdout.write(`${result}\n`)
    } catch (error) {
      process.stderr.write(`${error.message}\n`)
      process.exitCode = 1
    }
  }
}
