import { spawnSync } from "node:child_process"
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { delimiter, join } from "node:path"

import { workerSettings } from "../lib/worker.mjs"
import { ghDenial, shellCommands } from "../lib/worker-gh-hook.mjs"
import { T, root, same } from "./_harness.mjs"

const FIXTURE = JSON.parse(readFileSync(new URL("../__fixtures__/drive-worker.json", import.meta.url), "utf8"))
const OWN = { worktree: "/work/tree", branch: "chore/ticket-9" }
const PULL = { number: 50, url: "https://github.com/owner/code/pull/50" }

const reader = ({ root: top = OWN.worktree, branch = OWN.branch, lookups = [] } = {}) => ({
  checkout: (directory) => (directory === OWN.worktree ? { root: OWN.worktree, branch: OWN.branch } : { root: top, branch }),
  ownPull: (own) => (lookups.push(own), PULL),
})

const denial = (command, { own = OWN, cwd = "/work/tree/apps", read = reader() } = {}) => ghDenial({ command, cwd, own, read })

const ALLOWED = [
  "gh pr edit --body-file /tmp/body.md",
  "gh pr edit --body-file=/tmp/body.md",
  "gh pr edit -F /tmp/body.md",
  "gh pr edit --add-label parity:exempt",
  "gh pr edit --remove-label parity:exempt --add-label \"needs review\"",
  "gh pr edit 50 --body-file body.md",
  `gh pr edit ${PULL.url} --add-label parity:exempt`,
  "gh pr edit chore/ticket-9 --add-label parity:exempt",
  "gh pr comment --body-file note.md",
  "gh pr comment 50 --body \"The body is fixed.\"",
  "gh pr comment -b 'gh pr merge stays with the driver'",
  "gh pr edit --add-label parity:exempt && gh pr comment --body done",
  "gh pr edit --body-file body.md 2>&1 | tail -3",
  "gh pr edit --help; gh pr comment --help",
  "gh pr create --title t --body-file body.md --label parity:exempt",
  "gh pr view 51 --json body,comments",
  "gh pr checks 2>&1 | head -20",
  "gh pr list --head chore/ticket-9 --json number",
  "gh pr diff 51",
  "gh issue view 9 --repo owner/tickets --json body",
  "gh run view 5 --repo owner/code --log-failed",
  "gh run download 5 -n report",
  "gh search issues crash",
  "gh --version",
  "command -v gh",
  "gh api repos/owner/code/actions/jobs/5/logs 2>&1 | tail -70",
  "gh api --allow-escape-sequences repos/owner/code/actions/jobs/5/logs",
  "gh api repos/owner/code/issues/1/comments --paginate --jq '.[].body'",
  "gh api -i repos/owner/code",
  "gh api graphql -f query='query { viewer { login } }'",
  "gh api graphql -f query='query($owner: String!) { repositoryOwner(login: $owner) { id } }' -F owner=someone",
  "git commit -m \"let a worker run gh pr edit, not gh pr merge\"",
  "grep -rn \"gh issue edit\" tools",
  "grep -n gh tools/drive.mjs",
  "echo gh pr merge 1",
  "cat > note.md <<'EOF'\ngh pr merge 1\nEOF",
  "ls tools # gh pr merge 1",
]

