import { mkdirSync, symlinkSync, utimesSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { check, root } from "./_harness.mjs"

const TOOL = "check-dependency-edits.mjs"
/** One extraction time for the whole staged tree, exactly as npm writes one. */
const EXTRACTED_AT = new Date("2026-09-16T10:13:05Z")
const at = (secondsLater) => new Date(EXTRACTED_AT.getTime() + secondsLater * 1000)

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

export const cases = () => {
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
    { status: 1, stderr: /rm -rf node_modules\/react-native && npm install[\s\S]*plain npm install leaves a complete package alone/ },
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
    { status: 1, stderr: /rm -rf node_modules\/@react-native\/gradle-plugin/ },
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
