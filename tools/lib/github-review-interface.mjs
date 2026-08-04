const PULL_REQUEST_KEYS = [
  "author",
  "baseRefName",
  "body",
  "files",
  "headRefName",
  "headRefOid",
  "isDraft",
  "labels",
  "number",
  "state",
  "statusCheckRollup",
  "title",
]

const CHECK_RUN_KEYS = ["__typename", "completedAt", "conclusion", "detailsUrl", "name", "startedAt", "status", "workflowName"]
const STATUS_CONTEXT_KEYS = ["__typename", "context", "startedAt", "state", "targetUrl"]

const hasExactKeys = (value, expectedKeys) => {
  const actualKeys = Object.keys(value).sort()
  const sortedExpectedKeys = [...expectedKeys].sort()
  return actualKeys.length === sortedExpectedKeys.length && actualKeys.every((key, index) => key === sortedExpectedKeys[index])
}

const isNullableString = (value) => value === null || typeof value === "string"

const isStatusCheckRollupItem = (check) => {
  if (!check || typeof check !== "object" || Array.isArray(check) || typeof check.__typename !== "string") return false
  if (check.__typename === "CheckRun") {
    return hasExactKeys(check, CHECK_RUN_KEYS) &&
      typeof check.name === "string" &&
      typeof check.status === "string" &&
      isNullableString(check.completedAt) &&
      isNullableString(check.conclusion) &&
      isNullableString(check.detailsUrl) &&
      isNullableString(check.startedAt) &&
      isNullableString(check.workflowName)
  }
  if (check.__typename === "StatusContext") {
    return hasExactKeys(check, STATUS_CONTEXT_KEYS) &&
      typeof check.context === "string" &&
      typeof check.startedAt === "string" &&
      typeof check.state === "string" &&
      typeof check.targetUrl === "string"
  }
  return false
}

const parseObject = (output, label) => {
  let payload
  try {
    payload = JSON.parse(output)
  } catch (error) {
    throw new Error(`${label} returned unparseable JSON: ${error.message}`)
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error(`${label} returned a non-object resource`)
  return payload
}

export const validateGitHubPullRequestPayload = (payload, { pullRequest, base }) => {
  const expectedKeys = PULL_REQUEST_KEYS
  const actualKeys = Object.keys(payload).sort()
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    throw new Error(`live GitHub pull request envelope keys are ${actualKeys.join(", ") || "absent"}; expected exactly ${expectedKeys.join(", ")}`)
  }
  if (typeof payload.baseRefName !== "string" || !payload.baseRefName) {
    throw new Error("live GitHub pull request envelope lacks string baseRefName")
  }
  if (typeof payload.headRefOid !== "string" || !/^[0-9a-f]{40}$/.test(payload.headRefOid)) {
    throw new Error("live GitHub pull request envelope lacks a valid headRefOid")
  }
  if (typeof payload.state !== "string") {
    throw new Error("live GitHub pull request envelope lacks string state")
  }
  if (!Number.isSafeInteger(payload.number) || payload.number !== pullRequest) {
    throw new Error("live GitHub pull request envelope lacks the requested pull request number")
  }
  if (typeof payload.title !== "string" || typeof payload.body !== "string" || typeof payload.headRefName !== "string") {
    throw new Error("live GitHub pull request envelope lacks complete title, body, or headRefName data")
  }
  if (!payload.author || typeof payload.author !== "object" || Array.isArray(payload.author) || typeof payload.author.login !== "string") {
    throw new Error("live GitHub pull request envelope lacks a complete author object")
  }
  if (!Array.isArray(payload.files) || payload.files.some((file) =>
    !file || typeof file !== "object" || Array.isArray(file) ||
    typeof file.path !== "string" || typeof file.changeType !== "string" ||
    !Number.isSafeInteger(file.additions) || !Number.isSafeInteger(file.deletions))) {
    throw new Error("live GitHub pull request envelope lacks a complete files array")
  }
  if (!Array.isArray(payload.labels) || payload.labels.some((label) =>
    !label || typeof label !== "object" || Array.isArray(label) ||
    typeof label.id !== "string" || typeof label.name !== "string" ||
    typeof label.color !== "string" || (label.description !== null && typeof label.description !== "string"))) {
    throw new Error("live GitHub pull request envelope lacks a complete labels array")
  }
  if (!Array.isArray(payload.statusCheckRollup) || payload.statusCheckRollup.some((check) => !isStatusCheckRollupItem(check))) {
    throw new Error("live GitHub pull request envelope lacks a complete statusCheckRollup array")
  }
  if (typeof payload.isDraft !== "boolean") throw new Error("live GitHub pull request envelope lacks boolean isDraft")
  if (payload.state !== "OPEN") {
    throw new Error(`pull request state is ${payload.state}, expected OPEN`)
  }
  if (payload.baseRefName !== base) {
    throw new Error(`--base names ${base}, but the live pull request base is ${payload.baseRefName}`)
  }
  return payload
}

export const parseGitHubPullRequest = (output, expected) =>
  validateGitHubPullRequestPayload(parseObject(output, "live GitHub pull request envelope"), expected)

export const validateGitHubReviewResourcePayload = (payload, label) => {
  if (!Number.isSafeInteger(payload.id) || payload.id <= 0) throw new Error(`${label} returned no numeric review id`)
  if (typeof payload.node_id !== "string" || !payload.node_id) throw new Error(`${label} returned no immutable review node id`)
  if (typeof payload.body !== "string" || typeof payload.commit_id !== "string" || typeof payload.state !== "string" || typeof payload.submitted_at !== "string") {
    throw new Error(`${label} returned an incomplete review resource`)
  }
  return payload
}

export const parseGitHubReviewResource = (output, label) =>
  validateGitHubReviewResourcePayload(parseObject(output, label), label)

export const pullRequestHead = (pullRequest) => pullRequest.headRefOid

export const reviewId = (review) => review.id

export const reviewNodeId = (review) => review.node_id

export const reviewPreservesIdentity = (updatedReview, submittedReview, expectedCommit, expectedBody) =>
  updatedReview.node_id === submittedReview.node_id &&
  updatedReview.commit_id === expectedCommit &&
  updatedReview.body === expectedBody
