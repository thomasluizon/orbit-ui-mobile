import { importGraph, isLockedJsonName, jsonLockChanged, lockSetsOf, lockedPathsOf, parseJsonc } from "../lib/locks.mjs"
import { same } from "./_harness.mjs"

const N = "lib/locks.mjs"
/** A fake main: the text of each file by path. */
const filesOf = (table) => async (path) => table[path] ?? null

const pathCases = () => {
  same(`${N}: a rule file is a design-system path`, lockedPathsOf(["eslint-rules/x.cjs"]), { "design-system": ["eslint-rules/x.cjs"] })
  same(`${N}: an eslint config of any workspace is a design-system path`, lockedPathsOf(["apps/web/eslint.config.mjs", "eslint.config.js"]), { "design-system": ["apps/web/eslint.config.mjs", "eslint.config.js"] })
  same(`${N}: a rename of test.yml to tests.yml lists both paths and locks the old one`, lockedPathsOf([".github/workflows/test.yml", ".github/workflows/tests.yml"]), { "design-system": [".github/workflows/test.yml"] })
  same(`${N}: the fixed design-system paths are locked`, Object.values(lockedPathsOf([".github/scripts/plan-test-jobs.mjs", ".github/scripts/changed-paths.sh", "tools/lint-changed.mjs", "apps/mobile/__tests__/components/ui/row-geometry.test.tsx", "apps/web/e2e/layout/text-overflow-geometry.ts"]))[0].length, 5)
  same(`${N}: the driver, the order of a repository and the metadata check are gate paths`, lockedPathsOf(["tools/drive.mjs", ".claude/orchestrator.json", ".github/scripts/check-pr-metadata.mjs", ".github/workflows/pr-metadata.yml", "tools/__tests__/_harness.mjs"]), { gate: ["tools/drive.mjs", ".claude/orchestrator.json", ".github/scripts/check-pr-metadata.mjs", ".github/workflows/pr-metadata.yml", "tools/__tests__/_harness.mjs"] })
  same(`${N}: a path of the graph of main and a changed JSON file join the sets`, lockedPathsOf(["tools/lib/new-import.mjs", "apps/web/package.json", "apps/web/a.ts"], { gate: ["tools/lib/new-import.mjs"], changedJson: ["apps/web/package.json"] }), { "design-system": ["apps/web/package.json"], gate: ["tools/lib/new-import.mjs"] })
  same(`${N}: an ordinary path is locked by no label`, lockedPathsOf(["apps/web/a.ts", "tools/README.md"]), {})
}

const jsonCases = () => {
  const pkg = (lint, extra = {}) => JSON.stringify({ name: "a", scripts: { lint, ...extra } })
  same(`${N}: a package.json and a tsconfig are named, a lock file is not`, ["apps/web/package.json", "tsconfig.base.json", "apps/mobile/tsconfig.json", "package-lock.json"].map(isLockedJsonName), [true, true, true, false])
  same(`${N}: a new scripts.lint value is a change`, jsonLockChanged("package.json", pkg("eslint ."), pkg("echo skip")), true)
  same(`${N}: another script or a dependency is no change`, jsonLockChanged("package.json", pkg("eslint ."), pkg("eslint .", { test: "vitest" })), false)
  same(`${N}: a new package.json with a lint script is a change and one without is none`, [jsonLockChanged("package.json", null, pkg("eslint .")), jsonLockChanged("package.json", null, JSON.stringify({ name: "a" }))], [true, false])
  const config = (include, exclude) => `{\n  // the sources\n  "compilerOptions": { "strict": true, },\n  "include": ${JSON.stringify(include)}, /* kept */\n  "exclude": ${JSON.stringify(exclude)},\n}`
  same(`${N}: a tsconfig with comments and a new include is a change`, jsonLockChanged("tsconfig.json", config(["src"], []), config(["src", "e2e"], [])), true)
  same(`${N}: a tsconfig with comments and the same include and exclude is no change`, jsonLockChanged("tsconfig.json", config(["src"], ["x"]), config(["src"], ["x"]).replace("strict\": true", "strict\": false")), false)
  same(`${N}: a tsconfig that is deleted with an include is a change`, jsonLockChanged("tsconfig.json", config(["src"], []), null), true)
  same(`${N}: a file that does not parse is a change when its text differs`, [jsonLockChanged("package.json", pkg("a"), "{ broken"), jsonLockChanged("package.json", "{ broken", "{ broken")], [true, false])
  same(`${N}: parseJsonc keeps a slash inside a string`, parseJsonc('{ "a": "http://x/*y*/", /* c */ "b": [1,] }'), { a: "http://x/*y*/", b: [1] })
}

const graphCases = async () => {
  const main = filesOf({
    "tools/drive.mjs": 'import { a } from "./lib/a.mjs"\n// import { z } from "./lib/zed.mjs"\nconst runner = "runner.mjs"\nconst note = "never.mjs"\nawait import("./lib/b")\n',
    "tools/lib/a.mjs": 'export * from "./c.mjs"\nconst hook = new URL("./hook.mjs", import.meta.url)\n/* "never.mjs" */\n',
    "tools/lib/b.ts": "export const b = 1",
    "tools/lib/c.mjs": 'import "../shared.mjs"',
    "tools/lib/hook.mjs": "",
    "tools/lib/zed.mjs": "",
    "tools/runner.mjs": "",
    "tools/shared.mjs": "",
    "tools/never.mjs": "",
  })
  same(`${N}: the graph follows imports, re-exports, new URL paths, dynamic imports and script names`, await importGraph(["tools/drive.mjs"], main), ["tools/drive.mjs", "tools/lib/a.mjs", "tools/lib/b.ts", "tools/lib/c.mjs", "tools/lib/hook.mjs", "tools/runner.mjs", "tools/shared.mjs", "tools/never.mjs"].sort())
  same(`${N}: a missing entry gives an empty graph`, await importGraph(["tools/gone.mjs"], main), [])
  const tests = filesOf({ "apps/mobile/__tests__/ui/a.test.tsx": 'import { x } from "../support/geometry"\nimport { Row } from "../../components/ui/row"', "apps/mobile/__tests__/support/geometry.ts": "", "apps/mobile/components/ui/row.tsx": "" })
  same(`${N}: the graph of a test keeps only the files that the filter allows`, await importGraph(["apps/mobile/__tests__/ui/a.test.tsx"], tests, { within: (path) => path.startsWith("apps/mobile/__tests__/") }), ["apps/mobile/__tests__/support/geometry.ts", "apps/mobile/__tests__/ui/a.test.tsx"])
  const sets = await lockSetsOf({
    read: filesOf({ "tools/drive.mjs": 'import "./lib/a.mjs"', "tools/lib/a.mjs": "", "tools/lint-changed.mjs": 'import "./lib/lint-rules.mjs"', "tools/lib/lint-rules.mjs": "", ".github/scripts/x.mjs": "" }),
    grep: async () => ["apps/web/e2e/layout/label.spec.ts", "apps/web/components/label.tsx"],
  })
  same(`${N}: the sets hold the graph of the lint, the specs of the label fit, the driver graph and its test cases`, sets, {
    design: ["apps/web/e2e/layout/label.spec.ts", "tools/lib/lint-rules.mjs", "tools/lint-changed.mjs"],
    gate: ["tools/__tests__/a.mjs", "tools/__tests__/drive.mjs", "tools/drive.mjs", "tools/lib/a.mjs"],
  })
}

export const cases = async () => {
  pathCases()
  jsonCases()
  await graphCases()
}
