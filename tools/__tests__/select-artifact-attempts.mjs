import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

import { check, root, stage, T } from "./_harness.mjs"

export const cases = () => {
  const input = join(root, "artifact-attempts", "downloads")
  const output = join(root, "artifact-attempts", "reports")
  for (let shard = 1; shard <= 8; shard++) {
    stage(`artifact-attempts/downloads/web-unit-shard-chromium-${shard}-attempt-1/blobs/chromium-${shard}.json`, `original ${shard}`)
  }
  stage("artifact-attempts/downloads/web-unit-shard-chromium-8-attempt-1/stale-only.json", "must not be copied")
  stage("artifact-attempts/downloads/web-unit-shard-chromium-8-attempt-2/blobs/chromium-8.json", "rerun passed")
  const mixed = check("select-artifact-attempts.mjs", "selects one attempt per shard after a partial rerun", ["--input-dir", input, "--output-dir", output], { status: 0 }, { cwd: root })
  const selected = JSON.parse(mixed.stdout)
  T("partial rerun selects exactly eight artifacts", selected.length === 8)
  T("rerun replaces only shard eight", selected.includes("web-unit-shard-chromium-8-attempt-2") && !selected.includes("web-unit-shard-chromium-8-attempt-1"))
  T("older attempt's unique file is excluded", !existsSync(join(output, "stale-only.json")))
  T("only eight blob files are materialized", readdirSync(join(output, "blobs")).length === 8)
  for (let shard = 1; shard <= 8; shard++) {
    T(`shard ${shard} has the selected contents`, readFileSync(join(output, "blobs", `chromium-${shard}.json`), "utf8") === (shard === 8 ? "rerun passed" : `original ${shard}`))
  }

  const workspaces = join(root, "workspace-attempts", "downloads")
  const coverage = join(root, "workspace-attempts", "reports")
  for (const attempt of [1, 2, 10]) {
    stage(`workspace-attempts/downloads/workspace-unit-coverage-mobile-attempt-${attempt}/apps/mobile/coverage/lcov.info`, `mobile ${attempt}`)
  }
  stage("workspace-attempts/downloads/workspace-unit-coverage-shared-attempt-1/packages/shared/coverage/lcov.info", "shared 1")
  check("select-artifact-attempts.mjs", "orders attempts numerically and preserves workspace paths", ["--input-dir", workspaces, "--output-dir", coverage], { status: 0 })
  T("attempt ten wins over attempt two", readFileSync(join(coverage, "apps/mobile/coverage/lcov.info"), "utf8") === "mobile 10")
  T("workspace without rerun keeps attempt one", readFileSync(join(coverage, "packages/shared/coverage/lcov.info"), "utf8") === "shared 1")

  const single = join(root, "first-attempt", "downloads")
  stage("first-attempt/downloads/web-unit-shard-jsdom-1-attempt-1/blobs/jsdom-1.json", "first run")
  const firstOutput = join(root, "first-attempt", "reports")
  check("select-artifact-attempts.mjs", "first attempt copies the original report", ["--input-dir", single, "--output-dir", firstOutput], { status: 0 })
  T("first-attempt contents are preserved", readFileSync(join(firstOutput, "blobs/jsdom-1.json"), "utf8") === "first run")

  for (const name of ["unqualified", "report-attempt-0", "report-attempt-9007199254740992"]) {
    const invalid = join(root, "invalid-artifacts", name)
    mkdirSync(join(invalid, name), { recursive: true })
    check("select-artifact-attempts.mjs", `rejects invalid artifact ${name}`, ["--input-dir", invalid, "--output-dir", coverage], { status: 1, stderr: /Expected an attempt-qualified artifact directory/ })
  }
  const empty = join(root, "empty-artifacts")
  mkdirSync(empty)
  check("select-artifact-attempts.mjs", "rejects an empty artifact set", ["--input-dir", empty, "--output-dir", coverage], { status: 1, stderr: /No artifact directories/ })
  check("select-artifact-attempts.mjs", "rejects missing input", ["--input-dir", join(root, "missing-artifacts"), "--output-dir", coverage], { status: 1 })
  check("select-artifact-attempts.mjs", "rejects output nested in input", ["--input-dir", input, "--output-dir", join(input, "reports")], { status: 1, stderr: /outside the input/ })
  check("select-artifact-attempts.mjs", "rejects missing output option", ["--input-dir", input], { status: 2 })
  check("select-artifact-attempts.mjs", "rejects missing option value", ["--input-dir", input, "--output-dir"], { status: 2 })
  check("select-artifact-attempts.mjs", "rejects repeated options", ["--input-dir", input, "--input-dir", input, "--output-dir", output], { status: 2 })
}
