import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { dirname, join } from "node:path"
import { cloudOrder } from "../lib/cloud-worker.mjs"
import { parityExemptTerms } from "../lib/parity-scope.mjs"
import { REVIEW_BATCH_ORDER_MARKER } from "../lib/run-state.mjs"
import { orderSealProblem } from "../lib/run-notes.mjs"

import { check, githubIssueReadPlan, orcaEnv, realOrchestratorConfig, REPO_ROOT, root, stage, stageRepo, stageWithConfig, T } from "./_harness.mjs"

const TOOL = "compose-prompt.mjs"
const APPROVAL_HOOK = join(".claude", "hooks", "forbid-approval-prompt.mjs")
const APPROVAL_RULES = join(".claude", "hooks", "_lib", "rules-approval.mjs")
const REPO_PATH = join(root, "compose-prompt", "repo-ui")
const API_REPO_PATH = join(root, "compose-prompt", "repo-api")
const LANDING_REPO_PATH = join(root, "compose-prompt", "repo-landing")
const projectItems = JSON.stringify({ items: [], totalCount: 0 })
const ticket = (overrides = {}) => ({
  blockedBy: { nodes: [], totalCount: 0 },
  blocking: { nodes: [], totalCount: 0 },
  body: "# Ticket body\n\nKeep this verbatim.",
  labels: [{ name: "repo:ui" }],
  number: 221,
  state: "OPEN",
  stateReason: null,
  title: "Ticket title",
  url: "https://github.com/thomasluizon/orbit-tickets/issues/221",
  ...overrides,
})
/**
 * The comments entry comes FIRST because the stub resolves with `plan.find`, and the generic
 * `issue view 221` prefix would otherwise answer the comments read with the ticket envelope.
 */
const ticketPlan = (value = ticket(), comments = []) => [
  { match: "issue view 221 --repo thomasluizon/orbit-tickets --json comments", stdout: JSON.stringify({ comments }) },
  ...githubIssueReadPlan(value),
  { match: "project item-list 2 --owner thomasluizon", stdout: projectItems },
]
const comment = (body, createdAt = "2026-08-13T18:58:17Z", isMinimized = false) => ({ author: { login: "thomasluizon" }, body, createdAt, isMinimized })
const composed = (path) => (existsSync(path) ? readFileSync(path, "utf8") : "")

const HEAD = "0123456789abcdef0123456789abcdef01234567"
const REVIEWED = "89abcdef0123456789abcdef0123456789abcdef"

