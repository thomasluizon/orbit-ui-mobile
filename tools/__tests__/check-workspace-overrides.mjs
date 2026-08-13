import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { check, root } from "./_harness.mjs"

const writePackage = (directory, contents) => {
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, "package.json"), `${JSON.stringify(contents, null, 2)}\n`)
}

const stageRepository = (label, mobilePackage) => {
  const repository = join(root, "workspace-overrides", label)
  writePackage(repository, {
    name: "fixture-root",
    private: true,
    workspaces: ["apps/*", "packages/*", "eslint-rules"],
    overrides: { underscore: "1.13.8" },
  })
  writePackage(join(repository, "apps", "mobile"), mobilePackage)
  writePackage(join(repository, "packages", "shared"), { name: "@fixture/shared" })
  writePackage(join(repository, "eslint-rules"), { name: "@fixture/eslint-rules" })
  return repository
}

export const cases = () => {
  const cleanRepository = stageRepository("clean", { name: "@fixture/mobile" })
  check(
    "check-workspace-overrides.mjs",
    "accepts workspaces with no overrides while allowing root overrides",
    ["--root", cleanRepository],
    { status: 0 },
  )

  const offendingRepository = stageRepository("offender", {
    name: "@fixture/mobile",
    overrides: { underscore: "1.0.0" },
  })
  check(
    "check-workspace-overrides.mjs",
    "rejects workspace overrides and names the offending file",
    ["--root", offendingRepository],
    { status: 1, stderr: /root package\.json[\s\S]*apps\/mobile\/package\.json/ },
  )
}
