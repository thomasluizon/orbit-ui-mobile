import { T, check } from "./_harness.mjs"

export const cases = () => {
  check("worker-supervisor.mjs", "requires a launcher payload", [], { status: 2, stderr: /launcher-payload/ })
  T("worker-supervisor.mjs: a missing payload is refused before a worker can start", true)
}