/** Read-only orders read no ticket: an empty gh plan makes any GitHub read fail the case. */
const readOnlyCases = () => {
  const repository = stageRepo("compose-prompt-read-only")
  repository.git(["remote", "set-url", "origin", "https://github.com/thomasluizon/orbit-ui-mobile.git"])
  const real = realOrchestratorConfig()
  const staged = stageWithConfig("compose-prompt-read-only", TOOL, { ...real, repos: { ui: repository.path, api: API_REPO_PATH, landing: LANDING_REPO_PATH } })
  const playbook = join(staged.base, ".claude", "playbooks", "review-and-audit.md")
  mkdirSync(join(staged.base, ".claude", "playbooks"), { recursive: true })
  cpSync(join(REPO_ROOT, ".claude", "playbooks", "review-and-audit.md"), playbook)
  const options = { path: staged.path, env: orcaEnv([]) }
  const directory = join(root, "compose-prompt-read-only")
  mkdirSync(directory, { recursive: true })
  const base = ["--repo", "ui", "--pr", "2145", "--head", HEAD]

  const reviewPath = join(directory, "review.md")
  check(TOOL, "--review composes a review order without reading the ticket", ["--review", ...base, "--out", reviewPath], { status: 0, stdout: /review\.md/ }, options)
  const review = composed(reviewPath)
  T(`${TOOL}: the review order embeds the playbook brief and its contract`,
    review.startsWith("# Read-only review of thomasluizon/orbit-ui-mobile pull request #2145") && review.includes("The lenses:") &&
      review.includes("## Read-only review contract") && review.includes(`git diff origin/main...${HEAD}`) && !review.includes("$(") &&
      review.includes("`VERDICT: CLEAN`") && review.includes("`VERDICT: DEFECTS (<n>)`") && review.includes("at most 12 lines") &&
      review.includes("No GitHub write") && !review.includes("#### The review brief"),
    review)
  const fixRoundPath = join(directory, "fix-round.md")
  check(TOOL, "--review --since composes a fix-round order", ["--review", ...base, "--since", REVIEWED, "--base", "release", "--out", fixRoundPath], { status: 0 }, options)
  const fixRound = composed(fixRoundPath)
  T(`${TOOL}: a fix-round order reads the whole diff and checks each fix against the commits after the reviewed head`,
    fixRound.includes("git diff origin/release...") && fixRound.includes(`git diff ${REVIEWED}..${HEAD}`) && fixRound.includes("Read the whole diff again") &&
      !fixRound.includes("Read only the new commits") && !fixRound.includes("git merge-base"), fixRound)
  T(`${TOOL}: a review order asks for every instance of each defect class, from the brief alone`,
    [review, fixRound].every((order) => order.includes("For each defect class, name the class one time and list every instance, one `path:line` each, including an instance outside the changed lines that the diff caused") &&
      order.split("name the class one time and list every instance").length === 2), review)
  T(`${TOOL}: a review order carries the BLOCKING and NOTE definition that its brief ranks by`,
    [review, fixRound].every((order) => order.includes("BLOCKING is every confirmed finding under a lens above that this diff makes, in the changed lines or in code they break") &&
      order.includes("a case that passed on `main` or on the earlier head fails at this head, such as an unchanged caller of a renamed export") &&
            order.includes("NOTE is a matter of taste with no wrong result, or a defect that the diff did not make") &&
      !order.includes("as rule 14 defines them")), review)

  writeFileSync(playbook, readFileSync(playbook, "utf8").replace("The lenses:", "The lenses, edited in the playbook only:"))
  const editedPath = join(directory, "edited.md")
  check(TOOL, "--review reads the brief from the playbook each time", ["--review", ...base, "--out", editedPath], { status: 0 }, options)
  T(`${TOOL}: an edit of the playbook brief reaches the next order`, composed(editedPath).includes("The lenses, edited in the playbook only:"), composed(editedPath))
  writeFileSync(playbook, "# A playbook with no brief\n")
  check(TOOL, "--review refuses a playbook with no brief", ["--review", ...base, "--out", join(directory, "no-brief.md")], { status: 2, stderr: /could not read the review brief: the playbook has no "#### The review brief" section/ }, options)

  const plan = stage("compose-prompt-read-only/plan.md", "1. Drag the Astra button 20 times. Expected: it moves every time.\n")
  const evidence = join(directory, "evidence")
  const proofPath = join(directory, "proof.md")
  const proofArgs = ["--proof", ...base, "--plan", plan, "--devices", "iPhone 17, orbit-proof-2145", "--evidence", evidence, "--out", proofPath]
  check(TOOL, "--proof composes a device proof order", proofArgs, { status: 0 }, options)
  const proof = composed(proofPath)
  T(`${TOOL}: a review order and a proof order carry a valid seal, and an appended line breaks it (thread b_tA)`,
    [review, proof].every((order) => orderSealProblem(order) === null && orderSealProblem(`${order}One more line.\n`) !== null), `${review.slice(-200)}\n${proof.slice(-200)}`)
  T(`${TOOL}: the proof order names its steps, devices, evidence directory and verdict lines`,
    proof.startsWith("# Device proof of thomasluizon/orbit-ui-mobile pull request #2145") && proof.includes("Drag the Astra button 20 times") &&
      proof.includes("Use only these: iPhone 17, orbit-proof-2145.") && proof.includes(evidence) && existsSync(evidence) &&
      proof.includes("`PROOF: PASS`") && proof.includes("`PROOF: FAIL (<n> defects)`") && proof.includes("Orbit_Pixel_9_API_35") &&
      proof.includes("You write nothing tracked") && proof.includes("at most 12 lines"),
    proof)
  T(`${TOOL}: the proof order boots with the composing checkout's own emulator tool by absolute path (thread vkfg)`,
    proof.includes(`\`node ${join(dirname(staged.path), "android-emulator.mjs")} --avd orbit-proof-$ORBIT_PROOF_EMULATOR_PORT --port $ORBIT_PROOF_EMULATOR_PORT\``), proof)
  writeFileSync(join(evidence, "step-1.png"), "an earlier proof\n")
  const empty = stage("compose-prompt-read-only/empty-plan.md", "\n")
  for (const [name, argv, pattern] of [
    ["--review with --issue", ["--review", ...base, "--issue", "ORB-215", "--out", reviewPath], /drop --issue, --cloud, --layout-guard and --review-batch/],
    ["--review with --proof", ["--review", ...proofArgs.slice(1), "--proof"], /drop --issue/],
    ["--review with --review-batch", ["--review", ...base, "--review-batch", "--out", reviewPath], /drop --issue/],
    ["--review without --pr", ["--review", "--repo", "ui", "--head", HEAD, "--out", reviewPath], /needs --pr <n>/],
    ["--review with an upper-case head", ["--review", "--repo", "ui", "--pr", "2145", "--head", HEAD.toUpperCase(), "--out", reviewPath], /needs --head <sha>/],
    ["--review with a short since", ["--review", ...base, "--since", "abc", "--out", reviewPath], /--since needs the reviewed head/],
    ["--proof with --since", [...proofArgs, "--since", REVIEWED], /--since belongs to --review/],
    ["--proof without a plan", ["--proof", ...base, "--devices", "iPhone 17", "--evidence", join(directory, "evidence-2"), "--out", proofPath], /needs --plan <file>/],
    ["--proof with an empty plan", ["--proof", ...base, "--plan", empty, "--devices", "iPhone 17", "--evidence", join(directory, "evidence-2"), "--out", proofPath], /is empty/],
    ["--proof without devices", ["--proof", ...base, "--plan", plan, "--devices", " , ", "--evidence", join(directory, "evidence-2"), "--out", proofPath], /needs --devices <names>/],
    ["--proof with a relative evidence directory", ["--proof", ...base, "--plan", plan, "--devices", "iPhone 17", "--evidence", "evidence", "--out", proofPath], /an absolute path/],
    ["--proof with evidence inside a repository", ["--proof", ...base, "--plan", plan, "--devices", "iPhone 17", "--evidence", join(repository.path, "evidence"), "--out", proofPath], /--evidence .* is inside the .* repository/],
    ["--proof with an evidence directory that holds a file", proofArgs, /must be a new or empty directory/],
  ]) {
    check(TOOL, `refuses ${name}`, argv, { status: 2, stderr: pattern }, options)
  }
}

