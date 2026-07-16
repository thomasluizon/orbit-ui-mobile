const fs = require("node:fs");
const path = require("node:path");

function isNativeModule(moduleDir) {
  return (
    fs.existsSync(path.join(moduleDir, "android", "build.gradle")) ||
    fs.existsSync(path.join(moduleDir, "android", "build.gradle.kts"))
  );
}

function* installedModules(modulesRoot) {
  if (!fs.existsSync(modulesRoot)) return;

  for (const entry of fs.readdirSync(modulesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    if (entry.name === ".bin") continue;

    const entryPath = path.join(modulesRoot, entry.name);

    if (entry.name.startsWith("@")) {
      for (const scoped of fs.readdirSync(entryPath, { withFileTypes: true })) {
        yield [`${entry.name}/${scoped.name}`, path.join(entryPath, scoped.name)];
      }
      continue;
    }

    yield [entry.name, entryPath];
  }
}

function readVersion(moduleDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(moduleDir, "package.json"), "utf8")).version;
  } catch {
    return undefined;
  }
}

function lockedVersions(lockfile, moduleName) {
  const versions = new Set();

  for (const [lockPath, entry] of Object.entries(lockfile.packages)) {
    if (lockPath.endsWith(`node_modules/${moduleName}`) && entry.version) {
      versions.add(entry.version);
    }
  }

  return versions;
}

/**
 * Compares every native module installed in the isolated Android release
 * workspace against the versions the repo-root lockfile resolves, so the AAB is
 * compiled from the same native set the repo develops and tests against.
 *
 * @param {string} repoRoot Repo root holding the committed package-lock.json.
 * @param {string} mobileDir Isolated release workspace's apps/mobile directory.
 * @returns {{checked: number, drifted: string[], untracked: string[]}}
 */
function verifyReleaseNativeModules(repoRoot, mobileDir) {
  const lockfile = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "package-lock.json"), "utf8"),
  );

  const drifted = [];
  const untracked = [];
  let checked = 0;

  for (const [moduleName, moduleDir] of installedModules(path.join(mobileDir, "node_modules"))) {
    if (!isNativeModule(moduleDir)) continue;

    const installed = readVersion(moduleDir);
    if (installed === undefined) continue;

    checked += 1;
    const locked = lockedVersions(lockfile, moduleName);

    if (locked.size === 0) {
      untracked.push(`${moduleName}@${installed}`);
      console.log(`UNTRACKED ${moduleName}: release=${installed} lockfile=<absent>`);
      continue;
    }

    if (locked.has(installed)) {
      console.log(`ok        ${moduleName}: ${installed}`);
      continue;
    }

    const expected = [...locked].join(" | ");
    drifted.push(`${moduleName} resolved ${installed} but the lockfile resolves ${expected}`);
    console.log(`DRIFTED   ${moduleName}: release=${installed} lockfile=${expected}`);
  }

  return { checked, drifted, untracked };
}

if (require.main === module) {
  const [repoRoot, mobileDir] = process.argv.slice(2);

  if (!repoRoot || !mobileDir) {
    console.error("Usage: node verify-release-native-modules.js <repo-root> <release-mobile-dir>");
    process.exit(1);
  }

  const { checked, drifted, untracked } = verifyReleaseNativeModules(repoRoot, mobileDir);
  console.log(`\nChecked ${checked} native modules against the repo-root lockfile.`);

  if (untracked.length > 0) {
    console.error(
      `::error::Native modules are installed in the release workspace but absent from the ` +
        `repo-root lockfile: ${untracked.join("; ")}. The release would ship native code that no ` +
        `local install or CI job ever built. Add them to apps/mobile/package.json and commit the lockfile.`,
    );
  }

  if (drifted.length > 0) {
    console.error(
      `::error::Native module versions drifted from the repo-root lockfile: ${drifted.join("; ")}. ` +
        `The release workspace installs without a lockfile, so an unpinned native module floats to ` +
        `the newest published version and the AAB ships native code the repo never tested. ` +
        `Pin each module to the lockfile version in apps/mobile/package.json (dependencies for ` +
        `direct deps, overrides for transitive ones), or update the root lockfile deliberately.`,
    );
  }

  if (drifted.length > 0 || untracked.length > 0) process.exit(1);
}

module.exports = { isNativeModule, verifyReleaseNativeModules };