const DENIED = [
  "gh pr edit 51 --body-file body.md",
  "gh pr edit fix/ticket-8 --add-label parity:exempt",
  "gh pr edit https://github.com/owner/code/pull/51 --add-label x",
  "gh pr comment 51 --body text",
  "gh pr edit 50 51 --add-label x",
  "gh pr edit -R owner/other --add-label x",
  "gh pr edit --repo=owner/other --add-label x",
  "gh pr -R owner/other edit --add-label x",
  "gh pr comment --body text -R owner/other",
  "gh pr edit --title other",
  "gh pr edit --body text",
  "gh pr edit --base release",
  "gh pr edit --add-assignee someone",
  "gh pr edit --add-label x --add-reviewer someone",
  "gh pr comment --edit-last --body text",
  "gh pr comment --delete-last --yes",
  "gh pr comment -b --help 51",
  "cd /elsewhere && gh pr comment --body text",
  "git switch main; gh pr edit --add-label x",
  "GH_REPO=owner/other gh pr comment --body text",
  "export GH_REPO=owner/other && gh pr comment --body text",
  "echo 51 | xargs gh pr edit --add-label x",
  "gh pr comment --body \"$(gh pr view 51 --json body)\"",
  "gh pr merge 50 --squash",
  "gh pr -R owner/code merge 50",
  "gh pr close 50",
  "gh pr reopen 50",
  "gh pr ready 50",
  "gh pr review 50 --approve",
  "gh pr update-branch 50",
  "gh issue edit 9 --repo owner/tickets --body-file b.md",
  "gh issue comment 9 --body text",
  "gh issue create --title t",
  "gh issue close 9",
  "gh label create parity",
  "gh release create v1",
  "gh run rerun 5",
  "gh run cancel 5",
  "gh repo edit --visibility public",
  "gh alias set land 'pr merge'",
  "gh extension install owner/tool",
  "gh api repos/owner/code/issues/1/comments -f body=text",
  "gh api repos/owner/code/issues/1 -F state=closed",
  "gh api repos/owner/code/issues/1 --raw-field=state=closed",
  "gh api repos/owner/code/issues/1 -fstate=closed",
  "gh api repos/owner/code/issues/1 -ifstate=closed",
  "gh api -XDELETE repos/owner/code/git/refs/heads/x",
  "gh api repos/owner/code/issues/1 --method=PATCH",
  "gh api repos/owner/code/issues/1 --input body.json",
  "gh api graphql -f query='mutation { closeIssue(input: {issueId: \"x\"}) { clientMutationId } }'",
  "gh api graphql -f query='query A { viewer { login } } mutation B { x }'",
  "gh api graphql -F query=@query.graphql",
  "gh api graphql -f query=\"$QUERY\"",
  "/opt/homebrew/bin/gh pr merge 50",
  "ls; gh issue close 9",
  "true && gh issue close 9",
  "head=$(gh pr merge 50)",
  "echo \"$(gh pr close 50)\"",
  "echo `gh pr close 50`",
  "(cd apps && gh pr merge 50)",
  "if true; then gh pr merge 50; fi",
  "env GH_PAGER=cat gh pr merge 50",
  "timeout 60 gh pr merge 50",
  "cat <<EOF\nbody\nEOF\ngh pr merge 50",
]

const lexerCases = () => {
  same("lib/worker-gh-hook.mjs: operators split commands and quotes join words", shellCommands("a 'b c' \"d;e\" f\\ g && h|i; j"), [["a", "b c", "d;e", "f g"], ["h"], ["i"], ["j"]])
  same("lib/worker-gh-hook.mjs: redirect targets and comments are no words", shellCommands("a 2>&1 >out.txt < in &>all b # c; d\ne"), [["a", "b"], ["e"]])
  same("lib/worker-gh-hook.mjs: a heredoc body is no command, and the next line is one", shellCommands("cat <<-'END' > f\n\tgh x\n\tEND\nnext"), [["cat"], ["next"]])
  same("lib/worker-gh-hook.mjs: a substitution runs before the command that holds it", shellCommands("a \"$(b c)\" `d` <(e)"), [["b", "c"], ["d"], ["e"], ["a", "$", "$"]])
}

