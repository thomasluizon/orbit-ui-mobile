/** Per-process GitHub authentication. Never mutates the globally active gh account. */

import { execFileSync } from "node:child_process"

import { runBounded } from "./bounded-process.mjs"

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

const repositoryOwner = (repoPath, gitBin = process.env.GIT_BIN || "git", environment = process.env) => repositorySlug(repoPath, gitBin, environment).split("/")[0]

export const githubEnvironment = async (repoPath, { ghBin = process.env.GH_BIN || "gh", gitBin = process.env.GIT_BIN || "git", environment = process.env, timeoutMs = 30000 } = {}) => {
  const owner = repositoryOwner(repoPath, gitBin, environment)
  const result = await runBounded(ghBin, ["auth", "token", "--user", owner], { env: environment, timeoutMs, maxBuffer: 1024 * 1024 })
  if (result.timedOut) throw new Error(`could not resolve a GitHub token for target owner ${owner}: timed out after ${timeoutMs}ms and terminated the complete child process tree`)
  if (result.error || result.status !== 0) throw new Error(`could not resolve a GitHub token for target owner ${owner}: ${(result.stderr || result.stdout || result.error?.message || `exit ${result.status}`).trim()}`)
  const token = result.stdout.trim()
  if (!token) throw new Error(`gh auth token returned no token for target owner ${owner}`)
  return { owner, environment: { ...withoutGithubToken(environment), GH_TOKEN: token }, secrets: [token] }
}

/** The environment with each GitHub token variable removed, so a command in it never reads or sends the token. */
export const withoutGithubToken = (environment) => {
  const scoped = { ...environment }
  delete scoped.GITHUB_TOKEN
  delete scoped.GH_TOKEN
  return scoped
}

/**
 * Confirms that the `gh` sign-in which a run reads by itself (the keyring) is the owner of the repository at `repoPath`, so the run needs
 * no token in its environment. Throws when `gh` reads another account, because each read of that run would then fail or reach another account.
 */
export const requireKeyringOwner = async (repoPath, { ghBin = process.env.GH_BIN || "gh", gitBin = process.env.GIT_BIN || "git", environment = process.env, timeoutMs = 30000 } = {}) => {
  const owner = repositoryOwner(repoPath, gitBin, environment)
  const result = await runBounded(ghBin, ["api", "user", "--jq", ".login"], { env: withoutGithubToken(environment), timeoutMs, maxBuffer: 1024 * 1024 })
  if (result.timedOut) throw new Error(`could not read the gh sign-in: timed out after ${timeoutMs}ms and terminated the complete child process tree`)
  if (result.error || result.status !== 0) throw new Error(`could not read the gh sign-in: ${(result.stderr || result.stdout || result.error?.message || `exit ${result.status}`).trim()}`)
  const login = result.stdout.trim()
  if (login !== owner) throw new Error(`the gh sign-in of the keyring is ${JSON.stringify(login)}, not the repository owner ${JSON.stringify(owner)}; run gh auth switch --user ${owner}`)
  return owner
}

export const redactSecrets =(value, secrets = []) => {
  let redacted = String(value ?? "")
  for (const secret of secrets) {
    if (secret) redacted = redacted.replaceAll(secret, "<redacted>")
  }
  return redacted.replaceAll(/\b(?:gh[oprsu]_[A-Za-z0-9_]{16,}|github_pat_[A-Za-z0-9_]{16,})\b/g, "<redacted>")
}
