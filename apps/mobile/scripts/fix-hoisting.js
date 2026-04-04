/**
 * Fixes npm workspace hoisting issues for the mobile app.
 *
 * Problem: nativewind and react-native-css-interop get hoisted to the
 * monorepo root node_modules, where they can't find tailwindcss v3
 * (root has v4 for the web app) or react-native (only in mobile's node_modules).
 *
 * Solution: Create symlinks so hoisted packages resolve the correct versions.
 */
const fs = require("fs");
const path = require("path");

const mobileNodeModules = path.resolve(__dirname, "..", "node_modules");
const rootNodeModules = path.resolve(__dirname, "..", "..", "..", "node_modules");

function symlink(targetPkg, intoPkg) {
  const src = path.join(mobileNodeModules, targetPkg);
  const destDir = path.join(rootNodeModules, intoPkg, "node_modules");
  const dst = path.join(destDir, targetPkg);

  if (!fs.existsSync(src)) {
    return;
  }

  fs.mkdirSync(destDir, { recursive: true });
  try {
    fs.rmSync(dst, { recursive: true, force: true });
  } catch {}
  fs.symlinkSync(src, dst, "junction");
}

// nativewind needs tailwindcss v3 (root has v4)
symlink("tailwindcss", "nativewind");

// react-native-css-interop needs react-native (only in mobile/node_modules)
symlink("react-native", "react-native-css-interop");
symlink("react-native", "nativewind");

// react-native-worklets needs react-native (used by reanimated 4.x)
symlink("react-native", "react-native-worklets");
