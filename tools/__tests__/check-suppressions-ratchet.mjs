import { T } from "./_harness.mjs"
import { baselineRefFrom } from "../check-suppressions-ratchet.mjs"

export const cases = async () => {
  // The historical behaviour: outside a pull_request event the field is absent and the ratchet
  // compares against main, exactly as it did before the base ref was read at all.
  T(
    "check-suppressions-ratchet: an absent GITHUB_BASE_REF falls back to origin/main",
    baselineRefFrom({}) === "origin/main",
  )
  T(
    "check-suppressions-ratchet: an empty GITHUB_BASE_REF falls back to origin/main",
    baselineRefFrom({ GITHUB_BASE_REF: "" }) === "origin/main",
  )
  T(
    "check-suppressions-ratchet: a whitespace-only GITHUB_BASE_REF falls back to origin/main",
    baselineRefFrom({ GITHUB_BASE_REF: "   " }) === "origin/main",
  )

  // A pull request into main must keep reading main, so gating the redesign branch cannot change
  // what an ordinary pull request is measured against.
  T(
    "check-suppressions-ratchet: a pull request into main still reads origin/main",
    baselineRefFrom({ GITHUB_BASE_REF: "main" }) === "origin/main",
  )

  // The reason this exists. redesign/main carries roughly 950 more suppressions than main, so a
  // fixed origin/main baseline would fail every redesign pull request against a total it never
  // shares, and the ratchet would gate nothing on the branch it was just enabled for.
  T(
    "check-suppressions-ratchet: a pull request into redesign/main reads origin/redesign/main",
    baselineRefFrom({ GITHUB_BASE_REF: "redesign/main" }) === "origin/redesign/main",
  )

  // A branch name carrying slashes survives intact rather than being split or truncated.
  T(
    "check-suppressions-ratchet: a multi-segment base branch keeps every segment",
    baselineRefFrom({ GITHUB_BASE_REF: "release/2026/08" }) === "origin/release/2026/08",
  )

  // Surrounding whitespace is trimmed, because a trailing newline is a normal way for a shell to
  // hand a value over and it would otherwise produce an unresolvable ref.
  T(
    "check-suppressions-ratchet: surrounding whitespace is trimmed from the branch name",
    baselineRefFrom({ GITHUB_BASE_REF: " redesign/main\n" }) === "origin/redesign/main",
  )

  // The value is deliberately NOT normalised beyond trimming. If GitHub ever handed over a full
  // ref rather than a bare branch name, this asserts the script does not quietly paper over it:
  // the resulting ref is wrong and visible, which is what the run log line exists to surface.
  T(
    "check-suppressions-ratchet: a full ref is passed through unnormalised rather than silently repaired",
    baselineRefFrom({ GITHUB_BASE_REF: "refs/heads/main" }) === "origin/refs/heads/main",
  )
}