const policyCases = () => {
  for (const command of ALLOWED) same(`lib/worker-gh-hook.mjs: allows ${JSON.stringify(command)}`, denial(command), null)
  for (const command of DENIED) T(`lib/worker-gh-hook.mjs: blocks ${JSON.stringify(command)}`, typeof denial(command) === "string", String(denial(command)))

  const write = "gh pr edit --add-label parity:exempt"
  T("lib/worker-gh-hook.mjs: a run with no branch of its own edits no pull request and still reads", /no branch of its own/.test(denial(write, { own: null })) && denial("gh pr view 50", { own: null }) === null)
  T("lib/worker-gh-hook.mjs: a call from another checkout is blocked, with the same branch name too", /in your working tree/.test(denial(write, { cwd: "/work/other", read: reader({ root: "/work/other" }) })))
  T("lib/worker-gh-hook.mjs: a working tree on another branch is blocked", /on main/.test(denial(write, { read: reader({ branch: "main" }) })))
  const lookups = []
  denial(write, { read: reader({ lookups }) })
  denial("gh pr edit chore/ticket-9 --add-label x", { read: reader({ lookups }) })
  same("lib/worker-gh-hook.mjs: a call with no selector or with the own branch asks GitHub nothing", lookups, [])
  denial("gh pr edit 50 --add-label x", { read: reader({ lookups }) })
  same("lib/worker-gh-hook.mjs: a number is compared with the pull request of the own branch", lookups, [OWN])
}

/** A repository on the worker's branch, and a `gh` on PATH that answers `pr view` in the recorded shape. */
const stageWorker = () => {
  const worktree = join(root, "gh-hook", "tree with ' quote")
  const bin = join(root, "gh-hook", "bin")
  mkdirSync(worktree, { recursive: true })
  mkdirSync(bin, { recursive: true })
  spawnSync("git", ["init", "--quiet", "--initial-branch", OWN.branch], { cwd: worktree })
  const gh = join(bin, "gh")
  writeFileSync(gh, `#!/bin/sh\n[ "$1 $2 $3" = "pr view ${OWN.branch}" ] || exit 1\necho '${JSON.stringify(PULL)}'\n`)
  chmodSync(gh, 0o755)
  return { worktree, env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}` } }
}

/** Runs the hook command of the rendered settings as the CLI does: in a shell, with the recorded input shape on stdin. */
const renderedSettingsCases = () => {
  const { worktree, env } = stageWorker()
  const settings = workerSettings({ hotPath: "/home/driver/hot.md", skillNames: [], own: { worktree, branch: OWN.branch } })
  const [entry] = settings.hooks.PreToolUse
  const [hook] = entry.hooks
  const call = (command, shell = hook.command, input = JSON.stringify({ ...FIXTURE.preToolUseHook.input, cwd: worktree, tool_input: { command } })) => spawnSync("sh", ["-c", shell], { cwd: worktree, env, input, encoding: "utf8" })

  same("lib/worker.mjs: the hook runs before each shell tool", [entry.matcher, hook.type, FIXTURE.preToolUseHook.input.hook_event_name, entry.matcher.split("|").includes(FIXTURE.preToolUseHook.input.tool_name)], ["Bash|Monitor", "command", "PreToolUse", true])
  for (const command of ["gh pr edit --body-file body.md", "gh pr edit 50 --add-label parity:exempt", "gh pr edit --remove-label parity:exempt", "gh pr comment --body done", "git status"]) {
    const result = call(command)
    same(`lib/worker.mjs: the rendered settings let ${JSON.stringify(command)} run`, [result.status, result.stderr], [0, ""])
  }
  for (const command of ["gh pr edit 51 --body-file body.md", "gh pr comment 51 --body text", "gh pr merge 50", "gh issue edit 9 --body text", "gh api repos/owner/code/issues/1 -f state=closed"]) {
    const result = call(command)
    T(`lib/worker.mjs: the rendered settings block ${JSON.stringify(command)} and tell the model why`, result.status === 2 && result.stderr.startsWith("Blocked: "), `${result.status} ${result.stderr}`)
  }
  const broken = call("git status", hook.command, "not json")
  T("lib/worker.mjs: a hook that cannot read its input blocks the call", broken.status === 2 && /could not check/.test(broken.stderr), `${broken.status} ${broken.stderr}`)
  same("lib/worker.mjs: a hook that cannot start blocks the call", call("git status", hook.command.replace("worker-gh-hook.mjs", "no-such-hook.mjs")).status, 2)
}

export const cases = async () => {
  lexerCases()
  policyCases()
  renderedSettingsCases()
}
