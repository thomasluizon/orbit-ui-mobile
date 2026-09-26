const appJson = require("./app.json");

function readBooleanEnv(name, defaultValue) {
  const value = process.env[name]?.trim();
  if (!value) return defaultValue;
  return value === "1" || value.toLowerCase() === "true";
}

function withLocalPlugin(plugins, pluginPath) {
  const nextPlugins = Array.isArray(plugins) ? [...plugins] : [];
  if (!nextPlugins.some((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin) === pluginPath)) {
    nextPlugins.push(pluginPath);
  }
  return nextPlugins;
}

module.exports = () => {
  const baseConfig = appJson.expo ?? {};
  const captureMode = readBooleanEnv("EXPO_PUBLIC_CAPTURE_MODE", false);
  return {
    ...baseConfig,
    android: {
      ...baseConfig.android,
      googleServicesFile: captureMode ? undefined : baseConfig.android?.googleServicesFile,
    },
    plugins: withLocalPlugin(
      withLocalPlugin(baseConfig.plugins, "./plugins/with-android-release-build-fixes"),
      "./plugins/with-react-native-imperative-focus"
    ),
  };
};
