import { cpSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { check, stageRepo, toolPath } from "./_harness.mjs"

export const cases = () => {
  const repository = stageRepo("copy-growth")
  mkdirSync(join(repository.path, "tools"))
  mkdirSync(join(repository.path, "packages/shared/src/i18n"), { recursive: true })
  const script = join(repository.path, "tools/check-copy.mjs")
  cpSync(toolPath("check-copy.mjs"), script)
  writeFileSync(join(repository.path, "tools/copy-baseline.json"), "[]")
  writeFileSync(join(repository.path, "packages/shared/src/i18n/en.json"), JSON.stringify({ greeting: "Oops" }))
  check("check-copy.mjs", "baseline growth is refused", ["--write-baseline"], { status: 1 }, { path: script })
}
