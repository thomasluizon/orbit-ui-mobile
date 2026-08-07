import { T, orcaEnv, stageRepo } from "./_harness.mjs"
import { githubEnvironment, redactSecrets } from "../lib/github-auth.mjs"

const TOOL = "lib/github-auth.mjs"

export const cases = () => {
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
  const firstAuth = githubEnvironment(first.path, { ghBin: base.GH_BIN, environment: { ...process.env, ...base } })
  const secondAuth = githubEnvironment(second.path, { ghBin: base.GH_BIN, environment: { ...process.env, ...base } })
  T(`${TOOL}: different target owners receive isolated child environments`, firstAuth.owner === "first-owner" && secondAuth.owner === "second-owner" && firstAuth.environment.GH_TOKEN !== secondAuth.environment.GH_TOKEN)
  T(`${TOOL}: account selection never mutates the parent environment`, process.env.GH_TOKEN === before)
  T(`${TOOL}: secret redaction covers selected and token-shaped credentials`, redactSecrets(`x ${firstAuth.environment.GH_TOKEN} github_pat_abcdefghijklmnopqrstuvwxyz`, firstAuth.secrets) === "x <redacted> <redacted>")
}
