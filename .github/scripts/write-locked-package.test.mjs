import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { lockedPackage } from "./write-locked-package.mjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const rootLockfile = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"))
const archive = (name, version) => ({ version, resolved: `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`, integrity: `sha512-${name}${version}` })

test("the Turbo subset holds the root lockfile entries of turbo and of each platform package, unchanged", () => {
  const { manifest, lockfile } = lockedPackage(rootLockfile, "turbo")
  const turbo = rootLockfile.packages["node_modules/turbo"]
  assert.deepEqual(manifest.devDependencies, { turbo: turbo.version })
  assert.deepEqual(lockfile.packages[""].devDependencies, manifest.devDependencies, "npm ci needs the manifest and the lockfile to agree")
  const platforms = Object.keys(turbo.optionalDependencies).map((name) => `node_modules/${name}`)
  assert.deepEqual(Object.keys(lockfile.packages).slice(1), ["node_modules/turbo", ...platforms].sort())
  for (const location of Object.keys(lockfile.packages).slice(1)) {
    assert.deepEqual(lockfile.packages[location], rootLockfile.packages[location], `${location} keeps its version, archive and checksum`)
  }
})

test("a dependency resolves to the nearest node_modules directory, as Node does", () => {
  const { lockfile } = lockedPackage({
    packages: {
      "": {},
      "node_modules/tool": { ...archive("tool", "1.0.0"), dependencies: { shared: "^2.0.0", helper: "^1.0.0" } },
      "node_modules/tool/node_modules/shared": { ...archive("shared", "2.1.0"), dependencies: { leaf: "^1.0.0" } },
      "node_modules/shared": archive("shared", "1.0.0"),
      "node_modules/helper": archive("helper", "1.2.0"),
      "node_modules/leaf": archive("leaf", "1.0.1"),
      "node_modules/other": archive("other", "3.0.0"),
    },
  }, "tool")
  assert.deepEqual(Object.keys(lockfile.packages), ["", "node_modules/helper", "node_modules/leaf", "node_modules/tool", "node_modules/tool/node_modules/shared"])
})

test("a missing required dependency or an entry without a checksum fails, and a missing optional one is left out", () => {
  const packages = { "": {}, "node_modules/tool": { ...archive("tool", "1.0.0"), optionalDependencies: { "tool-arm": "1.0.0" } } }
  assert.deepEqual(Object.keys(lockedPackage({ packages }, "tool").lockfile.packages), ["", "node_modules/tool"])
  assert.throws(() => lockedPackage({ packages: { ...packages, "node_modules/tool": { ...packages["node_modules/tool"], dependencies: { gone: "1" } } } }, "tool"),
    /node_modules\/tool needs gone, which the root lockfile does not hold/)
  assert.throws(() => lockedPackage({ packages: { "": {}, "node_modules/tool": { version: "1.0.0" } } }, "tool"), /has no resolved archive with a checksum/)
  assert.throws(() => lockedPackage({ packages: { "": {} } }, "tool"), /the root lockfile has no node_modules\/tool/)
})

test("npm ci accepts the written Turbo manifest and lockfile as one locked tree", () => {
  // npm reads a prefix under a symbolic link, such as /var on macOS, as a link to another root, so the test uses the real path.
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "locked-turbo-")))
  try {
    const written = spawnSync(process.execPath, [join(root, ".github/scripts/write-locked-package.mjs"), "turbo", directory], { encoding: "utf8" })
    assert.equal(written.status, 0, written.stderr)
    // --dry-run checks that the lockfile satisfies the manifest and installs nothing.
    const install = spawnSync("npm", ["ci", "--prefix", directory, "--dry-run", "--ignore-scripts", "--no-audit", "--no-fund", "--offline"], { encoding: "utf8" })
    assert.equal(install.status, 0, install.stdout + install.stderr)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
