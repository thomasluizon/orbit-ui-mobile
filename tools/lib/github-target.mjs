/**
 * Prove that a caller-supplied GitHub node id points at the repository the caller named, BEFORE
 * any write.
 *
 * WHY this module exists, measured 2026-08-08. The orchestrator passed
 * `--thread PRRT_kwDOR5Siws6XdcAt` to tools/resolve-bot-thread.mjs. That id was never read from
 * any output. It was typed, with a shell `||` fallback to "try listing fresh if it fails". GraphQL
 * node ids are GLOBALLY unique, and `--repo` selected only the token, so the id alone chose the
 * target. It resolved to a live CodeRabbit thread on a stranger's public repository and posted a
 * reply there under Thomas's account.
 *
 * The lesson is not "validate the prefix". The id was correctly shaped. The lesson is that a node
 * id names a target and a repository key names a different target, and nothing compared them.
 *
 * Pure on purpose: the caller owns the GraphQL call, this module owns the verdict, so the rule is
 * unit-testable without a network.
 */

/** Two slugs name the same repository when they differ only in case. GitHub is case-insensitive
 * on owner and name, so a case difference is not a misdirection and must not read as one. */
const sameRepository = (left, right) =>
  typeof left === "string" && typeof right === "string" && left.trim() !== "" && left.trim().toLowerCase() === right.trim().toLowerCase()

/**
 * @param options `{ nodeId, expectedSlug, resolvedSlug }`. `resolvedSlug` is
 *   `repository.nameWithOwner` as GitHub returned it, or null when the node did not resolve.
 * @returns `{ ok: true, slug }` or `{ ok: false, message }`. A node that cannot be resolved is a
 *   refusal, never a pass: an unresolvable id proves nothing about where a write would land.
 */
export const nodeTargetVerdict = ({ nodeId, expectedSlug, resolvedSlug }) => {
  if (typeof expectedSlug !== "string" || expectedSlug.trim() === "") {
    return { ok: false, message: `the target repository for ${nodeId} could not be resolved from the configured checkout, so no write may be attempted` }
  }
  if (typeof resolvedSlug !== "string" || resolvedSlug.trim() === "") {
    return {
      ok: false,
      message:
        `${nodeId} did not resolve to a review thread on GitHub, so its target repository is unknown and nothing was written. ` +
        `An id that resolves to nothing is usually an id that was typed rather than copied from a listing produced in this run.`,
    }
  }
  if (!sameRepository(resolvedSlug, expectedSlug)) {
    return {
      ok: false,
      message:
        `${nodeId} belongs to ${resolvedSlug}, not to ${expectedSlug}. Nothing was written.\n` +
        `GitHub node ids are globally unique, so a wrong id is not a failed lookup: it is a live target in somebody else's repository. ` +
        `Re-run tools/list-bot-threads.mjs for the pull request you mean and copy the id from that output.`,
    }
  }
  return { ok: true, slug: resolvedSlug }
}

/**
 * GitHub answers a write aimed at a repository you cannot write to with a permissions error, never
 * with "wrong repository". On 2026-08-08 that exact message,
 * "thomasluizon does not have the correct permissions to execute ResolveReviewThread", was logged
 * as a transient glitch and retried. The wrong diagnosis cost as much as the wrong id, so the tool
 * now names the resolved target in the error rather than leaving the reader to guess.
 */
const PERMISSION_SHAPES = /permission|not authorized|resource not accessible|forbidden|must have (?:admin|write|push)/i

export const misdirectedWriteNote = (detail, resolvedSlug) => {
  if (!PERMISSION_SHAPES.test(String(detail ?? ""))) return null
  return (
    `A permissions error on a write usually means the target belongs to another owner. ` +
    `This node resolved to ${resolvedSlug}. Confirm that is the repository you meant before any retry, ` +
    `and never retry an identifier that was not copied from output produced in this run.`
  )
}
