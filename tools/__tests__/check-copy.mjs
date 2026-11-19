import { cpSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { check, stageRepo, toolPath } from "./_harness.mjs"

const stageCopyRepo = (name, english) => {
  const repository = stageRepo(name)
  mkdirSync(join(repository.path, "tools"))
  mkdirSync(join(repository.path, "packages/shared/src/i18n"), { recursive: true })
  const script = join(repository.path, "tools/check-copy.mjs")
  cpSync(toolPath("check-copy.mjs"), script)
  writeFileSync(join(repository.path, "tools/copy-baseline.json"), "[]")
  writeFileSync(join(repository.path, "packages/shared/src/i18n/en.json"), JSON.stringify(english))
  return script
}

export const cases = () => {
  const growth = stageCopyRepo("copy-growth", { greeting: "Oops" })
  check("check-copy.mjs", "baseline growth is refused", ["--write-baseline"], { status: 1 }, { path: growth })

  const resultTitle = stageCopyRepo("copy-result-title", { result: { title: "Done!" } })
  check("check-copy.mjs", "the result dialog title keeps its exclamation mark", ["--check"], { status: 0 }, { path: resultTitle })

  const otherExclamation = stageCopyRepo("copy-other-exclamation", { result: { sentence: "Done!" } })
  check("check-copy.mjs", "any other exclamation mark is refused", ["--check"], { status: 1 }, { path: otherExclamation })
}
