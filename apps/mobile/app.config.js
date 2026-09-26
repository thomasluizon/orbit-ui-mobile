const appJson = require("./app.json");

function withAndroidReleaseBuildFixesPlugin(plugins) {
  const nextPlugins = Array.isArray(plugins) ? [...plugins] : [];
  const pluginPath = "./plugins/with-android-release-build-fixes";

  if (!nextPlugins.some((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin) === pluginPath)) {
    nextPlugins.push(pluginPath);
  }

  return nextPlugins;
}

module.exports = () => {
  const baseConfig = appJson.expo ?? {};

  return {
    ...baseConfig,
    plugins: withAndroidReleaseBuildFixesPlugin(baseConfig.plugins),
  };
};
