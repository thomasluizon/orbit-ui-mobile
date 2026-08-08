export const DEGRADED_REVIEW_LINE = "DEGRADED: same-vendor review"

/** Idempotently makes the degraded marker the literal first line. */
export const withDegradedReviewFirst = (body) => {
  const remainder = String(body ?? "")
    .split(/\r?\n/)
    .filter((line) => line.trim() !== DEGRADED_REVIEW_LINE)
    .join("\n")
    .trim()
  return remainder ? `${DEGRADED_REVIEW_LINE}\n\n${remainder}\n` : `${DEGRADED_REVIEW_LINE}\n`
}
