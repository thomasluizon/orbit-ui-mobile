const MAX_CHAIN_DEPTH = 100

export const resolveIntegrationBranch = ({ checkoutBranch, openPullRequests, headLookup }) => {
  const checkoutPullRequest = openPullRequests.find(
    (pullRequest) => pullRequest.headRefName === checkoutBranch && !pullRequest.isCrossRepository,
  )
  let candidate = checkoutPullRequest?.baseRefName ?? checkoutBranch
  const visited = new Set()

  for (let depth = 0; depth < MAX_CHAIN_DEPTH; depth += 1) {
    if (visited.has(candidate)) {
      throw new Error(`Integration branch cycle at ${candidate}`)
    }
    visited.add(candidate)

    const repositoryPullRequests = headLookup(candidate).filter((pullRequest) => !pullRequest.isCrossRepository)
    if (repositoryPullRequests.length === 0) return candidate

    const openPullRequestsForCandidate = repositoryPullRequests.filter((pullRequest) => pullRequest.state === "OPEN")
    if (openPullRequestsForCandidate.length > 1) {
      const numbers = openPullRequestsForCandidate.map((pullRequest) => pullRequest.number).sort((left, right) => left - right)
      throw new Error(`Ambiguous integration branch ${candidate}: open pull requests ${numbers.join(", ")}`)
    }

    const decidingPullRequest = openPullRequestsForCandidate[0] ?? repositoryPullRequests.reduce(
      (latest, pullRequest) => pullRequest.number > latest.number ? pullRequest : latest,
    )
    if (decidingPullRequest.state === "CLOSED") {
      throw new Error(`Integration branch unresolved at ${candidate}: pull request ${decidingPullRequest.number} closed without merging`)
    }
    candidate = decidingPullRequest.baseRefName
  }

  throw new Error(`Integration branch walk exceeded ${MAX_CHAIN_DEPTH} branches from ${checkoutBranch}`)
}
