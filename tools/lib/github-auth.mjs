/** Per-process GitHub authentication. Never mutates the globally active gh account. */

import { execFileSync } from "node:child_process"

const slugFromRemote = (remote) => {
  const normalized = String(remote).trim().replaceAll("\\", "/")
  const match = /github\.com(?::|\/)([^/]+\/[^/]+?)(?:\.git)?$/i.exec(normalized)
  return match?.[1] ?? null
}

export const repositorySlug = (repoPath, gitBin = process.env.GIT_BIN || "git", environment = process.env) => {
  let remote
  try {
    remote = execFileSync(gitBin, ["-C", repoPath, "remote", "get-url", "origin"], { encoding: "utf8", env: environment, stdio: ["ignore", "pipe", "pipe"] })
  } catch (error) {
    throw new Error(`could not read origin for ${repoPath}: ${(error.stderr?.toString() || error.message).trim()}`)
  }
  const slug = slugFromRemote(remote)
  if (!slug) throw new Error(`origin for ${repoPath} is not an unambiguous GitHub repository URL`)
  return slug
}

export const repositoryOwner = (repoPath, gitBin = process.env.GIT_BIN || "git", environment = process.env) => repositorySlug(repoPath, gitBin, environment).split("/")[0]

export const githubEnvironment = (repoPath, { ghBin = process.env.GH_BIN || "gh", gitBin = process.env.GIT_BIN || "git", environment = process.env, timeoutMs = 30000 } = {}) => {
  const owner = repositoryOwner(repoPath, gitBin, environment)
  let token
  try {
    token = execFileSync(ghBin, ["auth", "token", "--user", owner], { encoding: "utf8", env: environment, stdio: ["ignore", "pipe", "pipe"], timeout: timeoutMs }).trim()
  } catch (error) {
    throw new Error(`could not resolve a GitHub token for target owner ${owner}: ${(error.stderr?.toString() || error.message).trim()}`)
  }
  if (!token) throw new Error(`gh auth token returned no token for target owner ${owner}`)
  const scoped = { ...environment }
  delete scoped.GITHUB_TOKEN
  delete scoped.GH_TOKEN
  scoped.GH_TOKEN = token
  return { owner, environment: scoped, secrets: [token] }
}

export const redactSecrets = (value, secrets = []) => {
  let redacted = String(value ?? "")
  for (const secret of secrets) {
    if (secret) redacted = redacted.replaceAll(secret, "<redacted>")
  }
  return redacted.replaceAll(/\b(?:gh[oprsu]_[A-Za-z0-9_]{16,}|github_pat_[A-Za-z0-9_]{16,})\b/g, "<redacted>")
}
