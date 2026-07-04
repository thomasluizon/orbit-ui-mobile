const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");
const fs = require("fs");

const monorepoRoot = path.resolve(__dirname, "../..");
const realMonorepoRoot = fs.realpathSync.native(monorepoRoot);
const mobileModules = path.resolve(__dirname, "node_modules");
const rootModules = path.resolve(monorepoRoot, "node_modules");
const realRootModules = path.resolve(realMonorepoRoot, "node_modules");

const config = getDefaultConfig(__dirname);

// Watch the monorepo root for packages/shared changes
config.watchFolders = Array.from(new Set([monorepoRoot, realMonorepoRoot]));

// Pin the server root to the app directory so Metro resolves the entry file
// relative to apps/mobile, not the monorepo root (C:\orbit).
// Without this, @expo/config's getMetroServerRoot walks up to the workspace
// root and entry-file resolution fails in release builds.
config.server = { ...config.server, unstable_serverRoot: __dirname };

// Resolve node_modules from the app first, then monorepo root
config.resolver.nodeModulesPaths = Array.from(new Set([mobileModules, rootModules, realRootModules]));

module.exports = config;
