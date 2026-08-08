import { readFileSync } from "node:fs"

import { processIsRunning, T, orcaEnv, stage, stageRepo } from "./_harness.mjs"
import { githubEnvironment, redactSecrets } from "../lib/github-auth.mjs"

const TOOL = "lib/github-auth.mjs"

export const cases = async () => {
  const first = stageRepo("github-auth-first")
  const second = stageRepo("github-auth-second")
  if (!first || !second) {
    T(`${TOOL}: git fixtures are available`, false, "could not stage repositories")
    return
  }
  first.git(["remote", "set-url", "origin", "https://github.com/first-owner/one.git"])
  second.git(["remote", "set-url", "origin", "git@github.com:second-owner/two.git"])
  const base = orcaEnv([
    { match: "auth token --user first-owner", stdout: "first-secret-token" },
    { match: "auth token --user second-owner", stdout: "second-secret-token" },
  ])
  const before = process.env.GH_TOKEN
  const firstAuth = await githubEnvironment(first.path, { ghBin: base.GH_BIN, environment: { ...process.env, ...base } })
  const secondAuth = await githubEnvironment(second.path, { ghBin: base.GH_BIN, environment: { ...process.env, ...base } })
  T(`${TOOL}: different target owners receive isolated child environments`, firstAuth.owner === "first-owner" && secondAuth.owner === "second-owner" && firstAuth.environment.GH_TOKEN !== secondAuth.environment.GH_TOKEN)
  T(`${TOOL}: account selection never mutates the parent environment`, process.env.GH_TOKEN === before)
  T(`${TOOL}: secret redaction covers selected and token-shaped credentials`, redactSecrets(`x ${firstAuth.environment.GH_TOKEN} github_pat_abcdefghijklmnopqrstuvwxyz`, firstAuth.secrets) === "x <redacted> <redacted>")

  const descendantPidFile = stage("github-auth/descendant.pid", "")
  const hanging = orcaEnv([{ match: "auth token --user first-owner", stdout: "", hangTreePidFile: descendantPidFile }])
  let timeoutMessage = ""
  try {
    await githubEnvironment(first.path, { ghBin: hanging.GH_BIN, environment: { ...process.env, ...hanging }, timeoutMs: 1000 })
  } catch (error) {
    timeoutMessage = error.message
  }
  const descendantPid = Number(readFileSync(descendantPidFile, "utf8"))
  const descendantAlive = processIsRunning(descendantPid)
  T(`${TOOL}: token selection is bounded and reports full-tree termination`, /timed out after 1000ms/.test(timeoutMessage), timeoutMessage)
  T(`${TOOL}: token timeout removes the complete process tree`, Number.isInteger(descendantPid) && !descendantAlive, `descendant ${descendantPid} still alive`)
}
