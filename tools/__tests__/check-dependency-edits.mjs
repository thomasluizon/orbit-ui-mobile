import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join, sep } from "node:path"

import { check, root, stage, T } from "./_harness.mjs"

const TOOL = "check-dependency-edits.mjs"
/** One extraction time for the whole staged tree, exactly as npm writes one. */
const EXTRACTED_AT = new Date("2026-09-16T10:13:05Z")
const at = (secondsLater) => new Date(EXTRACTED_AT.getTime() + secondsLater * 1000)
const repairPath = (path) => path.split(sep).join("/")

const writeAt = (path, body, when) => {
  mkdirSync(join(path, ".."), { recursive: true })
  writeFileSync(path, body)
  utimesSync(path, when, when)
}

const stagePackage = (nodeModules, name, files) => {
  const packageDirectory = join(nodeModules, ...name.split("/"))
  mkdirSync(packageDirectory, { recursive: true })
  writeAt(join(packageDirectory, "package.json"), `{ "name": "${name}", "version": "1.0.0" }\n`, EXTRACTED_AT)
  for (const [relativePath, secondsLater] of Object.entries(files)) {
    writeAt(join(packageDirectory, ...relativePath.split("/")), "published bytes\n", at(secondsLater))
  }
  return packageDirectory
}

const stageTree = (label) => {
  const repository = join(root, "dependency-edits", label)
  const nodeModules = join(repository, "node_modules")
  mkdirSync(nodeModules, { recursive: true })
  return { repository, nodeModules }
}

const stageLockedPackage = (label) => {
  const tree = stageTree(label)
  const source = join(tree.repository, "published")
  mkdirSync(source, { recursive: true })
  writeFileSync(join(source, "package.json"), JSON.stringify({ name: "slow-extraction", version: "1.0.0" }))
  writeFileSync(join(source, "index.js"), "published bytes\n")
  writeFileSync(join(source, "README.md"), "published documentation\n")
  const packed = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", [
    "pack", "--ignore-scripts", "--offline", "--cache", "../npm-cache", "--pack-destination", "..",
  ], { cwd: source, encoding: "utf8", shell: process.platform === "win32" })
  if (packed.status !== 0) throw new Error(`npm pack failed: ${packed.stderr}`)
  const archiveName = readdirSync(tree.repository).find((name) => name.endsWith(".tgz"))
  const integrity = `sha512-${createHash("sha512").update(readFileSync(join(tree.repository, archiveName))).digest("base64")}`
  const packageDirectory = join(tree.nodeModules, "slow-extraction")
  cpSync(source, packageDirectory, { recursive: true })
  for (const [name, seconds] of [["package.json", 0], ["index.js", 338], ["README.md", 339]]) {
    utimesSync(join(packageDirectory, name), at(seconds), at(seconds))
  }
  const lock = {
    name: "guard-fixture", lockfileVersion: 3,
    packages: { "node_modules/slow-extraction": { version: "1.0.0", resolved: `file:${archiveName}`, integrity } },
  }
  writeFileSync(join(tree.repository, "package-lock.json"), JSON.stringify(lock))
  return { ...tree, packageDirectory, lock, archiveName }
}

