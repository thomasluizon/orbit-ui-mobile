import { misdirectedWriteNote, nodeTargetVerdict } from "../lib/github-target.mjs"

import { T } from "./_harness.mjs"

const UNIT = "lib/github-target.mjs"
const THREAD = "PRRT_kwDOR5Siws6XdcAt"
const OURS = "thomasluizon/orbit-ui-mobile"
const THEIRS = "benhook1013/FireMUD"

export const cases = () => {
  /**
   * THE case, and the one the whole module exists for. This is the real 2026-08-08 pairing: the
   * typed id resolved, it just resolved somewhere else. A verdict that passed here would have let
   * the reply land on a stranger's pull request again.
   */
  const foreign = nodeTargetVerdict({ nodeId: THREAD, expectedSlug: OURS, resolvedSlug: THEIRS })
  T(
    `${UNIT}: a node belonging to another repository is refused`,
    foreign.ok === false && foreign.message.includes(THEIRS) && foreign.message.includes(OURS),
    JSON.stringify(foreign),
  )
  T(
    `${UNIT}: the refusal names BOTH the expected and the actual repository`,
    foreign.ok === false && foreign.message.indexOf(THEIRS) < foreign.message.indexOf(OURS),
    "the message must read 'belongs to <actual>, not to <expected>' so the reader can tell them apart",
  )

  const ours = nodeTargetVerdict({ nodeId: THREAD, expectedSlug: OURS, resolvedSlug: OURS })
  T(`${UNIT}: a node in the named repository is allowed`, ours.ok === true && ours.slug === OURS, JSON.stringify(ours))

  /** GitHub is case-insensitive on owner and name, so a case difference is not a misdirection. A
   * verdict that called it one would refuse legitimate writes and teach everyone to bypass this. */
  const cased = nodeTargetVerdict({ nodeId: THREAD, expectedSlug: "ThomasLuizon/Orbit-UI-Mobile", resolvedSlug: OURS })
  T(`${UNIT}: a case difference in the slug is not a misdirection`, cased.ok === true, JSON.stringify(cased))

  /**
   * An unresolvable node must REFUSE, never pass. This is the fail-closed half: an id that resolves
   * to nothing proves nothing about where a write would land, and it is the exact shape of an id
   * that was typed rather than copied.
   */
  for (const [label, resolvedSlug] of [["null", null], ["undefined", undefined], ["empty", "   "]]) {
    const missing = nodeTargetVerdict({ nodeId: THREAD, expectedSlug: OURS, resolvedSlug })
    T(`${UNIT}: a node that resolves to ${label} is refused, not allowed`, missing.ok === false && /did not resolve/.test(missing.message), JSON.stringify(missing))
  }

  const noExpectation = nodeTargetVerdict({ nodeId: THREAD, expectedSlug: "", resolvedSlug: OURS })
  T(`${UNIT}: an unresolvable EXPECTED slug is refused too`, noExpectation.ok === false, JSON.stringify(noExpectation))

  /**
   * The wrong diagnosis cost as much as the wrong id. GitHub answers a write aimed at a repository
   * you cannot write to with a permissions error, and on 2026-08-08 that was recorded as a
   * transient glitch and retried.
   */
  const permission = misdirectedWriteNote("thomasluizon does not have the correct permissions to execute ResolveReviewThread", THEIRS)
  T(
    `${UNIT}: the live permissions error is recognised and names the resolved target`,
    typeof permission === "string" && permission.includes(THEIRS) && /another owner/.test(permission),
    String(permission),
  )
  for (const detail of ["Resource not accessible by integration", "You must have admin rights", "Forbidden", "not authorized"]) {
    T(`${UNIT}: "${detail}" is recognised as a permissions shape`, typeof misdirectedWriteNote(detail, OURS) === "string", "returned null")
  }
  T(`${UNIT}: an ordinary error gets no misdirection note`, misdirectedWriteNote("thread already resolved", OURS) === null, "a note on every error would train the reader to ignore it")
  T(`${UNIT}: an absent error detail gets no note`, misdirectedWriteNote(null, OURS) === null, "returned a note for a null detail")
}