export const cases = () => {
  readOnlyCases()
  mkdirSync(join(root, "compose-prompt"), { recursive: true })
  const real = realOrchestratorConfig()
  const staged = stageWithConfig("compose-prompt", TOOL, {
    ...real,
    repos: { ui: REPO_PATH, api: API_REPO_PATH, landing: LANDING_REPO_PATH },
  })
  stage("staged/compose-prompt/.claude/linear-to-github-map.json", JSON.stringify({ issues: { "ORB-215": { number: 221 } } }))
  // The ui checkout and the repository of the tool hold the approval hook; the api and landing checkouts do not.
  stage(join("compose-prompt", "repo-ui", APPROVAL_HOOK), "")
  for (const file of [APPROVAL_HOOK, APPROVAL_RULES]) stage(join("staged", "compose-prompt", file), readFileSync(join(REPO_ROOT, file), "utf8"))
  const options = (plan) => ({ path: staged.path, env: plan ? orcaEnv(plan) : undefined })
  const out = join(root, "compose-prompt", "orb-215.md")

  check(TOOL, "refuses a missing repo key", ["--issue", "ORB-215", "--out", out], { status: 2, stderr: /usage: compose-prompt\.mjs/ }, options())
  check(TOOL, "refuses a relative output path", ["--issue", "ORB-215", "--repo", "ui", "--out", "prompts/orb-215.md"], { status: 2, stderr: /usage: compose-prompt\.mjs/ }, options())
  check(TOOL, "refuses a repo key the config does not declare", ["--issue", "ORB-215", "--repo", "ghost", "--out", out], { status: 2, stderr: /unknown repo key "ghost"; declared: ui/ }, options())
  check(
    TOOL,
    "refuses an output path inside a declared repository",
    ["--issue", "ORB-215", "--repo", "ui", "--out", join(REPO_PATH, "prompt.md")],
    { status: 2, stderr: /is inside the .* repository/ },
    options(),
  )

  const written = check(
    TOOL,
    "composes the mapped ticket body through the adapter",
    ["--issue", "orb-215", "--repo", "ui", "--out", out],
    { status: 0, stdout: /orb-215\.md/ },
    options(ticketPlan()),
  )
  const prompt = composed(out)
  T(`${TOOL}: the ticket body survives composition verbatim`, prompt.startsWith("# Ticket body\n\nKeep this verbatim."), prompt.slice(0, 200) || written.stderr)
  T(`${TOOL}: a local order carries a valid seal, and an appended note breaks it`, orderSealProblem(prompt) === null && orderSealProblem(`${prompt}\n## Orchestrator note\n`) !== null, prompt.slice(-200))
  T(`${TOOL}: a local order carries the standing unattended rules`, prompt.includes("**Nobody answers an approval prompt.**") && prompt.includes("delete with Node") &&
    prompt.includes("no attribution line") && prompt.includes("at most 12 lines") && prompt.includes("Spend at most 25 minutes of wall time on verification") &&
    prompt.includes("reference a ticket with Tracks"), prompt)
  T(
    `${TOOL}: local ui delivery names the parity label and justification`,
    prompt.includes("--label parity:exempt") && prompt.includes("## Parity") &&
      prompt.includes("platform adapter") && prompt.includes("enumerated layout-shell divergence") &&
      prompt.includes("mirror change"),
    prompt,
  )
  const missingTerms = parityExemptTerms.filter((term) => !prompt.includes(term))
  T(
    `${TOOL}: local ui delivery lists every parity term the PR Metadata gate accepts`,
    parityExemptTerms.length > 0 && missingTerms.length === 0,
    `missing: ${missingTerms.join(", ")}`,
  )

  const boardMarker = stage("compose-prompt/board-read", "must remain")
  check(
    TOOL,
    "composes without reading the Projects board",
    ["--issue", "orb-215", "--repo", "ui", "--out", out],
    { status: 0 },
    options([
      ...ticketPlan().slice(0, -1),
      { match: "project item-list 2 --owner thomasluizon", stdout: projectItems, removePath: boardMarker },
    ]),
  )
  T(`${TOOL}: composing reads no Projects board item`, existsSync(boardMarker))
  T(
    `${TOOL}: size is advisory and mandatory generated artifacts stay with their source change`,
    /File and line counts are advisory\s+review information, never delivery gates/.test(prompt) && /migrations with their\s+model change/.test(prompt) && /required lockfiles\s+or codemod output/.test(prompt),
    prompt,
  )
  T(
    `${TOOL}: every prompt bans broad staging and permits named paths`,
    prompt.includes("Never run `git add -A`, `git add --all`, `git add -u`") && /pass every intended path explicitly to `git --literal-pathspecs add`/.test(prompt),
    prompt,
  )
  T(
    `${TOOL}: the local order permits npm ci while banning dependency edits`,
    /`npm ci` is allowed and expected when an installed package is missing/.test(prompt) &&
      !/NEVER write inside `node_modules`/.test(prompt) &&
      /Never edit installed files by hand/.test(prompt) &&
      /Never\s+run `patch-package`/.test(prompt) &&
      /never stage or commit a\s+path under `node_modules`/.test(prompt) &&
      /Do not run `npm install` or change the lockfile unless the ticket says to/.test(prompt),
    prompt,
  )
  T(
    `${TOOL}: the brief keeps delivery and browser boundaries`,
    /your own exit code counts for nothing/.test(prompt) &&
      /tools\/verify-delivery\.mjs/.test(prompt) &&
      /NEVER open the app in a browser and never start a dev or production server/.test(prompt) &&
      /Playwright, Maestro or Cypress/.test(prompt) &&
      /nothing under `e2e\/`/.test(prompt) &&
      /no layout guard/.test(prompt) &&
      /no navigating to localhost/.test(prompt) &&
      /no logging in to the app/.test(prompt),
    prompt,
  )
  T(
    `${TOOL}: the brief asks for the focused checks of the change and leaves every full suite to CI`,
    /Run only the focused checks of your change; CI runs every full suite/.test(prompt) &&
      /`npx vitest related <changed source files> --run`/.test(prompt) && /Never start Vitest without a file name/.test(prompt) &&
      /`node tools\/test-tools\.mjs --only <case module>` for each case module that covers a changed tool or reads a changed file \(`grep -rl <file name> tools\/__tests__`/.test(prompt) &&
      /Never run the complete tools suite/.test(prompt) &&
      // The hooks harness reads .claude/settings.json and every tracked doc, so a trigger narrower than these skips the suite that covers the edit.
      /`node \.claude\/hooks\/test-hooks\.mjs` after a change to `\.claude\/\*\*`, a tracked `\*\.md` file, or another file the harness reads or imports \(`grep -n <file name> \.claude\/hooks\/test-hooks\.mjs`\)/.test(prompt) &&
      !/hooks\/\*\*`/.test(prompt) &&
      !/run them in full|broader suite|broader verification/i.test(prompt),
    prompt,
  )
  T(
    `${TOOL}: the UI brief includes Chromium geometry within Vitest evidence`,
    /The focused Vitest tests of your change are required evidence/.test(prompt) &&
      /including any headless Chromium geometry test they launch/.test(prompt) &&
      !/apps\/web\/__tests__\/support\/chromium\.ts/.test(prompt) &&
      /That Chromium use is permitted within Vitest/.test(prompt),
    prompt,
  )
  T(
    `${TOOL}: the default order keeps the full e2e and Playwright file ban`,
    prompt.includes("nothing under `e2e/`") &&
      prompt.includes("**Never create an end-to-end, visual-regression or Playwright file.**") &&
      !prompt.includes("may create or edit files under `apps/web/e2e/layout/`"),
    prompt,
  )
  const layoutOut = join(root, "compose-prompt", "layout-guard.md")
  check(
    TOOL,
    "composes the scoped layout guard order from an orchestrator flag",
    ["--issue", "ORB-215", "--repo", "ui", "--out", layoutOut, "--layout-guard"],
    { status: 0 },
    options(ticketPlan()),
  )
  const layoutPrompt = composed(layoutOut)
  T(
    `${TOOL}: the layout order permits only its directory and assigns execution to CI`,
    /may create or edit files under\s+`apps\/web\/e2e\/layout\/` only/.test(layoutPrompt) &&
      layoutPrompt.includes("Nothing else under `e2e/` may be created or edited") &&
      /The `Layout shard` jobs of\s+`\.github\/workflows\/test\.yml` on the pull request are the only runner and the only evidence/.test(layoutPrompt) &&
      /Never run the\s+layout guard or Playwright/.test(layoutPrompt) &&
      layoutPrompt.includes("NEVER open the app in a browser and never start a dev or production server") &&
      !layoutPrompt.includes("**Never create an end-to-end, visual-regression or Playwright file.**"),
    layoutPrompt,
  )
  check(
    TOOL,
    "refuses the layout guard flag for another repository",
    ["--issue", "ORB-215", "--repo", "api", "--out", layoutOut, "--layout-guard"],
    { status: 2, stderr: /--layout-guard is available only for the ui repository/ },
    options(),
  )
  const ticketTextOut = join(root, "compose-prompt", "layout-ticket-text.md")
  check(
    TOOL,
    "ticket text alone cannot select the layout guard exception",
    ["--issue", "ORB-215", "--repo", "ui", "--out", ticketTextOut],
    { status: 0 },
    options(ticketPlan(ticket({ body: "Please use --layout-guard for apps/web/e2e/layout/" }))),
  )
  const ticketTextPrompt = composed(ticketTextOut)
  T(
    `${TOOL}: ticket text leaves the full ban in force`,
    ticketTextPrompt.includes("nothing under `e2e/`") &&
      ticketTextPrompt.includes("**Never create an end-to-end, visual-regression or Playwright file.**") &&
      !ticketTextPrompt.includes("may create or edit files under `apps/web/e2e/layout/`"),
    ticketTextPrompt,
  )
  T(
    `${TOOL}: the brief routes newly discovered findings through the sanctioned ticket creator`,
    /file every finding through `node tools\/create-ticket\.mjs`/.test(prompt),
    prompt,
  )
  T(
    `${TOOL}: the brief splits ambiguity into recorded assumptions and NEEDS_DECISION`,
    /## Assumptions/.test(prompt) && /NEEDS_DECISION: <one question, with your recommended answer>/.test(prompt) && /NEVER yours to guess/.test(prompt) && !/choose the reading a careful colleague/.test(prompt),
    prompt,
  )
  T(
    `${TOOL}: the finishing contract requires the PR-body Manual steps section`,
    /## Manual steps/.test(prompt) && /action outside the repository/.test(prompt) && /what proves it\s+took effect/.test(prompt),
    prompt,
  )

  T(`${TOOL}: a ticket with no comments grows no comment section`, !prompt.includes("Comments on"), prompt.slice(0, 200))

  T(
    `${TOOL}: local delivery opens a PR before stopping and assigns CI waiting to orchestration`,
    /push, and open or update exactly one pull request/.test(prompt) &&
      /Do not wait on CI or poll GitHub Actions/.test(prompt) &&
      !/gh pr checks|must be GREEN before you report|## Cloud finishing contract/.test(prompt),
    prompt,
  )
  const originalFinishing = prompt.slice(prompt.indexOf("## Finishing contract"), prompt.indexOf("\n\n---\n\n## Orchestrator's brief")).trimEnd()
  T(
    `${TOOL}: local finishing section matches the reviewed contract byte for byte`,
    createHash("sha256").update(originalFinishing).digest("hex") === "2c296c59590b16c9ddc3195567f45e7096e4b1678cf387474464e19ccb64979c",
    originalFinishing,
  )
  const reviewOut = join(root, "compose-prompt", "review-batch.md")
  check(
    TOOL,
    "composes a local review batch",
    ["--issue", "ORB-215", "--repo", "ui", "--out", reviewOut, "--review-batch"],
    { status: 0 },
    options(ticketPlan()),
  )
  const reviewPrompt = composed(reviewOut)
  T(
    `${TOOL}: review batch ends after a tested commit and reports its SHA without delivery instructions`,
    /CI runs the full suites after the push/.test(reviewPrompt) &&
      !/broader suite/i.test(reviewPrompt) &&
      /Report the commit SHA/.test(reviewPrompt) &&
      /Stop after the tested commit/.test(reviewPrompt) &&
      /Do not push or open a pull request/.test(reviewPrompt) &&
      !/Then, in order: run the broader suite, push/.test(reviewPrompt) &&
      !/open or update exactly one pull request/.test(reviewPrompt) &&
      !/One commit series on your branch, pushed/.test(reviewPrompt) &&
      !/The pull request must NOT be a draft/.test(reviewPrompt),
    reviewPrompt,
  )
  T(
    `${TOOL}: a review batch order names one final report shape, and the default order keeps the 12 line message`,
    !reviewPrompt.includes("at most 12 lines") && !reviewPrompt.includes("The pull request body carries the full report") &&
      reviewPrompt.includes("Your final report is the batch's handoff: the commit SHA, then the complete `## Test evidence`, `## Assumptions` and `## Manual steps` sections") &&
      prompt.includes("Your final message is at most 12 lines") && !prompt.includes("Your final report is the batch's handoff"),
    reviewPrompt,
  )
  T(
    `${TOOL}: the review batch order tells the worker to fix every instance of each class in one commit`,
    reviewPrompt.includes("**Fix every instance of each defect class in one commit.**") &&
      reviewPrompt.includes("Give each class one table test, with a row for each instance that a test can see, proven red with its guard removed") &&
      reviewPrompt.includes("An instance that no test can see (a comment, a doc or an unused export) has no guard: make the edit and name it in your report") &&
      reviewPrompt.includes("When a\nclass comes from a word list or a regex that guesses at natural-language input in code, replace the guess with a\nstructured input or delete it. Never add one more pattern. A test assertion that pins doc text is not such code.") &&
      !prompt.includes("**Fix every instance of each defect class in one commit.**"),
    reviewPrompt,
  )
  T(
    `${TOOL}: only the review batch order carries the marker that makes launch-worker.mjs spend a fix round`,
    reviewPrompt.includes(REVIEW_BATCH_ORDER_MARKER) && !prompt.includes(REVIEW_BATCH_ORDER_MARKER),
    reviewPrompt.slice(0, 400),
  )
  T(
    `${TOOL}: review batch report ends with the literal sections the orchestrator copies into the body`,
    /these literal sections, each one present even when it is empty/.test(reviewPrompt) &&
      /`## Test evidence`, `## Assumptions` and `## Manual steps`/.test(reviewPrompt),
    reviewPrompt,
  )
  T(
    `${TOOL}: review batch manual steps require the exact key, screen, and proof`,
    /`## Manual steps`: every action outside the repository/.test(reviewPrompt) &&
      /each naming the exact key, the exact console or screen, and what proves it\s+took effect/.test(reviewPrompt),
    reviewPrompt,
  )
  const localFinishing = prompt.slice(prompt.indexOf("## Finishing contract"))
  const deliverySentences = [
    "Commit after each coherent piece of work, even if imperfect: a ceiling kill keeps commits and loses an uncommitted index.",
    "If unsure, commit the piece and fix it forward.",
    "A pushed branch without a pull request is invisible to review; open the pull request and correct its body, which becomes `main`'s squash commit message, before reporting success.",
  ]
  T(
    `${TOOL}: local finishing leads with three standalone delivery sentences`,
    localFinishing.startsWith(`## Finishing contract\n\n**${deliverySentences.join(" ")}**\n\n`),
    localFinishing.slice(0, 600),
  )
  T(
    `${TOOL}: local delivery appears before the long brief`,
    prompt.indexOf("## Finishing contract") < prompt.indexOf("## Orchestrator's brief"),
    prompt.slice(0, 800),
  )
  for (const [index, sentence] of deliverySentences.entries()) {
    T(`${TOOL}: local delivery sentence ${index + 1} survives composition`, localFinishing.includes(sentence), localFinishing.slice(0, 600))
  }

  const mainOut = join(root, "compose-prompt", "ui-main.md")
  check(
    TOOL,
    "composes a main UI order",
    ["--issue", "ORB-215", "--repo", "ui", "--out", mainOut, "--base", "main"],
    { status: 0 },
    options(ticketPlan()),
  )
  const mainPrompt = composed(mainOut)
  const reviewMainOut = join(root, "compose-prompt", "review-main.md")
  check(
    TOOL,
    "composes a main review batch",
    ["--issue", "ORB-215", "--repo", "ui", "--out", reviewMainOut, "--base", "main", "--review-batch"],
    { status: 0 },
    options(ticketPlan()),
  )
  const reviewMainPrompt = composed(reviewMainOut)
  T(
    `${TOOL}: main delivery keeps the finishing contract before the brief`,
    mainPrompt.indexOf("## Finishing contract") < mainPrompt.indexOf("## Orchestrator's brief"),
    mainPrompt.slice(0, 800),
  )

  for (const [repository, repositoryPath] of [["api", API_REPO_PATH], ["landing", LANDING_REPO_PATH]]) {
    const repositoryOut = join(root, "compose-prompt", `${repository}-main.md`)
    check(
      TOOL,
      `composes a main order for ${repository}`,
      ["--issue", "ORB-215", "--repo", repository, "--out", repositoryOut, "--base", "main"],
      { status: 0 },
      options(ticketPlan(ticket({ labels: [{ name: `repo:${repository}` }] }))),
    )
    const repositoryPrompt = composed(repositoryOut)
    T(
      `${TOOL}: a main ${repository} order names its repository`,
      repositoryPrompt.includes(`Repository \`${repository}\` at \`${repositoryPath}\``),
      repositoryPrompt,
    )
    T(
      `${TOOL}: a ${repository} order keeps the browser boundary without the UI Vitest carve-out`,
      /NEVER open the app in a browser and never start a dev or production server/.test(repositoryPrompt) &&
        /Playwright, Maestro or Cypress/.test(repositoryPrompt) &&
        /nothing under `e2e\/`/.test(repositoryPrompt) &&
        /no layout guard/.test(repositoryPrompt) &&
        !/Vitest suites are required evidence/.test(repositoryPrompt) &&
        !/Chromium geometry tests/.test(repositoryPrompt),
      repositoryPrompt,
    )
  }

  const cloudOut = join(root, "compose-prompt", "cloud.md")
  check(
    TOOL,
    "composes the Cloud mode without local delivery instructions",
    ["--issue", "ORB-215", "--repo", "ui", "--out", cloudOut, "--cloud", "--base", "main", "--worktree", REPO_PATH, "--branch", "feature/local-materialization"],
    { status: 0 },
    options(ticketPlan()),
  )
  const cloudPrompt = composed(cloudOut)
  T(`${TOOL}: a Cloud order carries no seal and no local approval rules`, orderSealProblem(cloudPrompt) !== null && !cloudPrompt.includes("Nobody answers an approval prompt"))
  const reviewCloudOut = join(root, "compose-prompt", "review-cloud.md")
  check(
    TOOL,
    "composes Cloud with the review batch flag",
    ["--issue", "ORB-215", "--repo", "ui", "--out", reviewCloudOut, "--cloud", "--review-batch", "--base", "main", "--worktree", REPO_PATH, "--branch", "feature/local-materialization"],
    { status: 0 },
    options(ticketPlan()),
  )
  T(
    `${TOOL}: Cloud order is byte-identical with the review batch flag`,
    composed(reviewCloudOut) === cloudPrompt,
    composed(reviewCloudOut),
  )
  T(
    `${TOOL}: Cloud keeps its existing standalone commit instruction without local delivery text`,
    cloudPrompt.includes("## Cloud finishing contract\n\n**Commit the implementation. Without a commit there is no diff and the work is lost.**\n\n-") &&
      deliverySentences.every((sentence) => !cloudPrompt.includes(sentence)),
    cloudPrompt.slice(-1200),
  )
  for (const [name, text] of [
    ["the Cloud order", cloudPrompt],
    ["the orchestrate skill", readFileSync(join(REPO_ROOT, ".claude", "skills", "orchestrate", "SKILL.md"), "utf8")],
    ["the sleep skill", readFileSync(join(REPO_ROOT, ".claude", "skills", "sleep", "SKILL.md"), "utf8")],
  ]) {
    T(
      `${TOOL}: ${name} asks for no broader verification beside the focused checks`,
      !/broader verification/i.test(text),
      text.split("\n").filter((line) => /broader verification/i.test(line)).join("\n"),
    )
  }
  /**
   * One brief feeds the local, Cloud and explicit main orders, so each one is asserted separately: a
   * later split could drop the block from any single mode and the other two would stay green. Each
   * assertion names the edit ban rather than the bare word node_modules, which a prompt could
   * carry for an unrelated reason.
   */
  for (const [mode, order] of [["local", prompt], ["Cloud", cloudPrompt], ["explicit main", mainPrompt]]) {
    T(
      `${TOOL}: the ${mode} order permits installs but forbids dependency edits`,
      /Never edit installed files by hand inside `node_modules`/.test(order) &&
        /Read installed source to confirm an external interface/.test(order) &&
        /`npm ci` is allowed and expected/.test(order) &&
        /never stage or commit a\s+path under `node_modules`/.test(order) &&
        /patch-package/.test(order),
      order,
    )
  }

  // The brief points at the hook that owns the rule; the Codex container has no Claude Code hook to point at.
  const approvalPointer = /Run no command that Claude Code holds for an approval:\s+`\.claude\/hooks\/forbid-approval-prompt\.mjs` refuses each one/
  for (const [mode, order, expected] of [["local", prompt, true], ["explicit main", mainPrompt, true], ["Cloud", cloudPrompt, false]]) {
    T(`${TOOL}: the ${mode} order ${expected ? "forbids" : "omits"} commands that ask for an approval`, approvalPointer.test(order) === expected, order)
    T(`${TOOL}: the ${mode} order ${expected ? "forbids" : "omits"} a tool that waits for a person`, /Call no tool that waits for a person to answer, such as `AskUserQuestion`/.test(order) === expected, order)
  }
  T(`${TOOL}: the approval hook that the brief names exists`, existsSync(join(REPO_ROOT, ".claude", "hooks", "forbid-approval-prompt.mjs")))
  // A repository whose checkout holds no approval hook gets a brief that says so, and a pointer to a file that exists.
  const ownedHook = join(staged.base, APPROVAL_HOOK)
  const ownedRules = join(staged.base, APPROVAL_RULES)
  for (const [repo, checkout] of [["api", API_REPO_PATH], ["landing", LANDING_REPO_PATH]]) {
    const siblingOut = join(root, "compose-prompt", `approval-${repo}.md`)
    check(TOOL, `composes a ${repo} order`, ["--issue", "ORB-215", "--repo", repo, "--out", siblingOut, "--worktree", checkout], { status: 0 },
      options(ticketPlan(ticket({ labels: [{ name: `repo:${repo}` }] }))))
    const siblingOrder = composed(siblingOut)
    T(`${TOOL}: the ${repo} order forbids commands that ask for an approval`, /\*\*No person answers a prompt\.\*\* Run no command that Claude Code holds for an approval/.test(siblingOrder), siblingOrder)
    T(`${TOOL}: the ${repo} order never points at a hook that its checkout does not hold`, !siblingOrder.includes(`\`${APPROVAL_HOOK}\``) && !existsSync(join(checkout, APPROVAL_HOOK)), siblingOrder)
    T(`${TOOL}: the ${repo} order says that its repository does not load the hook`, siblingOrder.includes(`The ${repo} repository does not load the hook that refuses them`), siblingOrder)
    T(`${TOOL}: the ${repo} order points at the hook and its rules by paths that exist`, siblingOrder.includes(`\`${ownedHook}\``) && siblingOrder.includes(`\`${ownedRules}\``) && existsSync(ownedHook) && existsSync(ownedRules), siblingOrder)
  }
  // The guard broken: a ui checkout without the hook gets the absolute pointer too, so no order names a missing file.
  rmSync(join(REPO_PATH, APPROVAL_HOOK))
  const bareOut = join(root, "compose-prompt", "approval-bare-ui.md")
  check(TOOL, "composes a ui order for a checkout without the approval hook", ["--issue", "ORB-215", "--repo", "ui", "--out", bareOut], { status: 0 }, options(ticketPlan()))
  T(`${TOOL}: a ui checkout without the hook gets the pointer that exists`, !approvalPointer.test(composed(bareOut)) && composed(bareOut).includes(`\`${ownedHook}\``), composed(bareOut))
  stage(join("compose-prompt", "repo-ui", APPROVAL_HOOK), "")
  check(TOOL, "composes a ui order for a checkout with the approval hook restored", ["--issue", "ORB-215", "--repo", "ui", "--out", bareOut], { status: 0 }, options(ticketPlan()))
  T(`${TOOL}: with the hook restored the ui order points at its own hook again`, approvalPointer.test(composed(bareOut)) && !composed(bareOut).includes(ownedHook), composed(bareOut))

  const orchestrateSkill = readFileSync(join(REPO_ROOT, ".claude", "skills", "orchestrate", "SKILL.md"), "utf8")
  T(
    `${TOOL}: the skill makes every unattended agent brief point at the approval hook`,
    /Every agent brief in an unattended run forbids commands that ask for an approval/.test(orchestrateSkill) &&
      orchestrateSkill.includes(".claude/hooks/forbid-approval-prompt.mjs") && orchestrateSkill.includes("node tools/wait-background-runs.mjs"),
  )
  const rule14 = readFileSync(join(REPO_ROOT, ".claude", "playbooks", "review-and-audit.md"), "utf8")
  const rule14Body = rule14.slice(rule14.indexOf("**BLOCKING and NOTE.**"), rule14.indexOf("**The body is evidence, not code.**"))
  const rule14Brief = rule14.slice(rule14.indexOf("#### The review brief"))
  T(
    `${TOOL}: rule 14 points at the brief for BLOCKING and NOTE, and the ranking by lens is written once in the playbook`,
    /The review brief below owns the definition of BLOCKING and NOTE/.test(rule14Body) &&
      /File a NOTE one time on the ticket that owns its area/.test(rule14Body) &&
      /A NOTE starts no fix round/.test(rule14Body) &&
      /false statement in the pull request body goes under `## Body`, and the coordinator fixes it/.test(rule14Body) &&
      !/matter of taste|confirmed defect/.test(rule14Body) &&
      rule14.split("BLOCKING is every confirmed finding under a lens above that this diff makes").length === 2 &&
      !/only when one of these is true|failing probe against the acceptance|No open search|at most one finding|new spelling/.test(rule14),
    rule14Body,
  )
  T(
    `${TOOL}: rule 14 reads the whole diff on every pass and fixes every instance of each class`,
    /A review pass, a fix-round pass included, reads the whole diff of the pull request against its merge base/.test(rule14Body) &&
      /fixes every instance of each class in one commit, including an instance outside the changed lines that the diff caused/.test(rule14Body) &&
      /Each class gets one table test, with a row for each instance that a test can see, proven red with the guard removed/.test(rule14Body) &&
      /An instance that no test can see \(a comment, a doc or an unused export\) has no guard to remove: it needs only the edit, and the report names it/.test(rule14Body) &&
      !/reads only the new commits|narrows this to the new commits|do not search for new forms of a class/.test(rule14),
    rule14Body,
  )
  T(
    `${TOOL}: the review brief ranks by cause, so a regression outside the changed lines is BLOCKING and an older defect is a NOTE`,
    /BLOCKING is every confirmed finding under a lens above that this diff makes, in the changed lines or in code they break \(a case that passed on \`main\` or on the earlier head fails at this head, such as an unchanged caller of a renamed export\)\. NOTE is a matter of taste with no wrong result, or a defect that the diff did not make/.test(rule14Brief) &&
      /NOTE is a matter of taste with no wrong result, or a defect that the diff did not make/.test(rule14Brief) &&
      /list every instance, one \`path:line\` each, including an instance outside the changed lines that the diff caused/.test(rule14Brief),
    rule14Brief,
  )
  T(
    `${TOOL}: the review brief lets its lenses own what a defect is, so no finding under a lens ranks as a NOTE`,
    /The lenses above own what a defect is\. BLOCKING is every confirmed finding under a lens above/.test(rule14Brief) &&
      /Find every defect that the GitHub reviewer \(Pullfrog\) would open a thread for, so that the next round can approve\. You are READ-ONLY/.test(rule14Brief) &&
      /- A wrong claim: a comment, a doc comment or a doc that contradicts the code\./.test(rule14Brief) &&
      /- Dead code: an export, a prop, a branch, a helper or a test helper that nothing uses after this diff\./.test(rule14Brief),
    rule14Brief,
  )
  T(
    `${TOOL}: the review brief owns the free-text content: its scope, its exclusion and its fix, and it ranks like any other lens`,
    /A guess at free text in code whose behaviour depends on reading natural-language input: a word list or a regex that reads prose\. A test assertion that pins doc text is not such code\. The fix is a structured input or a deletion, never one more pattern/.test(rule14Brief) &&
      rule14.split("one more pattern").length === 2,
    rule14Brief,
  )
  T(
    `${TOOL}: orchestration sends a free-text class to its lens in the review brief and leaves its rank to rule 14`,
    /fix a free-text guess as its lens in the review\s+brief says/.test(orchestrateSkill) &&
      !/never with one more pattern/.test(orchestrateSkill),
    orchestrateSkill,
  )
  T(
    `${TOOL}: the review brief lists each class with every instance as path:line`,
    /name the class one time and list every instance, one \`path:line\` each, including an instance outside the changed lines that the diff caused/.test(rule14Brief) &&
      /one numbered item for each class, with the rank, the class, every instance as \`path:line\`/.test(rule14Brief) &&
      !/at most one finding|do not search for new forms/.test(rule14Brief),
    rule14Brief,
  )
  T(
    `${TOOL}: orchestration step 8 and the finding split state the same BLOCKING and NOTE rule as rule 14`,
    /FIX every BLOCKING finding, every instance of its class in one commit/.test(orchestrateSkill) &&
      /\*\*FIX it in this pull request\*\* when rule 14 ranks it BLOCKING\. A thread on a regression that this pull\s+request causes in code it did not touch gets the BLOCKING rank too\. Fix it as the paragraph "Fix\s+every instance of a class" of rule 14 says/.test(orchestrateSkill) &&
      /The round note of a batch names each defect class one time and lists every instance, one `path:line` each,\s+including an instance outside the changed lines that the pull request caused\. The next review reads\s+the whole diff/.test(orchestrateSkill) &&
      /\*\*FILE it\*\* when rule 14 ranks it a NOTE\. File its class one time/.test(orchestrateSkill) &&
      /A thread on a regression that this pull\s+request causes in code it did not touch gets the BLOCKING rank too/.test(orchestrateSkill) &&
      !/a failing probe against the acceptance/.test(orchestrateSkill),
    orchestrateSkill,
  )
  T(
    `${TOOL}: orchestration resolves review batch threads before its single push`,
    /compose its order with `--review-batch`/.test(orchestrateSkill) &&
      /worker commits, runs the\s+focused tests of its change, reports the commit SHA and stops without pushing/.test(orchestrateSkill) &&
      /resolve every identified thread on that commit, run the local review\s+gate on it, then push once/.test(orchestrateSkill) &&
      !/A worker cannot keep that order\s+under today's contract/.test(orchestrateSkill),
    orchestrateSkill,
  )
  T(
    `${TOOL}: orchestration writes a review batch's report into the pull request body before resolving`,
    /Its final report is the batch's\s+handoff/.test(orchestrateSkill) &&
      /`## Test evidence`, `## Assumptions` and `## Manual steps`/.test(orchestrateSkill) &&
      /node tools\/merge-review-batch-body\.mjs --body-file <current-body> --report-file <worker-report> --out <merged-body>/.test(orchestrateSkill) &&
      /gh pr edit <n> --body-file <merged-body>/.test(orchestrateSkill),
    orchestrateSkill,
  )
  T(
    `${TOOL}: orchestration preserves earlier handoff entries across two review batches`,
    /Merge new entries into the existing `## Test evidence`, `## Assumptions` and `## Manual steps` sections/.test(orchestrateSkill) &&
      /An empty second batch section preserves the first batch's entries/.test(orchestrateSkill) &&
      /Deduplicate repeated evidence/.test(orchestrateSkill),
    orchestrateSkill,
  )
  const sleepSkill = readFileSync(join(REPO_ROOT, ".claude", "skills", "sleep", "SKILL.md"), "utf8")
  T(
    `${TOOL}: the sleep entry policy selects --review-batch for review fixes and keeps resolve-before-push`,
    /composed with `--review-batch`/.test(sleepSkill) && /stops WITHOUT pushing/.test(sleepSkill) &&
      /resolves every thread on that commit, then pushes once/.test(sleepSkill),
    sleepSkill,
  )
  const toolsCatalog = readFileSync(join(REPO_ROOT, "tools", "README.md"), "utf8")
  T(
    `${TOOL}: the tools catalog documents --review-batch in the compose-prompt usage`,
    /--review-batch \\\| --cloud\]/.test(toolsCatalog) && /`--review-batch` selects a local review fix/.test(toolsCatalog),
    "tools/README.md compose-prompt row",
  )
  for (const [mode, order] of [
    ["local", prompt],
    ["Cloud", cloudPrompt],
  ]) {
    T(
      `${TOOL}: ${mode} requires the unchanged covered test before edits and a failing strengthened test before the fix`,
      /When a round fixes a defect that an existing test did not catch/.test(order) &&
        /Before changing the test or implementation, run that existing test unchanged/.test(order) &&
        /report whether it passes with the defect present/.test(order) &&
        /strengthen the test to exercise the real failing path and run it with the defect still present/.test(order) &&
        /Observe it fail for the intended reason before fixing the implementation/.test(order) &&
        /After the fix, rerun it and confirm it passes/.test(order),
      order,
    )
    T(
      `${TOOL}: ${mode} delivers both red-first observations with commands and outcomes to review`,
      /Both observations must reach the pull request body/.test(order) &&
        /unchanged test with the defect present, and strengthened test failing before the fix/.test(order) &&
        /Name the test, exact commands, and observed outcomes/.test(order) &&
        /If either observation cannot be obtained, report why; never claim an unobserved result/.test(order) &&
        (mode === "Cloud"
          ? /Record both observations in the committed handoff's `testResults` for the orchestrator to carry into the PR body/.test(order)
          : /Put both observations in the PR body's `## Test evidence` section/.test(order)),
      order,
    )
  }
  const architectureRule = "You may run `node tools/arch-map.mjs` to read the generated map. Never stage or commit `architecture.json`, `architecture.html` or `architecture.mmd`."
  for (const skill of ["orchestrate", "ticket"]) {
    const skillText = readFileSync(join(REPO_ROOT, ".claude", "skills", skill, "SKILL.md"), "utf8")
    T(
      `${TOOL}: ${skill} skill keeps generated architecture artifacts out of delivery`,
      skillText.includes(architectureRule) && !/architecture artifacts/.test(skillText),
      skillText,
    )
  }
  for (const [mode, order] of [
    ["local", prompt],
    ["review batch", reviewMainPrompt],
    ["Cloud", cloudPrompt],
  ]) {
    T(
      `${TOOL}: ${mode} permits reading the architecture map and forbids staging every generated artifact`,
      order.includes(architectureRule),
      order,
    )
    const otherInstructions = order.replace(architectureRule, "")
    for (const artifact of ["architecture.json", "architecture.html", "architecture.mmd"]) {
      T(
        `${TOOL}: ${mode} has no other staging or commit instruction for ${artifact}`,
        !otherInstructions.split("\n").some((line) => line.includes(artifact) && /\b(?:stag(?:e|ed|ing)|commit(?:ted|ting)?)\b/i.test(line)),
        otherInstructions,
      )
    }
    T(
      `${TOOL}: ${mode} scope does not require architecture artifacts in the pull request`,
      !/architecture artifacts\s+with the module or route change/.test(order),
      order,
    )
  }
  T(
    `${TOOL}: Cloud retains the ticket and decision escalation without instructions to push or open a PR`,
    cloudPrompt.startsWith("# Ticket body\n\nKeep this verbatim.") &&
      /NEEDS_DECISION/.test(cloudPrompt) && /manualSteps/.test(cloudPrompt) &&
      /committed handoff's `assumptions` array/.test(cloudPrompt) &&
      /record the question in the handoff's `needsDecision` field/.test(cloudPrompt) &&
      /\.claude\/cloud-handoff.json/.test(cloudPrompt) &&
      /Use the current container checkout/.test(cloudPrompt) && !cloudPrompt.includes(REPO_PATH) &&
      /Never push, never create a branch, never open a pull request/.test(cloudPrompt) &&
      !/commit and push|open your pull request against|One commit series on your branch, pushed|## Finishing contract|gh pr (create|ready|view|checks)/.test(cloudPrompt),
    cloudPrompt,
  )
  T(
    `${TOOL}: submitting a composed Cloud order keeps one commit-first contract`,
    cloudOrder(cloudPrompt) === cloudPrompt &&
      cloudPrompt.includes("## Cloud finishing contract\n\n**Commit the implementation. Without a commit there is no diff and the work is lost.**\n\n-") &&
      /Do not wait on CI or poll GitHub Actions/.test(cloudPrompt),
    cloudOrder(cloudPrompt),
  )
  const otherCloud = stageWithConfig("compose-prompt-other-cloud", TOOL, {
    ...real, repos: { ui: REPO_PATH, api: join(root, "compose-prompt", "repo-api") },
    cloud: { ...real.cloud, repositoryKey: "api" },
  })
  check(
    TOOL,
    "refuses Cloud orders outside the configured repository before reading a ticket",
    ["--issue", "ORB-215", "--repo", "ui", "--out", cloudOut, "--cloud"],
    { status: 2, stderr: /--cloud is bound to repository api; ui must run locally/ },
    { path: otherCloud.path, env: orcaEnv([]) },
  )

  /**
   * The regression this file exists to hold. Three documents claimed comments already reached the
   * worker while this tool read only the body, so /orchestrate step 2b's answers stopped at the
   * reviewer. A prompt that drops a comment is a prompt missing half its work order.
   * The response arrives newest first with a minimized comment in the middle: neither order nor visibility is trusted.
   */
  const withComments = join(root, "compose-prompt", "with-comments.md")
  check(
    TOOL,
    "carries the ticket's comments into the prompt, oldest first",
    ["--issue", "ORB-215", "--repo", "ui", "--out", withComments],
    { status: 0 },
    options(ticketPlan(ticket(), [
      comment("Answer two: ship without the icon.", "2026-08-13T19:30:00Z"),
      comment("Withdrawn: use Lucide after all.", "2026-08-13T19:10:00Z", true),
      comment("Answer one: Tabler, never Lucide."),
    ])),
  )
  const commented = composed(withComments)
  T(`${TOOL}: the body still leads the prompt`, commented.startsWith("# Ticket body\n\nKeep this verbatim."), commented.slice(0, 200))
  T(`${TOOL}: every visible comment body reaches the worker`, commented.includes("Answer one: Tabler, never Lucide.") && commented.includes("Answer two: ship without the icon."), commented)
  T(`${TOOL}: a shuffled response is still rendered oldest first`, commented.indexOf("Answer one") < commented.indexOf("Answer two"), commented)
  T(`${TOOL}: a minimized comment never becomes part of the work order`, !commented.includes("Withdrawn: use Lucide after all."), commented)
  T(`${TOOL}: each comment carries its author and date so the later-wins rule is applicable`, /### thomasluizon on 2026-08-13T19:30:00Z/.test(commented), commented)
  T(`${TOOL}: the prompt states that the later comment wins`, /the LATER comment wins/.test(commented), commented)

  const wrongTarget = join(root, "compose-prompt", "wrong-target.md")
  check(
    TOOL,
    "a wrong repository label is refused before the prompt file is written",
    ["--issue", "ORB-215", "--repo", "ui", "--out", wrongTarget],
    { status: 2, stderr: /expected exactly repo:ui/ },
    options(ticketPlan(ticket({ labels: [{ name: "repo:api" }] }))),
  )
  T(`${TOOL}: repository refusal writes no prompt`, !existsSync(wrongTarget))

  check(
    TOOL,
    "an ORB identifier absent from the map is refused without a raw-number retry",
    ["--issue", "ORB-999999", "--repo", "ui", "--out", join(root, "compose-prompt", "unknown.md")],
    { status: 2, stderr: /Unknown migrated ticket ORB-999999/ },
    options([]),
  )

  check(
    TOOL,
    "a ticket read error is refused rather than composed",
    ["--issue", "ORB-215", "--repo", "ui", "--out", join(root, "compose-prompt", "read-error.md")],
    { status: 2, stderr: /failed to compose ORB-215: gh api repos\/.* failed: issue not found/ },
    options([
      { match: "api repos/thomasluizon/orbit-tickets/issues/221 --jq", stdout: "", stderr: "issue not found", exit: 1 },
      { match: "project item-list 2 --owner thomasluizon", stdout: projectItems },
    ]),
  )
}
