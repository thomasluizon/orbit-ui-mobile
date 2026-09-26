import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { resolve } from "node:path"
import { T, run } from "./_harness.mjs"

const repositoryRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)))
const repositoryText = (path) => readFileSync(resolve(repositoryRoot, path), "utf8")

function checkProdReadinessInventory() {
  const skill = repositoryText(".claude/skills/prod-readiness/SKILL.md")
  const workflow = repositoryText(".claude/workflows/prod-readiness.mjs")
  const rubric = repositoryText(".claude/skills/pr-review/rubric.md")
  const table = skill.match(/\| # \| Inventory item \| Kind \| Owner of the analysis \|[\s\S]*?(?=\n\n)/)?.[0] ?? ""
  const rows = [...table.matchAll(/^\| (\d+) \| ([^|]+) \| ([^|]+) \|/gm)]
    .map(([, number, name, kind]) => ({ number: Number(number), name: name.trim(), kind: kind.trim() }))
  const opsSource = workflow.split("const OPS_CHECKS = [")[1]?.split("const A11Y_LADDER")[0] ?? ""
  const workflowOps = [...opsSource.matchAll(/check: '([^']+)'/g)].map(([, check]) => check)
  const tableOps = rows.filter(({ kind, name }) => kind === "ops check" && !["Backups", "Paid-API cost caps + spend alerts"].includes(name))
    .map(({ name }) => name.toLowerCase().replace(/ readiness$/, "").replaceAll(" ", "-"))
  const output = skill.match(/^\*\*Inventory \((\d+)\)\*\*: (.+)$/m)
  const outputNames = output?.[2].split(" · ").map((item) => item.split(" {")[0]) ?? []

  T("prod-readiness: inventory rows stay sequential", rows.length > 0 && rows.every((row, index) => row.number === index + 1))
  T("prod-readiness: workflow ops checks match the active inventory", JSON.stringify(workflowOps) === JSON.stringify(tableOps),
    `workflow=${workflowOps.join(",")} inventory=${tableOps.join(",")}`)
  T("prod-readiness: Phase 4 names every inventory item in order", Number(output?.[1]) === rows.length &&
    JSON.stringify(outputNames) === JSON.stringify(rows.map(({ name }) => name)),
    `output=${outputNames.join(",")} inventory=${rows.map(({ name }) => name).join(",")}`)
  T("prod-readiness: shared-resource review reaches the canonical checklist", rows[12]?.name === "Concurrency" &&
    rubric.includes("`.claude/skills/prod-readiness/SKILL.md` inventory item 13"))
}

const assertionCount = (result) => {
  const match = result.stdout.match(/Assertions: (\d+) \| Elapsed: \d+\.\d{3}s/)
  return match ? Number(match[1]) : null
}

const talliedRows = (result) => {
  const table = result.stdout.split("# assertion coverage")[1] ?? ""
  return [...table.matchAll(/^\s*(\d+)\s+(\S+)$/gm)].map(([, count, tool]) => ({ tool, count: Number(count) }))
}

export async function cases() {
  checkProdReadinessInventory()
  const focused = run("test-tools.mjs", ["--only", "bounded-process"])
  T("test-tools.mjs: --only runs the named case module", focused.status === 0, focused.stderr || focused.stdout)
  T(
    "test-tools.mjs: --only runs no unselected case module",
    /^\s*\d+\s+lib\/bounded-process\.mjs$/m.test(focused.stdout) &&
      !/^\s*\d+\s+lib\/manual-steps\.mjs$/m.test(focused.stdout),
    focused.stdout,
  )
  T(
    "test-tools.mjs: a focused success keeps the gate verdict and prints its measurements",
    /ORBIT TOOLS GATE OK/.test(focused.stdout) && assertionCount(focused) !== null,
    focused.stdout,
  )


  const rows = talliedRows(focused)
  const rowSum = rows.reduce((total, row) => total + row.count, 0)
  T(
    "test-tools.mjs: the printed tally rows sum to the reported assertion count",
    rows.length > 0 && rowSum === assertionCount(focused),
    `rows ${rows.map((row) => `${row.tool}=${row.count}`).join(" ")} sum to ${rowSum}, reported ${assertionCount(focused)}`,
  )

  const repeated = run("test-tools.mjs", ["--only", "bounded-process", "--only", "manual-steps"])
  T("test-tools.mjs: repeatable --only accepts two case modules", repeated.status === 0, repeated.stderr || repeated.stdout)
  T(
    "test-tools.mjs: repeatable --only runs both named modules",
    /^\s*\d+\s+lib\/bounded-process\.mjs$/m.test(repeated.stdout) &&
      /^\s*\d+\s+lib\/manual-steps\.mjs$/m.test(repeated.stdout),
    repeated.stdout,
  )
  T(
    "test-tools.mjs: selecting another module increases the printed assertion count",
    assertionCount(repeated) > assertionCount(focused),
    `focused ${assertionCount(focused)}, repeated ${assertionCount(repeated)}`,
  )

  const unknown = run("test-tools.mjs", ["--only", "not-a-case"])
  T("test-tools.mjs: an unknown --only name exits 2", unknown.status === 2, unknown.stderr || unknown.stdout)
  T(
    "test-tools.mjs: an unknown --only name prints the valid set",
    /unknown case module\(s\): not-a-case/.test(unknown.stderr) &&
      /Valid case modules: .*bounded-process.*reseed-calibration/.test(unknown.stderr),
    unknown.stderr,
  )
  T(
    "test-tools.mjs: a usage error still prints elapsed time and an assertion count",
    assertionCount(unknown) === 0,
    unknown.stdout,
  )

  const help = run("test-tools.mjs", ["--help"])
  T(
    "test-tools.mjs: help exits 0 and prints elapsed time and an assertion count",
    help.status === 0 && /usage: test-tools\.mjs/.test(help.stdout) && assertionCount(help) === 0,
    help.stderr || help.stdout,
  )
}
