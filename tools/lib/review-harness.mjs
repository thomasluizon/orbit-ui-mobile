export const REVIEW_HARNESS_REPOSITORY = "ui"
export const REDESIGN_BASE = "redesign/main"
export const REQUIRED_REVIEW_SKILLS = ["interface-review", "better-interface"]

/** The paths whose rendered UI requires the D76 review sweep. */
export const UI_SCOPE = /^apps\/(?:web|mobile)\/(?:app|components|hooks|stores|lib)\//

export const isUiReviewPath = (path) => UI_SCOPE.test(path)

export const composedOrderNeedsUiReview = (repositoryKey, baseBranch) => (
  repositoryKey === REVIEW_HARNESS_REPOSITORY && baseBranch === REDESIGN_BASE
)