export const cases = () => {
  const slow = stageLockedPackage("locked-slow")
  const snapshot = () => ["package.json", "index.js", "README.md"].map((name) => {
    const path = join(slow.packageDirectory, name)
    return [name, readFileSync(path).toString("base64"), statSync(path).mtimeMs]
  })
  const before = snapshot()
  check(
    TOOL,
    "locked archive contents pass when clean extraction exceeds the default tolerance",
    ["--root", slow.repository],
    { status: 0, stdout: /No dependency was edited in place/ },
  )
  T("archive verification leaves installed contents and mtimes untouched", JSON.stringify(snapshot()) === JSON.stringify(before))
  for (const mutation of ["modified", "missing", "extra", "missing manifest"]) {
    const changed = stageLockedPackage(`locked-${mutation}`)
    if (mutation === "modified") writeAt(join(changed.packageDirectory, "index.js"), "edited bytes\n", at(338))
    if (mutation === "missing") rmSync(join(changed.packageDirectory, "index.js"))
    if (mutation === "extra") writeAt(join(changed.packageDirectory, "extra.js"), "extra bytes\n", at(0))
    if (mutation === "missing manifest") rmSync(join(changed.packageDirectory, "package.json"))
    check(
      TOOL,
      `${mutation} installed files fail locked archive comparison`,
      ["--root", changed.repository],
      { status: 1, stderr: mutation === "missing manifest" ? /missing:.*package\.json/ : new RegExp(`${mutation}.*${mutation === "extra" ? "extra.js" : "index.js"}`) },
    )
  }

  const archivePath = join(slow.repository, slow.archiveName)
  const archiveBytes = readFileSync(archivePath)
  writeFileSync(archivePath, Buffer.concat([archiveBytes, Buffer.from("corruption")]))
  check(TOOL, "a corrupt archive cannot clear a timestamp finding", ["--root", slow.repository], {
    status: 1, stderr: /could not verify locked archive: locked archive integrity mismatch/,
  })
  rmSync(archivePath)
  check(TOOL, "an unavailable archive cannot clear a timestamp finding", ["--root", slow.repository], {
    status: 1, stderr: /could not verify locked archive/,
  })
  writeFileSync(archivePath, archiveBytes)

  const locked = slow.lock.packages["node_modules/slow-extraction"]
  const lockPath = join(slow.repository, "package-lock.json")
  const rewriteLock = () => writeFileSync(lockPath, JSON.stringify(slow.lock))
  const integrity = locked.integrity
  delete locked.integrity
  rewriteLock()
  check(TOOL, "an archive without locked integrity retains timestamp failures", ["--root", slow.repository], {
    status: 1, stderr: /index\.js {2}\(\+338s/,
  })
  locked.integrity = integrity
  rewriteLock()

  for (const packagePath of ["apps/mobile/node_modules/@scope/slow-extraction", "node_modules/host/node_modules/slow-extraction"]) {
    const relocated = stageTree(`locked-${packagePath.replaceAll("/", "-")}`)
    if (packagePath.startsWith("node_modules/host/")) stagePackage(relocated.nodeModules, "host", { "index.js": 0 })
    cpSync(slow.packageDirectory, join(relocated.repository, ...packagePath.split("/")), { recursive: true, preserveTimestamps: true })
    cpSync(archivePath, join(relocated.repository, slow.archiveName))
    writeFileSync(join(relocated.repository, "package-lock.json"), JSON.stringify({ ...slow.lock, packages: { [packagePath]: locked } }))
    check(TOOL, `the owning lock resolves ${packagePath}`, ["--root", relocated.repository], { status: 0 })
    check(TOOL, `a scan inside ${packagePath} still resolves the ancestor lock`, ["--root", join(relocated.repository, packagePath.split("node_modules/")[0])], { status: 0 })
  }

  locked.resolved = "https://registry.example/slow-extraction.tgz"
  rewriteLock()
  const fetchShim = stage("dependency-fetch.cjs", `
const { readFileSync } = require("node:fs")
globalThis.fetch = async (url, options) => {
  if (url !== "https://registry.example/slow-extraction.tgz" || !(options.signal instanceof AbortSignal)) {
    throw new Error("unexpected archive request")
  }
  return new Response(readFileSync(process.env.ARCHIVE_FIXTURE), { status: Number(process.env.ARCHIVE_STATUS) })
}
`)
  for (const status of [200, 503]) {
    check(TOOL, `HTTPS archive response ${status} is handled`, ["--root", slow.repository], {
      status: status === 200 ? 0 : 1,
      ...(status === 503 ? { stderr: /locked archive request failed \(503\)/ } : {}),
    }, { env: {
      NODE_OPTIONS: `--require "${fetchShim.split(sep).join("/")}"`,
      ARCHIVE_FIXTURE: archivePath, ARCHIVE_STATUS: String(status),
    } })
  }

  const tar = createRequire(import.meta.url)("next/dist/compiled/tar")
  const alternateArchive = join(slow.repository, "alternate.tgz")
  tar.c({ file: alternateArchive, cwd: slow.repository, gzip: true, sync: true }, ["published"])
  locked.resolved = "file:alternate.tgz"
  locked.integrity = `sha512-${createHash("sha512").update(readFileSync(alternateArchive)).digest("base64")}`
  rewriteLock()
  check(TOOL, "archive roots are stripped like npm extraction", ["--root", slow.repository], { status: 0 })

  const clean = stageTree("clean")
  stagePackage(clean.nodeModules, "react-native", { "index.js": 0, "src/deep/flags.kt": 90 })
  stagePackage(clean.nodeModules, "@expo/config", { "index.js": 12 })
  /** npm's own bookkeeping is written when the install ENDS, so it is always later than a package. */
  writeAt(join(clean.nodeModules, ".package-lock.json"), "{}\n", at(3600))
  writeAt(join(clean.nodeModules, ".bin", "expo"), "#!/bin/sh\n", at(3600))
  check(
    TOOL,
    "a tree whose files all match their own extraction passes",
    ["--root", clean.repository],
    { status: 0, stdout: /No dependency was edited in place/ },
  )
  check(
    TOOL,
    "the clean verdict is not vacuous and names what it scanned",
    ["--root", clean.repository],
    { status: 0, stdout: /Scanned 2 packages and 5 files/ },
  )

  const edited = stageTree("edited")
  stagePackage(edited.nodeModules, "react-native", { "index.js": 0 })
  writeAt(
    join(edited.nodeModules, "react-native", "ReactNativeFeatureFlagsDefaults.kt"),
    "enableImperativeFocus = true\n",
    at(3 * 60 * 60),
  )
  check(
    TOOL,
    "a file written after its install fails and is named with its lateness",
    ["--root", edited.repository],
    { status: 1, stderr: /node_modules\/react-native\/ReactNativeFeatureFlagsDefaults\.kt {2}\(\+10800s/ },
  )
  check(
    TOOL,
    "the failure carries the repair that actually works",
    ["--root", edited.repository],
    { status: 1, stderr: /rm -rf '[^\n]+node_modules\/react-native' && npm install[\s\S]*plain npm install leaves a complete package alone/ },
  )

  const blinded = stageTree("blinded")
  const blindedPackage = stagePackage(blinded.nodeModules, "react-native", { "index.js": 0, "src/entry.js": 4 })
  writeAt(join(blindedPackage, "ReactNativeFeatureFlagsDefaults.kt"), "enableImperativeFocus = true\n", at(3 * 60 * 60))
  writeAt(join(blindedPackage, "KeyEvent.kt"), "KEYCODE_MOVE_HOME to \"Home\"\n", at(3 * 60 * 60))
  writeAt(join(blindedPackage, "package.json"), '{ "name": "react-native", "version": "0.86.3" }\n', at(3 * 60 * 60))
  check(
    TOOL,
    "a rewritten package.json does not blind the walk to the flags file edited beside it",
    ["--root", blinded.repository],
    { status: 1, stderr: /ReactNativeFeatureFlagsDefaults\.kt {2}\(\+10800s/ },
  )
  check(
    TOOL,
    "a rewritten package.json does not blind the walk to the key-map file edited beside it",
    ["--root", blinded.repository],
    { status: 1, stderr: /KeyEvent\.kt {2}\(\+10800s/ },
  )
  check(
    TOOL,
    "a rewritten package.json reports itself rather than becoming the reference",
    ["--root", blinded.repository],
    { status: 1, stderr: /react-native\/package\.json {2}\(\+10800s/ },
  )

  const scoped = stageTree("scoped")
  stagePackage(scoped.nodeModules, "@react-native/gradle-plugin", { "index.js": 3 * 60 * 60 })
  check(
    TOOL,
    "a scoped package is scanned under its full name",
    ["--root", scoped.repository],
    { status: 1, stderr: /rm -rf '[^\n]+node_modules\/@react-native\/gradle-plugin'/ },
  )

  const nested = stageTree("nested")
  const host = stagePackage(nested.nodeModules, "metro", { "index.js": 0 })
  stagePackage(join(host, "node_modules"), "semver", { "index.js": 3 * 60 * 60 })
  check(
    TOOL,
    "a package nested inside another package is scanned too",
    ["--root", nested.repository],
    { status: 1, stderr: /metro\/node_modules\/semver\/index\.js/ },
  )
  const nestedResult = check(
    TOOL,
    "repair guidance names the nested installed package",
    ["--root", nested.repository],
    { status: 1, stderr: /rm -rf '[^\n]+node_modules\/metro\/node_modules\/semver'/ },
  )
  T("nested repair uses the full affected path", nestedResult.stderr.includes(repairPath(join(host, "node_modules", "semver"))))

  const duplicate = stageTree("duplicate")
  const rootPackage = stagePackage(duplicate.nodeModules, "react-native", { "index.js": 10800 })
  const workspacePackage = stagePackage(
    join(duplicate.repository, "apps", "mobile", "node_modules"),
    "react-native",
    { "index.js": 10800 },
  )
  const duplicateResult = check(
    TOOL,
    "the same package name in two installed trees needs two repairs",
    ["--root", duplicate.repository],
    { status: 1, stderr: /2 file\(s\) in 2 package\(s\)/ },
  )
  T("root repair names its installed tree", duplicateResult.stderr.includes(`rm -rf '${repairPath(rootPackage)}'`))
  T("workspace repair names its installed tree", duplicateResult.stderr.includes(`rm -rf '${repairPath(workspacePackage)}'`))

  for (const timestampMode of ["preserved", "mixed"]) {
    const standalone = stageTree(`standalone-${timestampMode}`)
    const installedPackage = stagePackage(standalone.nodeModules, "client-only", { "index.js": 0 })
    const generatedRoot = join(standalone.repository, "apps", "web", ".next", "standalone")
    for (const tree of ["node_modules", "apps/web/node_modules"]) {
      const copiedPackage = join(generatedRoot, ...tree.split("/"), "client-only")
      cpSync(installedPackage, copiedPackage, { recursive: true, preserveTimestamps: true })
      const copiedFile = join(copiedPackage, timestampMode === "preserved" ? "index.js" : "package.json")
      const copiedAt = at(timestampMode === "preserved" ? -944 : 944)
      utimesSync(copiedFile, copiedAt, copiedAt)
      for (const file of ["package.json", "index.js"]) {
        T(
          `${timestampMode} standalone ${tree}/${file} is byte-identical to the installed file`,
          readFileSync(join(copiedPackage, file)).equals(readFileSync(join(installedPackage, file))),
        )
      }
    }
    check(
      TOOL,
      `byte-identical standalone copies with ${timestampMode} mtimes are excluded from installed scans`,
      ["--root", standalone.repository],
      { status: 0, stdout: /Scanned 1 packages and 2 files[\s\S]*No dependency was edited in place/ },
    )
    check(
      TOOL,
      `a scan rooted in ${timestampMode} standalone output finds no installed tree`,
      ["--root", generatedRoot],
      { status: 0, stdout: /Scanned 0 packages and 0 files[\s\S]*No installed dependency tree/ },
    )
    writeAt(join(installedPackage, "index.js"), "edited installed bytes\n", at(10800))
    const installedResult = check(
      TOOL,
      `a late installed write still fails beside ${timestampMode} standalone copies`,
      ["--root", standalone.repository],
      { status: 1, stderr: /1 file\(s\) in 1 package\(s\)[\s\S]*node_modules\/client-only\/index\.js {2}\(\+10800s/ },
    )
    T("generated copies never appear in installed findings or repairs", !installedResult.stderr.includes(".next/standalone"))
  }

  for (const directory of ["standalone", ".next/cache", ".next/standalone-other"]) {
    const ordinary = stageTree(`ordinary-${directory.replaceAll("/", "-")}`)
    stagePackage(join(ordinary.repository, ...directory.split("/"), "node_modules"), "client-only", { "index.js": 944 })
    check(
      TOOL,
      `an installed tree under ${directory} is still checked`,
      ["--root", ordinary.repository],
      { status: 1, stderr: /client-only\/index\.js {2}\(\+944s/ },
    )
  }

  const workspace = stageTree("workspace")
  stagePackage(workspace.nodeModules, "react-native", { "index.js": 0 })
  const source = join(workspace.repository, "packages", "shared")
  writeAt(join(source, "package.json"), '{ "name": "@orbit/shared" }\n', at(3 * 60 * 60))
  writeAt(join(source, "src", "index.ts"), "export const x = 1\n", at(3 * 60 * 60))
  mkdirSync(join(workspace.nodeModules, "@orbit"), { recursive: true })
  /**
   * A workspace is LINKED into node_modules, so following the link would walk the repository's own
   * source and report every file edited since the install. Junction type keeps this runnable on
   * Windows without elevation.
   */
  symlinkSync(source, join(workspace.nodeModules, "@orbit", "shared"), "junction")
  check(
    TOOL,
    "a linked workspace is never walked as installed content",
    ["--root", workspace.repository],
    { status: 0, stdout: /No dependency was edited in place/ },
  )

  const tolerance = stageTree("tolerance")
  stagePackage(tolerance.nodeModules, "@tabler/icons-react-native", { "dist/IconAB.d.ts": 93 })
  check(
    TOOL,
    "the default tolerance absorbs a large package's extraction span",
    ["--root", tolerance.repository],
    { status: 0 },
  )
  check(
    TOOL,
    "a narrowed tolerance reports the same file",
    ["--root", tolerance.repository, "--tolerance-seconds", "60"],
    { status: 1, stderr: /IconAB\.d\.ts {2}\(\+93s/ },
  )
  check(
    TOOL,
    "a non-numeric tolerance is refused before any walk",
    ["--root", tolerance.repository, "--tolerance-seconds", "soon"],
    { status: 2, stderr: /invalid arguments/ },
  )

  const empty = stageTree("empty")
  check(
    TOOL,
    "a root with no installed tree says so rather than reporting clean",
    ["--root", join(empty.repository, "nothing-here")],
    { status: 0, stdout: /No installed dependency tree under this root/ },
  )
}
