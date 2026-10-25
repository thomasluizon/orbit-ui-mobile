import {
  UI_REVIEW_SWEEP_CONTRACT,
  reviewEvidenceRequirements,
  renderReviewEvidenceBlock,
} from "../lib/review-harness.mjs"

import { T } from "./_harness.mjs"

export const cases = () => {
  const rendered = renderReviewEvidenceBlock()
  T(
    "lib/review-harness.mjs: explicit batch evidence retains four lanes",
    UI_REVIEW_SWEEP_CONTRACT.lanes.length === 4 &&
      ["execution", "motion", "gates", "the change"].every((name) =>
        UI_REVIEW_SWEEP_CONTRACT.lanes.some((lane) => lane.name === name),
      ),
    rendered,
  )
  T(
    "lib/review-harness.mjs: explicit batch evidence retains both close-gate agents",
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
