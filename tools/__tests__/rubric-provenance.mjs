import { CANONICAL_RUBRIC_REPO, rubricProvenanceVerdict } from "../lib/rubric-provenance.mjs"

import { T } from "./_harness.mjs"

const UNIT = "lib/rubric-provenance.mjs"
const BASE = "1111111111111111111111111111111111111111"
const OTHER = "2222222222222222222222222222222222222222"
const BLOB = "3333333333333333333333333333333333333333"
const NEWER_BLOB = "4444444444444444444444444444444444444444"
const RUBRIC = "# rubric\n\nrule one\n"

const ownBase = (claim = {}, facts = {}) =>
  rubricProvenanceVerdict(
    { rubricRepositoryKey: "ui", rubricCommitOid: BASE, rubricBlobOid: BLOB, ...claim },
    { prRepoKey: "ui", prBaseSha: BASE, prRepoHasRubricAtBase: true, blobAtClaimedCommit: BLOB, canonicalMainBlob: BLOB, snapshotBytes: RUBRIC, blobBytes: RUBRIC, ...facts },
  )

const canonical = (claim = {}, facts = {}) =>
  rubricProvenanceVerdict(
    { rubricRepositoryKey: CANONICAL_RUBRIC_REPO, rubricCommitOid: OTHER, rubricBlobOid: BLOB, ...claim },
    { prRepoKey: "landing", prBaseSha: BASE, prRepoHasRubricAtBase: false, blobAtClaimedCommit: BLOB, canonicalMainBlob: BLOB, snapshotBytes: RUBRIC, blobBytes: RUBRIC, ...facts },
  )

export const cases = () => {
  T(`${UNIT}: a review bound to its own base passes and reports own-base`, ownBase().ok === true && ownBase().binding === "own-base", JSON.stringify(ownBase()))

  /**
   * THE landing case. orbit-landing-page has no .claude tree at HEAD or at any base, so the old
   * rule was unsatisfiable and #56, #57, #58 and #59 all reported REVIEW_STALE while being complete
   * on every other dimension. The field was refused four times rather than fabricated.
   */
  T(`${UNIT}: a repository with no rubric binds to the canonical copy and passes`, canonical().ok === true && canonical().binding === "canonical-main", JSON.stringify(canonical()))

  /** The receipt must stay falsifiable. Each of these is a way a dishonest or stale review could
   * otherwise reach READY. */
  T(
    `${UNIT}: an own-base review citing a DIFFERENT commit is refused`,
    ownBase({ rubricCommitOid: OTHER }).ok === false && /own base/.test(ownBase({ rubricCommitOid: OTHER }).reason),
    JSON.stringify(ownBase({ rubricCommitOid: OTHER })),
  )
  T(
    `${UNIT}: an own-base review binding to another repository is refused`,
    ownBase({ rubricRepositoryKey: "landing" }).ok === false,
    JSON.stringify(ownBase({ rubricRepositoryKey: "landing" })),
  )
  T(
    `${UNIT}: a STALE canonical rubric is refused, so currency is real`,
    canonical({}, { canonicalMainBlob: NEWER_BLOB }).ok === false && /stale against the current rubric/.test(canonical({}, { canonicalMainBlob: NEWER_BLOB }).reason),
    JSON.stringify(canonical({}, { canonicalMainBlob: NEWER_BLOB })),
  )
  T(
    `${UNIT}: a canonical binding to a repository other than the canonical one is refused`,
    canonical({ rubricRepositoryKey: "api" }).ok === false,
    JSON.stringify(canonical({ rubricRepositoryKey: "api" })),
  )
  T(
    `${UNIT}: an unreadable canonical blob is refused rather than skipped`,
    canonical({}, { canonicalMainBlob: null }).ok === false && /currency cannot be proven/.test(canonical({}, { canonicalMainBlob: null }).reason),
    JSON.stringify(canonical({}, { canonicalMainBlob: null })),
  )
  T(
    `${UNIT}: a commit that does not carry the claimed blob is refused`,
    ownBase({}, { blobAtClaimedCommit: NEWER_BLOB }).ok === false && /does not carry rubric blob/.test(ownBase({}, { blobAtClaimedCommit: NEWER_BLOB }).reason),
    JSON.stringify(ownBase({}, { blobAtClaimedCommit: NEWER_BLOB })),
  )

  /** THE hand-edited-snapshot case. Everything above proves which blob was CLAIMED; this proves the
   * reviewer read that blob's content. */
  T(
    `${UNIT}: a snapshot whose content differs from the blob is refused`,
    ownBase({}, { snapshotBytes: `${RUBRIC}and a rule the reviewer added\n` }).ok === false &&
      /did not read the committed rubric/.test(ownBase({}, { snapshotBytes: `${RUBRIC}and a rule the reviewer added\n` }).reason),
    JSON.stringify(ownBase({}, { snapshotBytes: `${RUBRIC}and a rule the reviewer added\n` })),
  )
  T(`${UNIT}: a missing snapshot is refused`, ownBase({}, { snapshotBytes: null }).ok === false, JSON.stringify(ownBase({}, { snapshotBytes: null })))
  T(`${UNIT}: a missing blob is refused`, ownBase({}, { blobBytes: null }).ok === false, JSON.stringify(ownBase({}, { blobBytes: null })))

  /**
   * Line endings are normalized before hashing. Comparing raw would rebuild the exact defect that
   * stood 76 tickets down the same night: `git cat-file blob` always emits LF, while a snapshot
   * written by a Windows checkout carries CRLF, from byte-identical content.
   */
  T(
    `${UNIT}: a CRLF snapshot of an LF blob still passes`,
    ownBase({}, { snapshotBytes: RUBRIC.replaceAll("\n", "\r\n") }).ok === true,
    JSON.stringify(ownBase({}, { snapshotBytes: RUBRIC.replaceAll("\n", "\r\n") })),
  )

  for (const [label, claim] of [
    ["no rubricRepositoryKey", { rubricRepositoryKey: undefined }],
    ["a short rubricCommitOid", { rubricCommitOid: "abc1234" }],
    ["a short rubricBlobOid", { rubricBlobOid: "abc1234" }],
  ]) {
    T(`${UNIT}: ${label} is refused before anything else is judged`, ownBase(claim).ok === false, JSON.stringify(ownBase(claim)))
  }
}
