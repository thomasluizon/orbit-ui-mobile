import { T } from "./_harness.mjs"
import { DEGRADED_REVIEW_LINE, withDegradedReviewFirst } from "../lib/pr-body.mjs"

const TOOL = "lib/pr-body.mjs"

export const cases = () => {
  T(`${TOOL}: degraded review marker is injected as the exact first line`, withDegradedReviewFirst("Implements ORB-1\n").startsWith(`${DEGRADED_REVIEW_LINE}\n\nImplements`))
  const twice = withDegradedReviewFirst(withDegradedReviewFirst("Body"))
  T(`${TOOL}: repeated touches stay idempotent with one marker`, twice.split(DEGRADED_REVIEW_LINE).length === 2, twice)
}
