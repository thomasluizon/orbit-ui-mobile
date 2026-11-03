import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { check, REPO_ROOT, root } from "./_harness.mjs"

const repositoryLock = JSON.parse(readFileSync(join(REPO_ROOT, "package-lock.json"), "utf8"))
const safeAreaPath = "node_modules/react-native-safe-area-context"
const nestedSafeAreaPath = `apps/mobile/${safeAreaPath}`
const safeAreaEntry = repositoryLock.packages[safeAreaPath]
const javascriptPath = "node_modules/min-indent"
const javascriptEntry = repositoryLock.packages[javascriptPath]

function stageRepository(label, packages, markers = {}) {
  const repository = join(root, "native-module-copies", label)
  mkdirSync(repository, { recursive: true })
  writeFileSync(join(repository, "package-lock.json"), JSON.stringify({
    lockfileVersion: repositoryLock.lockfileVersion,
    packages,
  }))
  for (const [path, entry] of Object.entries(packages)) {
    if (entry.link) continue
    const directory = join(repository, path)
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, "package.json"), JSON.stringify({ version: entry.version }))
    for (const marker of markers[path] ?? []) {
      if (marker === "expo-module.config.json") writeFileSync(join(directory, marker), "{}")
      else mkdirSync(join(directory, marker), { recursive: true })
    }
  }
  return repository
}

export const cases = () => {
  const singleCopy = stageRepository("single", {
    [safeAreaPath]: safeAreaEntry,
    [javascriptPath]: javascriptEntry,
    [`apps/web/${javascriptPath}`]: javascriptEntry,
  }, { [safeAreaPath]: ["android", "ios"] })
  check("check-native-module-copies.mjs", "accepts one native copy and duplicate JavaScript packages from another cwd",
    ["--root", singleCopy], { status: 0, stdout: /1 native packages/ }, { cwd: dirname(singleCopy) })

  for (const marker of ["android", "ios", "expo-module.config.json"]) {
    const duplicate = stageRepository(`duplicate-${marker}`, {
      [safeAreaPath]: safeAreaEntry,
      [nestedSafeAreaPath]: safeAreaEntry,
    }, { [nestedSafeAreaPath]: [marker] })
    check("check-native-module-copies.mjs", `rejects same-version copies discovered by ${marker}`,
      ["--root", duplicate], { status: 1, stderr: /react-native-safe-area-context[\s\S]*apps\/mobile\/node_modules/ })
  }

  const transitivePath = `node_modules/expo-router/${safeAreaPath}`
  const transitive = stageRepository("transitive", {
    [safeAreaPath]: safeAreaEntry,
    [transitivePath]: safeAreaEntry,
  }, { [safeAreaPath]: ["android"] })
  check("check-native-module-copies.mjs", "checks transitive copies even without native markers in every copy",
    ["--root", transitive], { status: 1, stderr: /node_modules\/expo-router\/node_modules/ })

  const optional = stageRepository("optional", {})
  writeFileSync(join(optional, "package-lock.json"), JSON.stringify({
    lockfileVersion: repositoryLock.lockfileVersion,
    packages: { [safeAreaPath]: safeAreaEntry },
  }))
  check("check-native-module-copies.mjs", "refuses an incomplete installation instead of silently passing",
    ["--root", optional], { status: 2, stderr: /missing.*run npm ci/ })
  writeFileSync(join(optional, "package-lock.json"), JSON.stringify({
    lockfileVersion: repositoryLock.lockfileVersion,
    packages: { [javascriptPath]: { ...javascriptEntry, optional: true } },
  }))
  check("check-native-module-copies.mjs", "allows absent optional platform packages",
    ["--root", optional], { status: 0 })
  writeFileSync(join(optional, "package-lock.json"), "{}")
  check("check-native-module-copies.mjs", "rejects a lockfile without its package inventory",
    ["--root", optional], { status: 2, stderr: /packages map/ })

  check("check-native-module-copies.mjs", "repository native dependencies have one locked copy", [], { status: 0 })
}
