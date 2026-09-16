import {
  REDESIGN_BASE,
  composedOrderNeedsUiReview,
  isUiReviewPath,
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
}
