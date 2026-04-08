const fs = require("node:fs");
const path = require("node:path");

const targetRoot = process.argv[2];

if (!targetRoot) {
  console.error("Usage: node prepare-release-workspace.js <target-root>");
  process.exit(1);
}

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const mobileSourceDir = path.join(repoRoot, "apps", "mobile");
const sharedSourceDir = path.join(repoRoot, "packages", "shared");
const targetMobileDir = path.join(targetRoot, "apps", "mobile");
const targetSharedDir = path.join(targetRoot, "packages", "shared");
const targetBaseTsConfigPath = path.join(targetRoot, "tsconfig.base.json");

const mobileIgnoredNames = new Set([
  "android",
  "dist",
  "node_modules",
  ".expo",
  ".turbo",
  "google-services.json",
  "play-service-account.json",
]);

const sharedIgnoredNames = new Set(["dist", "node_modules", ".turbo"]);

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function shouldIgnore(sourcePath, ignoredNames) {
  const basename = path.basename(sourcePath);

  if (ignoredNames.has(basename)) {
    return true;
  }

  if (sourcePath.endsWith(".jks")) {
    return true;
  }

  const normalized = sourcePath.split(path.sep).join("/");
  return normalized.includes("/modules/orbit-widget/android/build/");
}

function copyDirectory(sourceDir, destinationDir, ignoredNames) {
  fs.cpSync(sourceDir, destinationDir, {
    recursive: true,
    force: true,
    filter: (sourcePath) => !shouldIgnore(sourcePath, ignoredNames),
  });
}

fs.rmSync(targetRoot, { recursive: true, force: true });
fs.mkdirSync(targetRoot, { recursive: true });

copyDirectory(mobileSourceDir, targetMobileDir, mobileIgnoredNames);
copyDirectory(sharedSourceDir, targetSharedDir, sharedIgnoredNames);

ensureParentDir(targetBaseTsConfigPath);
fs.copyFileSync(path.join(repoRoot, "tsconfig.base.json"), targetBaseTsConfigPath);

const mobilePackageJsonPath = path.join(targetMobileDir, "package.json");
const mobilePackageJson = JSON.parse(fs.readFileSync(mobilePackageJsonPath, "utf8"));

mobilePackageJson.dependencies = {
  ...mobilePackageJson.dependencies,
  "@orbit/shared": "file:../../packages/shared",
};

fs.writeFileSync(mobilePackageJsonPath, `${JSON.stringify(mobilePackageJson, null, 2)}\n`);

console.log(`Prepared isolated Android release workspace at ${targetRoot}`);
