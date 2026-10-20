import {
  REDESIGN_BASE,
  UI_REVIEW_SWEEP_CONTRACT,
  composedOrderNeedsUiReview,
  isUiReviewPath,
  reviewEvidenceRequirements,
  renderUiReviewSweepContract,
} from "../lib/review-harness.mjs"

import { T } from "./_harness.mjs"

export const cases = () => {
  T(
    "lib/review-harness.mjs: redesign UI orders carry the conditional review sweep",
    composedOrderNeedsUiReview("ui", REDESIGN_BASE),
  )
  T(
    "lib/review-harness.mjs: api, landing, and main-based UI orders carry no review sweep",
    !composedOrderNeedsUiReview("api", REDESIGN_BASE) &&
      !composedOrderNeedsUiReview("landing", REDESIGN_BASE) &&
      !composedOrderNeedsUiReview("ui", "main"),
  )
  T(
    "lib/review-harness.mjs: web and mobile rendered paths share one scope",
    isUiReviewPath("apps/web/app/page.tsx") && isUiReviewPath("apps/mobile/components/card.tsx"),
  )
  T(
    "lib/review-harness.mjs: a tooling-only diff does not require the review sweep",
    !isUiReviewPath("tools/compose-prompt.mjs") && !isUiReviewPath("apps/web/e2e/smoke.ts"),
  )
  const rendered = renderUiReviewSweepContract()
  T(
    "lib/review-harness.mjs: the canonical sweep has three source families and four lanes",
    UI_REVIEW_SWEEP_CONTRACT.sourceFamilies.length === 3 &&
      UI_REVIEW_SWEEP_CONTRACT.lanes.length === 4 &&
      ["execution", "motion", "gates", "the change"].every((name) =>
        UI_REVIEW_SWEEP_CONTRACT.lanes.some((lane) => lane.name === name),
      ),
    rendered,
  )
  T(
    "lib/review-harness.mjs: the canonical sweep closes with both repository agents",
    ["design-reviewer", "completeness-critic"].every((agent) => rendered.includes(agent)),
    rendered,
  )
  const contractWithAddedLane = {
    ...UI_REVIEW_SWEEP_CONTRACT,
    lanes: [
      ...UI_REVIEW_SWEEP_CONTRACT.lanes,
      { name: "contrast", applicability: "mandatory", skills: [] },
    ],
  }
  T(
    "lib/review-harness.mjs: adding a lane automatically adds its evidence requirement",
    reviewEvidenceRequirements(contractWithAddedLane).some(({ name }) => name === "contrast lane"),
  )
}
