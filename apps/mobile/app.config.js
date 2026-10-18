const appJson = require('./app.json')

function withLocalPlugins(plugins) {
  const nextPlugins = Array.isArray(plugins) ? [...plugins] : []
  const pluginPaths = [
    './plugins/with-android-release-build-fixes',
    './plugins/with-react-native-imperative-focus',
    './plugins/with-design-bundle-launch',
  ]

  for (const pluginPath of pluginPaths) {
    if (!nextPlugins.some((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin) === pluginPath)) {
      nextPlugins.push(pluginPath)
    }
  }

  return nextPlugins
}

module.exports = () => {
  const baseConfig = appJson.expo ?? {}
  const productionConfig = {
    ...baseConfig,
    plugins: withLocalPlugins(baseConfig.plugins),
  }
  const variant = process.env.ORBIT_APP_VARIANT ?? 'production'
  if (variant === 'production') return productionConfig
  if (variant !== 'staging') throw new Error(`Unknown Orbit app variant: ${variant}`)

  const packageName = 'org.useorbit.app.staging'
  const linkHost = 'app-staging.useorbit.org'

  return {
    ...productionConfig,
    runtimeVersion: `${productionConfig.runtimeVersion}-staging`,
    name: 'Orbit Staging',
    scheme: 'orbit-staging',
    android: {
      ...productionConfig.android,
      package: packageName,
      playStoreUrl: `https://play.google.com/store/apps/details?id=${packageName}`,
      intentFilters: productionConfig.android.intentFilters.map((filter) => ({
        ...filter,
        data: filter.data.map((entry) => ({ ...entry, host: linkHost })),
      })),
    },
    extra: {
      ...productionConfig.extra,
      router: { ...productionConfig.extra.router, origin: `https://${linkHost}` },
    },
  }
}
