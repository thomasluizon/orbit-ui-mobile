import { T, run } from "./_harness.mjs"

const assertionCount = (result) => {
  const match = result.stdout.match(/Assertions: (\d+) \| Elapsed: \d+\.\d{3}s/)
  return match ? Number(match[1]) : null
}

export async function cases() {
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
