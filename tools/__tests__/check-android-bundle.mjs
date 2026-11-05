import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { createRequire } from "node:module"
import { check, REPO_ROOT, root } from "./_harness.mjs"

const require = createRequire(import.meta.url)
const { fromRawMappings } = require("metro-source-map")
const manifest = JSON.parse(readFileSync(join(REPO_ROOT, "node_modules/react-native-safe-area-context/package.json"), "utf8"))
const provider = readFileSync(join(REPO_ROOT, "node_modules/react-native-safe-area-context/src/specs/NativeSafeAreaProvider.ts"), "utf8")

function stage(label, sources) {
  const project = join(root, "android-bundle", label)
  mkdirSync(project, { recursive: true })
  const modules = sources.map(([path, source]) => {
    const absolute = join(project, path)
    mkdirSync(dirname(absolute), { recursive: true })
    writeFileSync(absolute, source)
    const packageRoot = path.slice(0, path.indexOf("/src/"))
    mkdirSync(join(project, packageRoot, "android"), { recursive: true })
    writeFileSync(join(project, packageRoot, "package.json"), JSON.stringify(manifest))
    return { code: source, source, path, map: [[1, 0, 1, 0]] }
  })
  const map = join(project, "index.map")
  writeFileSync(map, JSON.stringify(fromRawMappings(modules).toMap()))
  return ["--map", map, "--project", project]
}

export const cases = () => {
  const source = "node_modules/react-native-safe-area-context/src/specs/NativeSafeAreaProvider.ts"
  check("check-android-bundle.mjs", "accepts the installed provider through a Metro-produced map",
    stage("single", [[source, provider]]), { status: 0, stdout: /1 native packages, 1 native components/ }, { cwd: root })
  check("check-android-bundle.mjs", "rejects the same provider from two package roots",
    stage("duplicate", [[source, provider], [`apps/mobile/${source}`, provider]]),
    { status: 1, stderr: /native package react-native-safe-area-context[\s\S]*native component RNCSafeAreaProvider/ })
  check("check-android-bundle.mjs", "rejects a registration from a second module in one package",
    stage("second-module", [[source, provider], [source.replace("Provider.ts", "Other.ts"), provider.replaceAll("codegenNativeComponent", "registerView")
      .replace("/Utilities/registerView", "/Utilities/codegenNativeComponent")]]),
    { status: 1, stderr: /native component RNCSafeAreaProvider/ })
  check("check-android-bundle.mjs", "ignores registration text inside comments and strings",
    stage("non-code", [[source, `${provider}\n// requireNativeComponent('FakeView')\nconst text = "requireNativeComponent('FakeView')";`]]),
    { status: 0 })
  const invalid = join(root, "android-bundle", "invalid.map")
  writeFileSync(invalid, "{}")
  check("check-android-bundle.mjs", "refuses absent source inventory", ["--map", invalid], { status: 2, stderr: /nonempty version 3/ })
}
