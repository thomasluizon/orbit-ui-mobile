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

const PERMISSION_SHAPES = /permission|not authorized|resource not accessible|forbidden|must have (?:admin|write|push)/i

export const misdirectedWriteNote = (detail, resolvedSlug) => {
  if (!PERMISSION_SHAPES.test(String(detail ?? ""))) return null
  return (
    `A permissions error on a write usually means the target belongs to another owner. ` +
    `This node resolved to ${resolvedSlug}. Confirm that is the repository you meant before any retry, ` +
    `and never retry an identifier that was not copied from output produced in this run.`
  )
}
