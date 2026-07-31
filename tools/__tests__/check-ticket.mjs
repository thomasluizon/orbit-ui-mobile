import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { root, stage, orcaEnv, check, VALID_TICKET_BODY, VALID_ISSUE } from "./_harness.mjs"



export const cases = () => {
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
    const ledgerIssue = (line) => ({
      ...VALID_ISSUE,
      description: `${VALID_TICKET_BODY}\n\n${line}`,
      parent: { identifier: "ORB-140", title: "Harness defect ledger from the recorded run" },
    })
    const checkIssue = (name, issue, expect, relations = [], env = {}) =>
      check(
        "check-ticket.mjs",
        name,
        ["--issue", issue.identifier],
        expect,
        {
          env: {
            ...orcaEnv([{ match: `linear issue ${issue.identifier}`, stdout: JSON.stringify({ ok: true, result: { issue, relations } }) }]),
            ...env,
          },
        },
      )

    checkIssue("a ledger child with 7 occurrences passes", ledgerIssue("Ledger occurrence: 7; blocked: no"), { status: 0, stdout: /ticket ok/ })
    checkIssue("a ledger child at the threshold of 3 occurrences passes", ledgerIssue("Ledger occurrence: 3; blocked: no"), { status: 0, stdout: /ticket ok/ })
    checkIssue(
      "a non-blocking ledger child below the threshold fails with the count and threshold",
      ledgerIssue("Ledger occurrence: 2; blocked: no"),
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
      checkIssue(
        `a non-blocking ${alias} alias cannot bypass the threshold`,
        ledgerIssue(`Ledger occurrence: 2; blocked: ${alias}`),
        { status: 1, stderr: /literal no or an affirmative claim naming what it blocked/i },
      )
    }
    checkIssue(
      "a below-threshold ledger child passes when it names what blocked the run",
      ledgerIssue("Ledger occurrence: 2; blocked: the merge sweep was blocked"),
      { status: 0, stdout: /ticket ok/ },
    )
    checkIssue(
      "a bare blocking claim does not bypass the threshold",
      ledgerIssue("Ledger occurrence: 2; blocked: yes"),
      { status: 1, stderr: /literal no or an affirmative claim naming what it blocked/i },
    )
    checkIssue(
      "a bare blocking claim is rejected above the occurrence threshold",
      ledgerIssue("Ledger occurrence: 5; blocked: true"),
      { status: 1, stderr: /literal no or an affirmative claim naming what it blocked/i },
    )
    for (const claim of [
      "blocked the merge sweep",
      "the merge sweep was blocked",
    ]) {
      checkIssue(
        `an affirmative ${claim} claim passes below the threshold`,
        ledgerIssue(`Ledger occurrence: 2; blocked: ${claim}`),
        { status: 0, stdout: /ticket ok/ },
      )
    }
    checkIssue(
      "a ledger child with no occurrence line fails",
      { ...VALID_ISSUE, parent: { identifier: "ORB-140", title: "Harness defect ledger from the recorded run" } },
      { status: 1, stderr: /missing[\s\S]*Ledger occurrence/i },
    )
    checkIssue(
      "a recorded non-ledger child ticket is unaffected",
      { ...VALID_ISSUE, parent: { identifier: "ORB-88", title: "Ordinary project parent" } },
      { status: 0, stdout: /ticket ok/ },
    )
    checkIssue(
      "an unparseable ledger occurrence line fails",
      ledgerIssue("Ledger occurrence: several; blocked: no"),
      { status: 1, stderr: /ledger occurrence line is unparseable/i },
    )
    const noLinearKeyHome = join(root, "check-ticket-no-linear-key")
    mkdirSync(noLinearKeyHome, { recursive: true })
    const ledgerParentRelation = [{
      relationship: "parent",
      relatedIssue: { identifier: "ORB-140", title: "Harness defect ledger from the recorded run" },
    }]
    checkIssue(
      "an Orca parent relation validates without a separate Linear key",
      {
        ...VALID_ISSUE,
        id: "linear-child-id",
        description: `${VALID_TICKET_BODY}\n\nLedger occurrence: 3; blocked: no`,
      },
      { status: 0, stdout: /ticket ok/ },
      ledgerParentRelation,
      { USERPROFILE: noLinearKeyHome },
    )
    checkIssue(
      "an Orca ledger parent relation still requires the occurrence line",
      { ...VALID_ISSUE, id: "linear-child-without-line" },
      { status: 1, stderr: /missing[\s\S]*Ledger occurrence/i },
      ledgerParentRelation,
      { USERPROFILE: noLinearKeyHome },
    )
    checkIssue(
      "a standalone Orca issue validates without a separate Linear key",
      { ...VALID_ISSUE, id: "linear-standalone-id" },
      { status: 0, stdout: /ticket ok/ },
      [],
      { USERPROFILE: noLinearKeyHome },
    )
    const linearKeyHome = join(root, "check-ticket-linear-key")
    mkdirSync(linearKeyHome, { recursive: true })
    writeFileSync(join(linearKeyHome, ".linear-api-key"), "fixture-key")
    const partialParentRelation = [{
      relationship: "parent",
      relatedIssue: { identifier: "ORB-140" },
    }]
    checkIssue(
      "a partial Orca parent relation uses the bounded Linear fallback",
      {
        ...VALID_ISSUE,
        id: "linear-partial-parent",
        description: `${VALID_TICKET_BODY}\n\nLedger occurrence: 3; blocked: no`,
      },
      { status: 0, stdout: /ticket ok/ },
      partialParentRelation,
      {
        USERPROFILE: linearKeyHome,
        ORBIT_LINEAR_PARENT_STUB: JSON.stringify({
          requireTimeout: true,
          body: {
            data: {
              issue: {
                parent: { identifier: "ORB-140", title: "Harness defect ledger from the recorded run" },
              },
            },
          },
        }),
      },
    )
    checkIssue(
      "a Linear parent GraphQL error exits with a tool error",
      { ...VALID_ISSUE, id: "linear-parent-error" },
      { status: 2, stderr: /could not read the Linear parent relation[\s\S]*fixture GraphQL failure/i },
      partialParentRelation,
      {
        USERPROFILE: linearKeyHome,
        ORBIT_LINEAR_PARENT_STUB: JSON.stringify({
          status: 200,
          body: { errors: [{ message: "fixture GraphQL failure" }] },
        }),
      },
    )
  }
