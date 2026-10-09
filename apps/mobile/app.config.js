const appJson = require('./app.json')

function withAndroidReleaseBuildFixesPlugin(plugins) {
  const nextPlugins = Array.isArray(plugins) ? [...plugins] : []
  const pluginPath = './plugins/with-android-release-build-fixes'

  if (!nextPlugins.some((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin) === pluginPath)) {
    nextPlugins.push(pluginPath)
  }

  return nextPlugins
}

module.exports = () => {
  const baseConfig = appJson.expo ?? {}
  const captureMode = ['1', 'true'].includes(process.env.EXPO_PUBLIC_CAPTURE_MODE?.trim().toLowerCase())
  const productionConfig = {
    ...baseConfig,
    ...(captureMode ? { android: { ...baseConfig.android, googleServicesFile: undefined } } : {}),
    plugins: withAndroidReleaseBuildFixesPlugin(baseConfig.plugins),
  }
  const variant = process.env.ORBIT_APP_VARIANT ?? 'production'
  if (variant === 'production') return productionConfig
  if (variant !== 'staging') throw new Error(`Unknown Orbit app variant: ${variant}`)

  const packageName = 'org.useorbit.app.staging'
  const linkHost = 'app-staging.useorbit.org'

  return {
    ...productionConfig,
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
