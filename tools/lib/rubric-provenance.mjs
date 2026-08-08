/**
 * Prove which rubric an independent review actually read, and that the reviewer could not have
 * substituted one.
 *
 * WHY, measured 2026-08-08. The receipt required `review.rubricBaseOid === receipt.currentBaseSha`:
 * the rubric must be materialized from the pull request's OWN base commit. That is right for
 * orbit-ui-mobile and orbit-api, which both carry `.claude/skills/pr-review/rubric.md`.
 * orbit-landing-page has NO `.claude` tree, at HEAD or at any base, so the field could be satisfied
 * only by asserting a base whose commit does not contain the rubric. It was refused four times
 * rather than fabricated, and landing #56, #57, #58 and #59 all reported REVIEW_STALE while being
 * complete on every other dimension.
 *
 * The fix is to make the binding explicit and still falsifiable. Two bindings, and the check is the
 * same shape in both: the snapshot the reviewer read must be the committed rubric, byte for byte.
 *
 *   own-base        the pull request's repository carries the rubric. rubricCommitOid must be the
 *                   pull request's current base. Unchanged strength.
 *   canonical-main  the repository carries no rubric, so the review binds to the CANONICAL copy in
 *                   another repository. rubricCommitOid must be that repository's current
 *                   origin/main, which is what makes a stale rubric fail.
 *
 * Line endings are normalized on both sides before hashing. `git cat-file blob` always emits LF,
 * while a snapshot written by a checkout can carry CRLF, and comparing those raw would rebuild the
 * exact defect that stood 76 tickets down the same night.
 */

import { createHash } from "node:crypto"

export const RUBRIC_PATH = ".claude/skills/pr-review/rubric.md"

/** The repository that owns the single source of the rubric. Everything else mirrors it. */
export const CANONICAL_RUBRIC_REPO = "ui"

const OID = /^[0-9a-f]{40}$/

const normalized = (bytes) => Buffer.from(bytes).toString("utf8").replaceAll("\r\n", "\n")

export const rubricDigest = (bytes) => createHash("sha256").update(normalized(bytes)).digest("hex")

/**
 * @param claim the review artifact's provenance fields
 * @param facts `{ prBaseSha, prRepoHasRubricAtBase, rubricRepoKey, blobAtClaimedCommit,
 *   canonicalMainBlob, snapshotBytes, blobBytes }` gathered by the caller with git
 * @returns `{ ok: true, binding, digest }` or `{ ok: false, reason }`
 */
export const rubricProvenanceVerdict = (claim, facts) => {
  const { rubricRepositoryKey, rubricCommitOid, rubricBlobOid } = claim ?? {}
  if (typeof rubricRepositoryKey !== "string" || rubricRepositoryKey === "") return { ok: false, reason: "review artifact names no rubricRepositoryKey" }
  if (typeof rubricCommitOid !== "string" || !OID.test(rubricCommitOid)) return { ok: false, reason: "review artifact carries no full 40-character rubricCommitOid" }
  if (typeof rubricBlobOid !== "string" || !OID.test(rubricBlobOid)) return { ok: false, reason: "review artifact carries no full 40-character rubricBlobOid" }

  const binding = facts.prRepoHasRubricAtBase ? "own-base" : "canonical-main"

  if (binding === "own-base") {
    if (rubricRepositoryKey !== facts.prRepoKey) {
      return { ok: false, reason: `${facts.prRepoKey} carries the rubric at its own base, so the review must bind to it, not to ${rubricRepositoryKey}` }
    }
    if (rubricCommitOid !== facts.prBaseSha) {
      return { ok: false, reason: `the rubric must come from this pull request's own base ${facts.prBaseSha}, but the review claims ${rubricCommitOid}` }
    }
  } else {
    if (rubricRepositoryKey !== CANONICAL_RUBRIC_REPO) {
      return { ok: false, reason: `${facts.prRepoKey} carries no rubric at its base, so the review must bind to the canonical copy in ${CANONICAL_RUBRIC_REPO}, not to ${rubricRepositoryKey}` }
    }
    /** Currency is the whole reason this binding is safe. Without it a landing review could cite any
     * commit that ever contained a rubric, including one superseded months ago. */
    if (typeof facts.canonicalMainBlob !== "string" || !OID.test(facts.canonicalMainBlob)) {
      return { ok: false, reason: `the canonical rubric blob on ${CANONICAL_RUBRIC_REPO} origin/main could not be read, so currency cannot be proven` }
    }
    if (rubricBlobOid !== facts.canonicalMainBlob) {
      return { ok: false, reason: `the review read rubric blob ${rubricBlobOid}, but ${CANONICAL_RUBRIC_REPO} origin/main now carries ${facts.canonicalMainBlob}; the review is stale against the current rubric` }
    }
  }

  if (facts.blobAtClaimedCommit !== rubricBlobOid) {
    return { ok: false, reason: `${rubricCommitOid} does not carry rubric blob ${rubricBlobOid} at ${RUBRIC_PATH}; it carries ${facts.blobAtClaimedCommit ?? "nothing"}` }
  }

  /** THE check that makes a hand-edited snapshot fail. Everything above proves which blob was
   * claimed; this proves the reviewer actually read that blob's content. */
  if (!facts.snapshotBytes || !facts.blobBytes) return { ok: false, reason: "the materialized rubric snapshot or its committed blob could not be read" }
  const snapshotDigest = rubricDigest(facts.snapshotBytes)
  if (snapshotDigest !== rubricDigest(facts.blobBytes)) {
    return { ok: false, reason: `the materialized rubric snapshot does not match blob ${rubricBlobOid}; the reviewer did not read the committed rubric` }
  }

  return { ok: true, binding, digest: snapshotDigest }
}
