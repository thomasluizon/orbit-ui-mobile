const appJson = require("./app.json");

function readBooleanEnv(name, defaultValue) {
  const value = process.env[name]?.trim();
  if (!value) return defaultValue;
  return value === "1" || value.toLowerCase() === "true";
}

function withLocalPlugins(plugins) {
  const nextPlugins = Array.isArray(plugins) ? [...plugins] : []
  for (const pluginPath of [
    './plugins/with-android-release-build-fixes',
    './plugins/with-react-native-imperative-focus',
  ]) {
    if (!nextPlugins.some((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin) === pluginPath)) {
      nextPlugins.push(pluginPath)
    }
  }
  return nextPlugins
}

module.exports = () => {
  const baseConfig = appJson.expo ?? {};
  const captureMode = readBooleanEnv("EXPO_PUBLIC_CAPTURE_MODE", false);
  const productionConfig = {
    ...baseConfig,
    updates: { ...baseConfig.updates, enabled: false },
    android: {
      ...baseConfig.android,
      allowBackup: false,
      googleServicesFile: captureMode ? undefined : baseConfig.android?.googleServicesFile,
    },
    plugins: withLocalPlugins(baseConfig.plugins),
  };
  const variant = process.env.ORBIT_APP_VARIANT ?? 'production'
  if (variant === 'production') return productionConfig
  if (variant !== 'staging') throw new Error(`Unknown Orbit app variant: ${variant}`)

  const packageName = 'org.useorbit.app.staging'
  const linkHost = 'app-staging.useorbit.org'
  return {
    ...productionConfig,
    runtimeVersion: `${productionConfig.runtimeVersion}-staging`,
    updates: { ...productionConfig.updates, enabled: false },
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
};
