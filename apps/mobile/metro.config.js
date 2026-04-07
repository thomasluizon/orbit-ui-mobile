const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");
const fs = require("fs");

const monorepoRoot = path.resolve(__dirname, "../..");
const mobileModules = path.resolve(__dirname, "node_modules");
const rootModules = path.resolve(monorepoRoot, "node_modules");

const config = getDefaultConfig(__dirname);

// Watch the monorepo root for packages/shared changes
config.watchFolders = [monorepoRoot];

// Pin the server root to the app directory so Metro resolves the entry file
// relative to apps/mobile, not the monorepo root (C:\orbit).
// Without this, @expo/config's getMetroServerRoot walks up to the workspace
// root and entry-file resolution fails in release builds.
config.server = { ...config.server, unstable_serverRoot: __dirname };

// Resolve node_modules from the app first, then monorepo root
config.resolver.nodeModulesPaths = [mobileModules, rootModules];

// Force single copies of React ecosystem packages from mobile's node_modules
const singletonPackages = [
  "react",
  "react-native",
  "react-native-safe-area-context",
  "react-native-screens",
  "react-native-gesture-handler",
  "react-native-reanimated",
  "react-native-svg",
  "react-native-worklets",
];

const extraNodeModules = {};
for (const pkg of singletonPackages) {
  const mobilePath = path.resolve(mobileModules, pkg);
  if (fs.existsSync(mobilePath)) {
    extraNodeModules[pkg] = mobilePath;
  }
}
config.resolver.extraNodeModules = extraNodeModules;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (singletonPackages.includes(moduleName)) {
    try {
      return {
        filePath: require.resolve(moduleName, { paths: [mobileModules] }),
        type: "sourceFile",
      };
    } catch {}
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
