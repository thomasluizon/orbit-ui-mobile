import { check, T } from "./_harness.mjs"

export const cases = () => {
  check("check-worker-delivery.mjs", "requires an issue", ["--branch", "feature/orb-1", "--head", "a".repeat(40)], { status: 2, stderr: /--issue/ })
  check("check-worker-delivery.mjs", "requires a full commit SHA", ["--issue", "ORB-1", "--branch", "feature/orb-1", "--head", "short"], { status: 2, stderr: /--head/ })
  T("check-worker-delivery.mjs: an absent receipt is held", true)
}
