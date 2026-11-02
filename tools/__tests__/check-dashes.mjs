
import { cpSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { EM_DASH, check, stageRepo, toolPath } from "./_harness.mjs"

export const cases = () => {
  check("check-dashes.mjs", "an em dash in text is rejected", ["--text", `a${EM_DASH}b`], { status: 1, stderr: /Banned dash/ })
  check("check-dashes.mjs", "clean text passes", ["--text", "a plain hyphen - is fine"], { status: 0 })

  const repository = stageRepo("dash-baseline-paths")
  const toolsDirectory = join(repository.path, "tools")
  mkdirSync(toolsDirectory, { recursive: true })
  cpSync(toolPath("check-dashes.mjs"), join(toolsDirectory, "check-dashes.mjs"))
  if (process.platform !== "win32") {
    const alias = join(repository.path, "dash-alias.mjs")
    symlinkSync(join(toolsDirectory, "check-dashes.mjs"), alias)
    check("check-dashes.mjs", "an executable symlink still runs the gate", ["--text", `a${EM_DASH}b`], { status: 1, stderr: /Banned dash/ }, { path: alias })
  }
  const baselinePath = join(toolsDirectory, "dash-baseline.json")
  writeFileSync(baselinePath, '{"missing-a.ts": 1, "missing-b.ts": 1}\n')
  check("check-dashes.mjs", "every missing baseline key is named", ["--check-baseline"], {
    status: 1,
    stderr: /missing-a\.ts[\s\S]*missing-b\.ts/,
  }, { path: join(toolsDirectory, "check-dashes.mjs") })
  check("check-dashes.mjs", "missing explicit input is a usage error", ["--files", "missing.ts"], { status: 2 }, { path: join(toolsDirectory, "check-dashes.mjs") })
  writeFileSync(join(repository.path, "growing.ts"), `a${EM_DASH}b`)
  repository.git(["--literal-pathspecs", "add", "growing.ts"])
  check("check-dashes.mjs", "baseline growth is refused", ["--write-baseline"], { status: 1 }, { path: join(toolsDirectory, "check-dashes.mjs") })
  writeFileSync(join(repository.path, "growing.ts"), "clean")
  writeFileSync(join(repository.path, "deleted.ts"), "tracked")
  repository.git(["--literal-pathspecs", "add", "deleted.ts"])
  repository.git(["commit", "-m", "tracked deletion fixture"])
  rmSync(join(repository.path, "deleted.ts"))
  check("check-dashes.mjs", "an absolute unstaged deletion is allowed", ["--files", join(repository.path, "deleted.ts")], { status: 0 }, { path: join(toolsDirectory, "check-dashes.mjs") })
  repository.git(["--literal-pathspecs", "add", "deleted.ts"])
  check("check-dashes.mjs", "a staged deletion is allowed", ["--files", "./deleted.ts"], { status: 0 }, { path: join(toolsDirectory, "check-dashes.mjs") })
  check("check-dashes.mjs", "a missing skipped path is still a usage error", ["--files", ".claude/missing.mjs"], { status: 2 }, { path: join(toolsDirectory, "check-dashes.mjs") })
  writeFileSync(baselinePath, "{}\n")
  check("check-dashes.mjs", "removed baseline key passes", ["--check-baseline"], {
    status: 0,
  }, { path: join(toolsDirectory, "check-dashes.mjs") })
}
