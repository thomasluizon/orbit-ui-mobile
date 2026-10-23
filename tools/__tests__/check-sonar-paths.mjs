import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join, matchesGlob } from "node:path"

import { check, REPO_ROOT, root, T, toolPath } from "./_harness.mjs"

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

  writeFileSync(join(repository, "present.ts"), "export {}\n")
  writeFileSync(properties, "sonar.coverage.exclusions=\\\n  present.ts,\\\n  present.ts\n")
  run("continued exclusions validate every physical line", { status: 0 })
  writeFileSync(properties, "sonar.coverage.exclusions=\\\n  present.ts,\\\n  missing.ts\n")
  run("continued missing exclusion is named", { status: 1, stderr: /sonar\.coverage\.exclusions: missing\.ts/ })

  writeFileSync(properties, "# A comment ending in a backslash does not continue\\\nsonar.coverage.exclusions=missing.ts\n")
  run("comment continuation cannot hide a missing path", { status: 1, stderr: /missing\.ts/ })
  writeFileSync(properties, "sonar.coverage.exclusions=\\\r\n  present.ts,\\\r\n  present.ts\r\n")
  run("continued exclusions accept CRLF", { status: 0 })

  writeFileSync(properties, "sonar.exclusions=.next/**\n")
  run("generated output glob may have no directory yet", { status: 0 })

  const sharedTests = "packages/shared/src/__tests__"
  mkdirSync(join(repository, sharedTests), { recursive: true })
  writeFileSync(properties, `sonar.test.inclusions=${sharedTests}/*-fixtures.ts\n`)
  run("shared fixture inclusion accepts an existing test directory", { status: 0 })

  const repositoryProperties = readFileSync(join(REPO_ROOT, "sonar-project.properties"), "utf8")
  const testInclusions = repositoryProperties.match(/^sonar\.test\.inclusions=(.*)$/m)[1].split(",")
  const referralFixtures = readdirSync(join(REPO_ROOT, sharedTests))
    .filter((filename) => /^referral-copy-(cases|fixtures)\.ts$/.test(filename))
  T("shared referral copy fixture exists", referralFixtures.length === 1)
  for (const filename of referralFixtures) {
    const fixturePath = `${sharedTests}/${filename}`
    T("shared referral copy fixture is classified as test code",
      testInclusions.some((pattern) => matchesGlob(fixturePath, pattern)), fixturePath)
  }
}
