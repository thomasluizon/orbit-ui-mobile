import { cpSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { check, root, toolPath } from "./_harness.mjs"

export const cases = () => {
  const repository = join(root, "sonar-paths")
  const toolsDirectory = join(repository, "tools")
  mkdirSync(toolsDirectory, { recursive: true })
  const script = join(toolsDirectory, "check-sonar-paths.mjs")
  cpSync(toolPath("check-sonar-paths.mjs"), script)
  const properties = join(repository, "sonar-project.properties")
  const run = (name, expected) => check("check-sonar-paths.mjs", name, [], expected, { path: script })

  writeFileSync(properties, "sonar.coverage.exclusions=missing.ts\n")
  run("missing literal exclusion is named", { status: 1, stderr: /sonar\.coverage\.exclusions: missing\.ts/ })
  writeFileSync(properties, "sonar.coverage.exclusions=\n")
  run("removed literal exclusion passes", { status: 0 })

  writeFileSync(properties, "sonar.test.inclusions=missing/**/*.test.ts\n")
  run("missing glob directory is named", { status: 1, stderr: /sonar\.test\.inclusions: missing/ })
  writeFileSync(properties, "sonar.test.inclusions=**/*.test.ts\n")
  run("removed glob directory passes", { status: 0 })

  writeFileSync(properties, "sonar.exclusions=.next/**\n")
  run("generated output glob may have no directory yet", { status: 0 })
}
