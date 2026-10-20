
import { cpSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { EM_DASH, check, stageRepo, toolPath } from "./_harness.mjs"

export const cases = () => {
  check("check-dashes.mjs", "an em dash in text is rejected", ["--text", `a${EM_DASH}b`], { status: 1, stderr: /Banned dash/ })
  check("check-dashes.mjs", "clean text passes", ["--text", "a plain hyphen - is fine"], { status: 0 })

  const repository = stageRepo("dash-baseline-paths")
  const toolsDirectory = join(repository.path, "tools")
  mkdirSync(toolsDirectory, { recursive: true })
  cpSync(toolPath("check-dashes.mjs"), join(toolsDirectory, "check-dashes.mjs"))
  const baselinePath = join(toolsDirectory, "dash-baseline.json")
  writeFileSync(baselinePath, '{"missing-a.ts": 1, "missing-b.ts": 1}\n')
  check("check-dashes.mjs", "every missing baseline key is named", ["--check-baseline"], {
    status: 1,
    stderr: /missing-a\.ts[\s\S]*missing-b\.ts/,
  }, { path: join(toolsDirectory, "check-dashes.mjs") })
  writeFileSync(baselinePath, "{}\n")
  check("check-dashes.mjs", "removed baseline key passes", ["--check-baseline"], {
    status: 0,
  }, { path: join(toolsDirectory, "check-dashes.mjs") })
}
