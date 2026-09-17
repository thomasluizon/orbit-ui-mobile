import { resolveIntegrationBranch } from "../lib/integration-branch.mjs"
import { T } from "./_harness.mjs"

const pullRequest = (overrides = {}) => ({
  number: 1,
  headRefName: "feature/x",
  baseRefName: "redesign/main",
  state: "OPEN",
  isCrossRepository: false,
  ...overrides,
})

export const cases = () => {
  const fork = pullRequest({ baseRefName: "someone-elses-branch", isCrossRepository: true })
  const forkOnlyResult = resolveIntegrationBranch({
    checkoutBranch: "feature/x",
    openPullRequests: [fork],
    headLookup: (candidate) => candidate === "feature/x" ? [fork] : [],
  })
  T(
    "integration-branch.mjs: a fork-only checkout starts from the checkout branch",
    forkOnlyResult === "feature/x",
    `resolved ${forkOnlyResult} instead of feature/x`,
  )

  const chain = new Map([
    ["feature/parent", [pullRequest({ number: 20, headRefName: "feature/parent", baseRefName: "redesign/main" })]],
    ["redesign/main", []],
  ])
  const stackedResult = resolveIntegrationBranch({
    checkoutBranch: "feature/child",
    openPullRequests: [pullRequest({ number: 21, headRefName: "feature/child", baseRefName: "feature/parent" })],
    headLookup: (candidate) => chain.get(candidate) ?? [],
  })
  T("integration-branch.mjs: a normal stacked chain reaches its integration branch", stackedResult === "redesign/main", stackedResult)

  const noPullRequestResult = resolveIntegrationBranch({
    checkoutBranch: "feature/unpublished",
    openPullRequests: [],
    headLookup: () => [],
  })
  T("integration-branch.mjs: a checkout with no pull request resolves to itself", noPullRequestResult === "feature/unpublished", noPullRequestResult)

  const forkParentResult = resolveIntegrationBranch({
    checkoutBranch: "feature/child",
    openPullRequests: [pullRequest({ headRefName: "feature/child", baseRefName: "feature/parent" })],
    headLookup: () => [pullRequest({ headRefName: "feature/parent", baseRefName: "stranger/main", isCrossRepository: true })],
  })
  T("integration-branch.mjs: a candidate owned only by forks terminates the walk", forkParentResult === "feature/parent", forkParentResult)

  const reusedWithOpenResult = resolveIntegrationBranch({
    checkoutBranch: "feature/reused",
    openPullRequests: [],
    headLookup: (candidate) => candidate === "feature/reused" ? [
      pullRequest({ number: 30, state: "CLOSED", baseRefName: "oldest" }),
      pullRequest({ number: 31, state: "OPEN", baseRefName: "live-base" }),
      pullRequest({ number: 32, state: "MERGED", baseRefName: "newest" }),
    ] : [],
  })
  T("integration-branch.mjs: one OPEN reuse decides regardless of number", reusedWithOpenResult === "live-base", reusedWithOpenResult)

  const reusedWithoutOpenResult = resolveIntegrationBranch({
    checkoutBranch: "feature/reused",
    openPullRequests: [],
    headLookup: (candidate) => candidate === "feature/reused" ? [
      pullRequest({ number: 40, state: "MERGED", baseRefName: "older-base" }),
      pullRequest({ number: 42, state: "MERGED", baseRefName: "latest-base" }),
      pullRequest({ number: 41, state: "MERGED", baseRefName: "middle-base" }),
    ] : [],
  })
  T("integration-branch.mjs: the highest number decides when no reuse is OPEN", reusedWithoutOpenResult === "latest-base", reusedWithoutOpenResult)

  let ambiguityMessage = ""
  try {
    resolveIntegrationBranch({
      checkoutBranch: "feature/ambiguous",
      openPullRequests: [],
      headLookup: () => [pullRequest({ number: 50 }), pullRequest({ number: 51 })],
    })
  } catch (error) {
    ambiguityMessage = error.message
  }
  T(
    "integration-branch.mjs: two OPEN rows throw and name the candidate and numbers",
    /feature\/ambiguous/.test(ambiguityMessage) && /50/.test(ambiguityMessage) && /51/.test(ambiguityMessage),
    ambiguityMessage,
  )

  let cycleMessage = ""
  try {
    resolveIntegrationBranch({
      checkoutBranch: "feature/a",
      openPullRequests: [],
      headLookup: (candidate) => candidate === "feature/a"
        ? [pullRequest({ headRefName: "feature/a", baseRefName: "feature/b" })]
        : [pullRequest({ headRefName: "feature/b", baseRefName: "feature/a" })],
    })
  } catch (error) {
    cycleMessage = error.message
  }
  T("integration-branch.mjs: a cycle throws instead of hanging", /cycle/.test(cycleMessage) && /feature\/a/.test(cycleMessage), cycleMessage)
}
