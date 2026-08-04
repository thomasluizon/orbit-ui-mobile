import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { root, stage, orcaEnv, check, T, toolPath, INTERACTIVE_CODEX, LINEAR_TEAM_REQUIRED_ERROR, VALID_TICKET_BODY, VALID_ISSUE } from "./_harness.mjs"



export const cases = () => {
    const fixtureValidationError = (match, response) => {
      try {
        orcaEnv([{ match, stdout: JSON.stringify(response) }])
        return ""
      } catch (error) {
        return error.message
      }
    }
    const inventedParentError = fixtureValidationError("linear issue ORB-113 --relations", {
      ok: true,
      result: { issue: { identifier: "ORB-113", parent: { identifier: "ORB-112" } }, relations: [] },
    })
    T(
      "check-ticket.mjs: a Linear fixture cannot assert a key absent from the recorded invocation envelope",
      /linear issue[\s\S]*\$\.result\.issue\.parent/.test(inventedParentError),
      inventedParentError || "invented parent key was accepted",
    )
    const inventedStateError = fixtureValidationError("linear issue ORB-113", {
      ok: true,
      result: { issue: { identifier: "ORB-113", state: { type: "invented-state" } } },
    })
    T(
      "check-ticket.mjs: a Linear fixture cannot assert an external enum literal absent from the vendor artifact",
      /linear issue[\s\S]*\$\.result\.issue\.state\.type[\s\S]*invented-state/.test(inventedStateError),
      inventedStateError || "invented state enum was accepted",
    )
    const wrongTypeError = fixtureValidationError("linear issue ORB-113", {
      ok: true,
      result: { issue: { identifier: 113 } },
    })
    T(
      "check-ticket.mjs: a Linear fixture cannot change the recorded type of a key",
      /linear issue[\s\S]*type number[\s\S]*\$\.result\.issue\.identifier/.test(wrongTypeError),
      wrongTypeError || "wrong identifier type was accepted",
    )
    let unknownCommandError = ""
    try {
      orcaEnv([{ match: "linear imaginary-subcommand", stdout: "not-json", allowNonJsonLinear: true }])
    } catch (error) {
      unknownCommandError = error.message
    }
    T(
      "check-ticket.mjs: an unknown Linear subcommand has no envelope even when its output is unparseable",
      /linear imaginary-subcommand[\s\S]*no recorded invocation envelope/.test(unknownCommandError),
      unknownCommandError || "unknown Linear subcommand was accepted",
    )
    let undeclaredNonJsonError = ""
    try {
      orcaEnv([{ match: "linear issue ORB-113", stdout: "not-json" }])
    } catch (error) {
      undeclaredNonJsonError = error.message
    }
    T(
      "check-ticket.mjs: intentional non-JSON Linear output must be declared by that plan entry",
      /linear issue ORB-113[\s\S]*allowNonJsonLinear/.test(undeclaredNonJsonError),
      undeclaredNonJsonError || "undeclared non-JSON Linear output was accepted",
    )
    let declaredJsonNullError = ""
    try {
      orcaEnv([{ match: "linear issue ORB-113", stdout: "null", allowNonJsonLinear: true }])
    } catch (error) {
      declaredJsonNullError = error.message
    }
    T(
      "check-ticket.mjs: a non-JSON declaration cannot bypass validation for parseable JSON",
      /linear issue ORB-113[\s\S]*type null[\s\S]*\$/.test(declaredJsonNullError),
      declaredJsonNullError || "a declared JSON null bypassed the recorded envelope",
    )
    for (const [command, expectedEnvelope] of [
      ["linear create", "createError"],
      ["linear team labels --team ORB --json", "teamLabelsError"],
    ]) {
      let dispatchError = ""
      try {
        orcaEnv([{ match: command, stdout: LINEAR_TEAM_REQUIRED_ERROR, exit: 1 }])
      } catch (error) {
        dispatchError = error.message
      }
      T(
        `check-ticket.mjs: ${command} errors use the ${expectedEnvelope} envelope before success dispatch`,
        dispatchError === "",
        dispatchError,
      )
    }
    let sequenceError = ""
    try {
      orcaEnv([{
        match: "linear issue ORB-113",
        sequence: [
          JSON.stringify({ ok: true, result: { issue: { identifier: "ORB-113" } } }),
          JSON.stringify({ ok: true, result: { issue: { identifier: "ORB-113", invented: true } } }),
        ],
      }])
    } catch (error) {
      sequenceError = error.message
    }
    T(
      "check-ticket.mjs: every response in a Linear fixture sequence is envelope-checked",
      /linear issue[\s\S]*\$\.result\.issue\.invented/.test(sequenceError),
      sequenceError || "invented sequence key was accepted",
    )
    check("check-ticket.mjs", "an incomplete body is rejected", ["--file", stage("ticket.md", "# A ticket\n\nno template sections here\n")], { nonZero: true })
    check("check-ticket.mjs", "a missing body file is a usage error", ["--file", join(root, "absent.md")], { status: 2 })
    const criteriaTicket = (...items) =>
      VALID_TICKET_BODY.replace("- the created identifier is the one validated\n\n- a defective ticket exits 1", items.join("\n\n"))
    check(
      "check-ticket.mjs",
      "an acceptance criterion quantifying over an open set is rejected",
      ["--file", stage("ticket-open-set.md", criteriaTicket("- every phrasing a worker could emit is blocked", "- a defective ticket exits 1"))],
      { status: 1, stderr: /quantifies over an open set/ },
    )
    check(
      "check-ticket.mjs",
      "the same criterion passes once it names the command that decides it",
      ["--file", stage("ticket-bounded-set.md", criteriaTicket("- every phrasing rejected by `node tools/check-ticket.mjs` is blocked", "- a defective ticket exits 1"))],
      { status: 0, stdout: /ticket ok/ },
    )
    check(
      "check-ticket.mjs",
      "a bound outside the quantified clause does not rescue an open set",
      ["--file", stage("ticket-stray-bound.md", criteriaTicket("- every phrasing a worker could emit is blocked and the command exits 1", "- a defective ticket exits 1"))],
      { status: 1, stderr: /quantifies over an open set/ },
    )
    check(
      "check-ticket.mjs",
      "an acceptance criterion trailing off into an unnamed remainder is rejected",
      ["--file", stage("ticket-open-tail.md", criteriaTicket("- the two documented reasons are covered, etc.", "- a defective ticket exits 1"))],
      { status: 1, stderr: /trails off into an unnamed remainder/ },
    )
    const visibleTicket = (evidence = "") => [
      "# Validate visible effect evidence",
      "",
      VALID_TICKET_BODY,
      "",
      "The component behavior is user-visible.",
      evidence,
    ].join("\n")
    check(
      "check-ticket.mjs",
      "a visible-effect body with screenshots and critique passes",
      ["--file", stage("ticket-visible-complete.md", visibleTicket("Final screenshots and the critique artifact are attached before In Review."))],
      { status: 0, stdout: /ticket ok/ },
    )
    check(
      "check-ticket.mjs",
      "a visible-effect body with screenshots but no critique names the missing critique",
      ["--file", stage("ticket-visible-no-critique.md", visibleTicket("Final screenshots are attached before In Review."))],
      { status: 1, stderr: /DEFECTIVE TICKET \(1 problems\)[\s\S]*critique artifact is attached before In Review/ },
    )
    check(
      "check-ticket.mjs",
      "a visible-effect body with neither screenshots nor critique fails both requirements",
      ["--file", stage("ticket-visible-no-evidence.md", visibleTicket())],
      { status: 1, stderr: /DEFECTIVE TICKET \(2 problems\)[\s\S]*final screenshots are attached before In Review[\s\S]*critique artifact is attached before In Review/ },
    )
    check(
      "check-ticket.mjs",
      "a visible-effect word inside a hyphenated identifier does not demand screenshots",
      ["--file", stage("ticket-hyphenated-identifier.md", `# Gate the hyphenated identifier case\n\n${VALID_TICKET_BODY}\n\nRoot cause: string-not-act\n`)],
      { status: 0, stdout: /ticket ok/ },
    )
    const issueStub = (labels, description = VALID_TICKET_BODY, relations = []) =>
      orcaEnv([
        {
          match: "linear issue ORB-113",
          stdout: JSON.stringify({
            ok: true,
            result: {
              issue: {
                identifier: "ORB-113",
                title: "Gate the Linear ticket type taxonomy",
                description,
                labels: labels.map((name) => ({ name })),
              },
              relations,
            },
          }),
        },
      ])
    check(
      "check-ticket.mjs",
      "issue mode rejects zero type labels and names every valid value",
      ["--issue", "ORB-113"],
      { status: 1, stderr: /exactly ONE type label required \(Feature, Bug, Improvement\); found: none/ },
      { env: issueStub(["repo:api"]) },
    )
    check(
      "check-ticket.mjs",
      "issue mode accepts exactly one type label",
      ["--issue", "ORB-113"],
      { status: 0, stdout: /ticket ok/ },
      { env: issueStub(["repo:api", "Improvement"]) },
    )
    check(
      "check-ticket.mjs",
      "issue mode rejects two type labels",
      ["--issue", "ORB-113"],
      { status: 1, stderr: /exactly ONE type label required \(Feature, Bug, Improvement\); found: Feature, Bug/ },
      { env: issueStub(["repo:api", "Feature", "Bug"]) },
    )
    check(
      "check-ticket.mjs",
      "the repo label rule still rejects two repo labels alongside one type",
      ["--issue", "ORB-113"],
      { status: 1, stderr: /exactly ONE repo label required/ },
      { env: issueStub(["repo:api", "repo:ui", "parity:no", "Feature"]) },
    )
    check(
      "check-ticket.mjs",
      "file mode remains unaffected by issue-only label validation",
      ["--file", stage("valid-ticket.md", `# Gate the Linear ticket type taxonomy\n\n${VALID_TICKET_BODY}\n`)],
      { status: 0, stdout: /ticket ok/ },
    )
    /**
     * C3: the heading alone used to satisfy the affected-files section. A ticket with no parseable
     * path collides with every other ticket in its wave, because wave-plan.mjs can only intersect
     * paths it can read, so silence must not buy parallelism.
     */
    const affectedSection = (contents) =>
      VALID_TICKET_BODY.replace("## Affected modules / files\n\ntools/test-tools.mjs", `## Affected modules / files\n\n${contents}`)
    check(
      "check-ticket.mjs",
      "an affected-files heading with no parseable path is refused naming the heading",
      ["--file", stage("ticket-affected-prose.md", `# Gate the affected files path list\n\n${affectedSection("the merge decision path and its catalog row")}\n`)],
      { status: 1, stderr: /Affected modules \/ files carries the heading but names no parseable path/ },
    )
    check(
      "check-ticket.mjs",
      "one parseable path under the heading passes",
      ["--file", stage("ticket-affected-one-path.md", `# Gate the affected files path list\n\n${affectedSection("- `tools/check-ticket.mjs`")}\n`)],
      { status: 0, stdout: /ticket ok/ },
    )
    check(
      "check-ticket.mjs",
      "a wildcard affected scope passes validation for conservative wave serialization",
      ["--file", stage("ticket-affected-wildcard.md", `# Gate the affected files path list\n\n${affectedSection("- .claude/**")}\n`)],
      { status: 0, stdout: /ticket ok/ },
    )
    check(
      "check-ticket.mjs",
      "a path only inside a fenced block under the heading does not count as declared",
      ["--file", stage("ticket-affected-fenced.md", `# Gate the affected files path list\n\n${affectedSection("```\ntools/check-ticket.mjs\n```")}\n`)],
      { status: 1, stderr: /Affected modules \/ files carries the heading but names no parseable path/ },
    )
    /**
     * The gate and the collision report must accept exactly the same path list, and that is now
     * structural: both import tools/lib/affected-files.mjs. This asserts the structure rather than
     * the behaviour, because a reintroduced local copy would pass every case above while silently
     * drifting from what wave-plan.mjs reads.
     */
    T(
      "check-ticket.mjs: the affected-files parser is the shared module, not a local copy",
      /^import \{ affectedFilesOf \} from "\.\/lib\/affected-files\.mjs"$/m.test(readFileSync(toolPath("check-ticket.mjs"), "utf8")),
      "check-ticket.mjs does not import affectedFilesOf from ./lib/affected-files.mjs; a local copy drifts from wave-plan.mjs unnoticed",
    )
    /**
     * D2: the guard used to carry /i on the whole pattern, which case-folded the IDENTIFIER too,
     * so every lowercase branch slug and package pin near a signal word read as a named
     * dependency. All eight strings below were measured against the live regex before the fix.
     */
    for (const [signal, slug, identifier] of [
      ["after", "Land this after feature/orb-163-c2-split-test-file is merged", "Land this after ORB-163 is merged"],
      ["once", "Run it once orb-164-c2-rubric-twin exists", "Run it once ORB-164 exists"],
      ["depends on", "Upgrade depends on expo-sdk-54 being pinned first", "Upgrade depends on ORB-112 being merged first"],
      ["blocked by", "Blocked by node-24 shipping in CI", "Blocked by ORB-164"],
    ]) {
      check(
        "check-ticket.mjs",
        `a lowercase slug near "${signal}" is not a named dependency`,
        ["--issue", "ORB-113"],
        { status: 0, stdout: /ticket ok/ },
        { env: issueStub(["repo:api", "Improvement"], `${VALID_TICKET_BODY}\n\n${slug}.`) },
      )
      check(
        "check-ticket.mjs",
        `a team identifier near "${signal}" still requires a blockedBy relation`,
        ["--issue", "ORB-113"],
        { status: 1, stderr: /body PROSE mentions a dependency/ },
        { env: issueStub(["repo:api", "Improvement"], `${VALID_TICKET_BODY}\n\n${identifier}.`) },
      )
    }
    for (const [name, prose] of [
      ["once used as a measured frequency", "The callback fires once for each matching label."],
      ["depends on used for ordinary logic", "The exact message depends on which labels are present."],
      ["after used as an ordinary sequence", "After validation, the checker prints ticket ok."],
      ["after used for process order", "Cleanup runs after the terminal exits."],
      ["once used for retry timing", "The launcher retries once the daemon is responsive."],
      ["depends on and blocked by used for ordinary behavior", "The branch name depends on configuration, and startup can be blocked by a trust prompt."],
    ]) {
      check(
        "check-ticket.mjs",
        `dependency prose ignores ${name}`,
        ["--issue", "ORB-113"],
        { status: 0, stdout: /ticket ok/ },
        { env: issueStub(["repo:api", "Improvement"], `${VALID_TICKET_BODY}\n\n${prose}`) },
      )
    }
    check(
      "check-ticket.mjs",
      "a genuine named dependency without a relation is rejected",
      ["--issue", "ORB-113"],
      { status: 1, stderr: /body PROSE mentions a dependency but the issue has no blockedBy relation/ },
      { env: issueStub(["repo:api", "Improvement"], `${VALID_TICKET_BODY}\n\n## Dependencies (blockedBy)\n\nThis work depends on ORB-112.`) },
    )
    check(
      "check-ticket.mjs",
      "a named issue blocker still requires a blockedBy relation",
      ["--issue", "ORB-113"],
      { status: 1, stderr: /body PROSE mentions a dependency/ },
      { env: issueStub(["repo:api", "Improvement"], `${VALID_TICKET_BODY}\n\nThis change is blocked by ORB-1.`) },
    )
    check(
      "check-ticket.mjs",
      "an issue named anywhere in Dependencies requires a blockedBy relation",
      ["--issue", "ORB-113"],
      { status: 1, stderr: /body PROSE mentions a dependency/ },
      { env: issueStub(["repo:api", "Improvement"], `${VALID_TICKET_BODY}\n\n## Dependencies\n\nRequires ORB-112.`) },
    )
    check(
      "check-ticket.mjs",
      "a Dependencies section with no issue and no dependency phrase is accepted",
      ["--issue", "ORB-113"],
      { status: 0, stdout: /ticket ok/ },
      { env: issueStub(["repo:api", "Improvement"], `${VALID_TICKET_BODY}\n\n## Dependencies\n\nNo cross-ticket relation is required.`) },
    )
    check(
      "check-ticket.mjs",
      "a dependency-free Dependencies section may use ordinary signal words",
      ["--issue", "ORB-113"],
      { status: 0, stdout: /ticket ok/ },
      {
        env: issueStub(
          ["repo:api", "Improvement"],
          `${VALID_TICKET_BODY}\n\nNo server restart is expected; a cache flush is required if that changes.\n\n## Dependencies\n\nNone. This can proceed once the security review completes.`,
        ),
      },
    )
    check(
      "check-ticket.mjs",
      "a named dependency with its blockedBy relation is accepted",
      ["--issue", "ORB-113"],
      { status: 0, stdout: /ticket ok/ },
      {
        env: issueStub(
          ["repo:api", "Improvement"],
          `${VALID_TICKET_BODY}\n\n## Dependencies\n\nRequires ORB-112.`,
          [{ relationship: "blockedBy", relatedIssue: { identifier: "ORB-112" } }],
        ),
      },
    )
    const linearKeyHome = join(root, "check-ticket-linear-key")
    mkdirSync(linearKeyHome, { recursive: true })
    writeFileSync(join(linearKeyHome, ".linear-api-key"), "fixture-key")
    /**
     * The parent arrives from the Linear GraphQL query, never from the orca payload. Verified
     * against ORB-150: `orca linear issue <id> --relations --json` returns 17 issue keys with no
     * `parent` among them and `relations: []`, while Linear reports that issue's parent as
     * ORB-140. A `parent` field stubbed onto the orca issue would be a fixture written to agree
     * with a shape orca does not produce, so every ledger case below drives the real fallback.
     */
    const linearParentEnv = (parent) => ({
      USERPROFILE: linearKeyHome,
      ORBIT_LINEAR_PARENT_STUB: JSON.stringify({ requireTimeout: true, body: { data: { issue: { parent } } } }),
    })
    const LEDGER_PARENT = { identifier: "ORB-140", title: "Harness defect ledger from the recorded run" }
    const ledgerIssue = (line) => ({
      ...VALID_ISSUE,
      id: "linear-ledger-child",
      description: `${VALID_TICKET_BODY}\n\n${line}`,
    })
    const checkIssue = (name, issue, expect, relations = [], env = {}, plan = []) =>
      check(
        "check-ticket.mjs",
        name,
        ["--issue", issue.identifier],
        expect,
        {
          env: {
            ...orcaEnv([
              { match: `linear issue ${issue.identifier}`, stdout: JSON.stringify({ ok: true, result: { issue, relations } }) },
              ...plan,
            ]),
            ...env,
          },
        },
      )
    const checkLedger = (name, line, expect) =>
      checkIssue(name, ledgerIssue(line), expect, [], linearParentEnv(LEDGER_PARENT))

    checkLedger("a ledger child with 7 occurrences passes", "Ledger occurrence: 7; blocked: no", { status: 0, stdout: /ticket ok/ })
    checkLedger("a ledger child at the threshold of 3 occurrences passes", "Ledger occurrence: 3; blocked: no", { status: 0, stdout: /ticket ok/ })
    checkLedger(
      "a non-blocking ledger child below the threshold fails with the count and threshold",
      "Ledger occurrence: 2; blocked: no",
      { status: 1, stderr: /2[\s\S]*threshold of 3/i },
    )
    for (const alias of [
      "false",
      "none",
      "n/a",
      "no.",
      "nothing",
      "did not block the run",
      "the defect could not block the run",
      "the defect could not have blocked the run",
      "the merge sweep was blocked by nothing",
      "prevented the merge sweep from being blocked",
    ]) {
      checkLedger(
        `a non-blocking ${alias} alias cannot bypass the threshold`,
        `Ledger occurrence: 2; blocked: ${alias}`,
        { status: 1, stderr: /literal no or an affirmative claim naming what it blocked/i },
      )
    }
    checkLedger(
      "a below-threshold ledger child passes when it names what blocked the run",
      "Ledger occurrence: 2; blocked: the merge sweep was blocked",
      { status: 0, stdout: /ticket ok/ },
    )
    checkLedger(
      "a bare blocking claim does not bypass the threshold",
      "Ledger occurrence: 2; blocked: yes",
      { status: 1, stderr: /literal no or an affirmative claim naming what it blocked/i },
    )
    checkLedger(
      "a bare blocking claim is rejected above the occurrence threshold",
      "Ledger occurrence: 5; blocked: true",
      { status: 1, stderr: /literal no or an affirmative claim naming what it blocked/i },
    )
    for (const claim of [
      "blocked the merge sweep",
      "the merge sweep was blocked",
    ]) {
      checkLedger(
        `an affirmative ${claim} claim passes below the threshold`,
        `Ledger occurrence: 2; blocked: ${claim}`,
        { status: 0, stdout: /ticket ok/ },
      )
    }
    checkIssue(
      "a ledger child with no occurrence line fails",
      { ...VALID_ISSUE, id: "linear-ledger-no-line" },
      { status: 1, stderr: /missing[\s\S]*Ledger occurrence/i },
      [],
      linearParentEnv(LEDGER_PARENT),
    )
    checkIssue(
      "a recorded non-ledger child ticket is unaffected",
      { ...VALID_ISSUE, id: "linear-non-ledger-child" },
      { status: 0, stdout: /ticket ok/ },
      [],
      linearParentEnv({ identifier: "ORB-88", title: "Ordinary project parent" }),
    )
    checkLedger(
      "an unparseable ledger occurrence line fails",
      "Ledger occurrence: several; blocked: no",
      { status: 1, stderr: /ledger occurrence line is unparseable/i },
    )
    const noLinearKeyHome = join(root, "check-ticket-no-linear-key")
    mkdirSync(noLinearKeyHome, { recursive: true })
    /**
     * D1, and this case asserted the fail-open as correct until 2026-07-31. An orca payload
     * carrying no parent evidence proves nothing about a parent, so it must consult Linear; an
     * unreadable lookup is a tool error, never a silent pass.
     */
    checkIssue(
      "an issue whose payload carries no parent evidence refuses rather than assuming it is parentless",
      { ...VALID_ISSUE, id: "linear-standalone-id" },
      { status: 2, stderr: /could not read the Linear parent relation[\s\S]*\.linear-api-key/ },
      [],
      { USERPROFILE: noLinearKeyHome },
    )
    checkIssue(
      "a genuinely parentless issue still validates once the parent lookup answers with no parent",
      { ...VALID_ISSUE, id: "linear-parentless-id" },
      { status: 0, stdout: /ticket ok/ },
      [],
      linearParentEnv(null),
    )
    checkIssue(
      "a Linear parent GraphQL error exits with a tool error",
      { ...VALID_ISSUE, id: "linear-parent-error" },
      { status: 2, stderr: /could not read the Linear parent relation[\s\S]*fixture GraphQL failure/i },
      [],
      {
        USERPROFILE: linearKeyHome,
        ORBIT_LINEAR_PARENT_STUB: JSON.stringify({
          status: 200,
          body: { errors: [{ message: "fixture GraphQL failure" }] },
        }),
      },
    )
    /**
     * D5/D5a, the filing gate. Scoped to the `harness` Linear label, keyed to the committed
     * tools/harness-roots.json registry rather than to Linear, which neither path here can
     * enumerate. The owning ticket's state comes through the stubbed orca call, so no case here
     * depends on where a real ticket happens to sit on the board today.
     */
    const HARNESS_ROOT_OWNER = "ORB-163"
    const harnessIssue = (identifier, rootCauseLine) => ({
      ...VALID_ISSUE,
      identifier,
      id: `linear-${identifier.toLowerCase()}`,
      description: rootCauseLine === null ? VALID_TICKET_BODY : `${VALID_TICKET_BODY}\n\n${rootCauseLine}`,
      labels: [{ name: "repo:api" }, { name: "Improvement" }, { name: "harness" }],
    })
    const ownerStatePlan = (stateType) => [{
      match: `linear issue ${HARNESS_ROOT_OWNER} --json`,
      stdout: JSON.stringify({
        ok: true,
        result: { issue: { identifier: HARNESS_ROOT_OWNER, state: { name: "In Progress", type: stateType } } },
      }),
    }]
    checkIssue(
      "a harness ticket claiming the exempt root cause claims nothing and is accepted",
      harnessIssue("ORB-901", "Root cause: exempt. This is a consolidating repair ticket."),
      { status: 0, stdout: /ticket ok/ },
      [],
      linearParentEnv(null),
    )
    checkIssue(
      "a harness ticket naming an unregistered root cause is refused",
      harnessIssue("ORB-902", "Root cause: not-a-registered-root"),
      { status: 1, stderr: /not registered in tools\/harness-roots\.json[\s\S]*string-not-act/ },
      [],
      linearParentEnv(null),
    )
    checkIssue(
      "a second harness ticket naming an already filed root is refused with the owning ticket named",
      harnessIssue("ORB-903", "Root cause: string-not-act"),
      { status: 1, stderr: /already filed as ORB-163, which is still open \(started\); add to ORB-163/ },
      [],
      linearParentEnv(null),
      ownerStatePlan("started"),
    )
    checkIssue(
      "the same root becomes filable again once its owning ticket is closed",
      harnessIssue("ORB-904", "Root cause: string-not-act"),
      { status: 0, stdout: /ticket ok/ },
      [],
      linearParentEnv(null),
      ownerStatePlan("completed"),
    )
    checkIssue(
      "an unreadable owning-ticket state is a tool error, never a pass",
      harnessIssue("ORB-905", "Root cause: stale-source"),
      { status: 2, stderr: /could not read the state of ORB-163[\s\S]*fixture orca failure/ },
      [],
      linearParentEnv(null),
      [{ match: `linear issue ${HARNESS_ROOT_OWNER} --json`, stdout: JSON.stringify({ ok: false, error: { message: "fixture orca failure" } }) }],
    )
    checkIssue(
      "the ticket that owns a root is not refused for naming its own root",
      harnessIssue(HARNESS_ROOT_OWNER, "Root cause: string-not-act"),
      { status: 0, stdout: /ticket ok/ },
      [],
      linearParentEnv(null),
    )
    /**
     * The label is readable here, so a harness ticket that never classifies itself is refused,
     * not noted. The point of the gate is to force the classification; checking the spelling of
     * one somebody volunteered is what left ORB-164 unclassified and still green on 2026-07-31.
     * The refusal names both ways out, the registry and the reserved exempt value.
     */
    checkIssue(
      "a harness ticket with no Root cause line is refused",
      harnessIssue("ORB-906", null),
      { status: 1, stderr: /ORB-906 carries the harness label but no "Root cause:" line[\s\S]*tools\/harness-roots\.json[\s\S]*exempt/ },
      [],
      linearParentEnv(null),
    )
    checkIssue(
      "an unlabelled ticket is outside the root-cause registry's scope",
      { ...VALID_ISSUE, id: "linear-unlabelled-root", description: `${VALID_TICKET_BODY}\n\nRoot cause: not-a-registered-root` },
      { status: 0, stdout: /ticket ok/ },
      [],
      linearParentEnv(null),
    )
    /**
     * --file has no Linear labels to read, so it reads the drafted `Labels:` line the 6.2 body
     * opens with. The shape is the live one: `orca linear issue ORB-163 --full --json` returns a
     * description whose first line is
     * "Labels: repo:ui | parity:no | Improvement | Estimate: 8 points", and ORB-164's is the same
     * shape. The `harness` entry is what a draft intending that label writes there.
     */
    const HARNESS_DRAFT_LABELS = "Labels: repo:ui | parity:no | Improvement | harness"
    const harnessDraft = (name, rootCauseLine) =>
      stage(name, `# Gate the harness root cause registry\n\n${HARNESS_DRAFT_LABELS}\n\n${VALID_TICKET_BODY}${rootCauseLine === null ? "" : `\n\n${rootCauseLine}`}\n`)
    const registeredRootBody = harnessDraft("ticket-root-cause.md", "Root cause: string-not-act")
    check(
      "check-ticket.mjs",
      "file mode names the owning ticket and says it could not confirm that ticket is open",
      ["--file", registeredRootBody],
      { status: 0, stdout: /ticket ok/, stderr: /root cause string-not-act is owned by ORB-163[\s\S]*NOT checked/ },
    )
    check(
      "check-ticket.mjs",
      "file mode refuses an unregistered root cause",
      ["--file", harnessDraft("ticket-unregistered-root-cause.md", "Root cause: not-a-registered-root")],
      { status: 1, stderr: /not registered in tools\/harness-roots\.json/ },
    )
    check(
      "check-ticket.mjs",
      "a harness draft with no Root cause line is refused",
      ["--file", harnessDraft("ticket-harness-no-root-cause.md", null)],
      { status: 1, stderr: /claims the harness label but carries no "Root cause:" line[\s\S]*exempt/ },
    )
    /**
     * The measured false positive, in the literal string it was measured on. `/ticket` Phase D
     * puts a root-cause hypothesis in Technical details for EVERY defect and step 4 validates
     * every draft with --file, so an unscoped registry check captured the claim "A", called it
     * unregistered, and refused ordinary bug tickets at the entry point of the D1-D9 workflow.
     */
    const PROSE_ROOT_CAUSE = "Root cause: A race condition in the token refresh handler."
    check(
      "check-ticket.mjs",
      "a non-harness draft carrying a prose root-cause hypothesis is accepted",
      ["--file", stage("ticket-prose-root-cause.md", `# Fix the token refresh race condition\n\n${VALID_TICKET_BODY}\n\n${PROSE_ROOT_CAUSE}\n`)],
      { status: 0, stdout: /ticket ok/, stderr: /does not name harness[\s\S]*NOT applied/ },
    )
    const proseInHarnessDraft = check(
      "check-ticket.mjs",
      "a harness draft carrying a prose root-cause hypothesis is refused for not being an id",
      ["--file", harnessDraft("ticket-harness-prose-root-cause.md", PROSE_ROOT_CAUSE)],
      { status: 1, stderr: /Root cause: A is not a root-cause id[\s\S]*lowercase kebab-case/ },
    )
    T(
      "check-ticket.mjs: the id-shape refusal does not send the author to the registry instead",
      !/not registered in/.test(proseInHarnessDraft.stderr),
      `a prose claim must be refused for its shape, not reported as an unregistered root:\n     ${proseInHarnessDraft.stderr.trim()}`,
    )
    /**
     * A registry the tool cannot trust must stop the run. Each fixture is a full copy of the tool
     * beside a broken registry, because the real one is resolved from the tool's own location.
     */
    const stageRegistryFixture = (label, registryBody) => {
      const base = join(root, "harness-roots", label)
      mkdirSync(join(base, "tools"), { recursive: true })
      mkdirSync(join(base, ".claude"), { recursive: true })
      cpSync(toolPath("check-ticket.mjs"), join(base, "tools", "check-ticket.mjs"))
      // The whole lib, so a new import in the tool cannot turn these cases into module-not-found.
      cpSync(toolPath("lib"), join(base, "tools", "lib"), { recursive: true })
      cpSync(toolPath(join("..", ".claude", "orchestrator.json")), join(base, ".claude", "orchestrator.json"))
      writeFileSync(join(base, "tools", "harness-roots.json"), registryBody)
      return join(base, "tools", "check-ticket.mjs")
    }
    for (const [label, fault, registryBody, expected] of [
      ["unparseable", "is not JSON", "{ not json", /could not be read as JSON/],
      ["empty", "registers no root", JSON.stringify({ version: 1, roots: [] }), /must carry a non-empty roots array/],
      ["incomplete", "leaves an entry field empty", JSON.stringify({ version: 1, roots: [{ id: "a-root", definition: "", owner: "ORB-1" }] }), /needs a non-empty id, definition and owner/],
      ["duplicate-id", "registers one id twice", JSON.stringify({ version: 1, roots: [{ id: "a-root", definition: "d", owner: "ORB-1" }, { id: "a-root", definition: "d", owner: "ORB-2" }] }), /registers the id a-root twice/],
      ["reserved-id", "registers the reserved exempt id", JSON.stringify({ version: 1, roots: [{ id: "exempt", definition: "d", owner: "ORB-1" }] }), /must not register the reserved id exempt/],
      /**
       * The id shape a claim is measured against is enforced ON the registry too, so the two can
       * never drift: a registry free to hold "A Root Cause" would make the shape refusal a lie.
       */
      ["misshapen-id", "registers an id that is not kebab-case", JSON.stringify({ version: 1, roots: [{ id: "A Root Cause", definition: "d", owner: "ORB-1" }] }), /must be lowercase kebab-case/],
    ]) {
      check(
        "check-ticket.mjs",
        `a harness-roots registry that ${fault} stops the run as a tool error`,
        ["--file", registeredRootBody],
        { status: 2, stderr: expected },
        { path: stageRegistryFixture(label, registryBody) },
      )
    }
    /**
     * linear.team is interpolated into this tool's ISSUE_IDENTIFIER and SIGNAL_NAMING_ISSUE
     * patterns, so a hostile key would be a regex injection and an absent one would silently
     * match nothing. tools/__tests__/wave-plan.mjs covers the identical refusal in wave-plan.mjs;
     * these two are the same cases against this tool, so the pair cannot regress one-sided.
     */
    const stageConfiguredTeam = (label, team) => {
      const base = join(root, "check-ticket-team", label)
      mkdirSync(join(base, "tools"), { recursive: true })
      mkdirSync(join(base, ".claude"), { recursive: true })
      cpSync(toolPath("check-ticket.mjs"), join(base, "tools", "check-ticket.mjs"))
      cpSync(toolPath("lib"), join(base, "tools", "lib"), { recursive: true })
      cpSync(toolPath("harness-roots.json"), join(base, "tools", "harness-roots.json"))
      writeFileSync(
        join(base, ".claude", "orchestrator.json"),
        JSON.stringify({
          worker: "codex",
          workers: { codex: INTERACTIVE_CODEX },
          maxParallelWorktrees: 8,
          attemptsBeforeRewrite: 2,
          linear: { team },
          repos: {},
        }),
      )
      return join(base, "tools", "check-ticket.mjs")
    }
    check(
      "check-ticket.mjs",
      "refuses a team key it would have to interpolate, rather than sanitising it",
      ["--file", registeredRootBody],
      { status: 2, stderr: /must declare linear\.team as an alphanumeric key; got "ORB-\.\*"/ },
      { path: stageConfiguredTeam("hostile-team", "ORB-.*") },
    )
    check(
      "check-ticket.mjs",
      "refuses a configuration that declares no team at all",
      ["--file", registeredRootBody],
      { status: 2, stderr: /must declare linear\.team as an alphanumeric key; got undefined/ },
      { path: stageConfiguredTeam("absent-team", undefined) },
    )
  }
