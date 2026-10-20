---
name: second-opinion
description: Get an independent same-vendor second opinion (Claude Opus 5.5 via the local Claude CLI) on a specific, load-bearing technical claim or a Critical or High code-review finding. A separate call reads the claim and code, then returns AGREE, DISAGREE, or UNSURE. Its blind spots correlate with other Claude reads, so this is weaker than a cross-vendor read. Use to stress-test a single blocking finding, a risky assertion, or a close call before you commit to it. Nothing fires it automatically: you invoke it deliberately, one claim per call. Not for open-ended research (use /deep-research) or multi-lens judgement (use /llm-council).
argument-hint: <a claim to test, optionally with a file:line to pull context from>
---

# Second Opinion (same-vendor)

**Input**: $ARGUMENTS

Ask **Claude Opus 5.5** through the local `claude` CLI to independently judge one
concrete claim. Opus is reserved for the ambiguous, difficult, high-value decision,
where the cost is justified by the consequence of getting the call wrong. Run it
once per claim.

This is an independent same-vendor read with correlated blind spots, weaker than a
cross-vendor read. A smaller Claude model adds a capability difference, not a different
training lineage. Treat `AGREE` as weak confirmation and read the code yourself. The
second opinion remains an independent prompt and model call, not a consensus vote or
a deciding gate.

## Operating rules

- **Local-only, degrades to a no-op.** `claude` is a local CLI and can be absent
  from CI runners, unauthenticated, offline, timed out, or unable to return a parseable
  response. Every such path returns `UNAVAILABLE`: the skill says so in one line and
  moves on. It never blocks, invents a verdict, or treats "couldn't ask" as disagreement.
- **Never force a decision.** An Opus verdict is input, not a gate. It never auto-merges,
  auto-drops a finding, or overrides your own judgement. It surfaces a second
  view for a human to weigh.
- **One claim per call.** Feed a single, self-contained finding and its code. Opus judges
  only from the text you send it, with no repo access, so include the cited hunk.

## How it runs: the helper

The deterministic helper invokes `claude -p --output-format json` for the one-shot,
non-interactive verdict, parses its result, and degrades on any failure:

```bash
node .claude/skills/second-opinion/second-opinion.mjs <<'FINDING'
<the finding dossier: title, severity, repo/path:line, the claimed defect, the cited code/diff hunk>
FINDING
```

The dossier is untrusted text. The helper disables built-in tools with `--tools ""`
and inherited MCP servers with `--strict-mcp-config`, loads no user, project or local
settings, disables skills, and runs outside the repository without session persistence.
This is a single model call, not a supervised worker launched through the orchestration
process.

The helper reads the dossier from **stdin** so diffs avoid argument length and quoting
limits. It prompts Opus as an independent skeptic and prints **one line of JSON** to
stdout, always exiting 0:

| Field | Meaning |
|---|---|
| `status` | `OK` (a verdict was obtained) or `UNAVAILABLE` (Claude absent, unauthenticated, timed out, errored, or unparseable) |
| `verdict` | `AGREE`, `DISAGREE`, or `UNSURE` (only when `status: OK`) |
| `confidence` | `high`, `medium`, or `low` |
| `reasoning` | At most 2 sentences citing the specific code |
| `reason` | Why it degraded (only when `status: UNAVAILABLE`) |
| `model` | The slug used |

Options: `--model <slug>` (default `claude-opus-5-5`; swap only to a live Claude model slug)
and `--timeout <ms>` (default 180000). The timeout is a backstop that yields
`UNAVAILABLE`, never a hang.

## Interpreting the verdict

| Result | What it means | What to do |
|---|---|---|
| `OK` and **AGREE** | A separate same-vendor call supports the defect and severity, with correlated blind spots. | State that Opus supports the finding. Treat this as weak confirmation, weaker than a cross-vendor read, and check the code yourself. |
| `OK` and **DISAGREE** | Opus argues the code is correct, the severity is inflated, or the claim is unsupported; correlated blind spots still apply. | Mark the finding **CONTESTED**. Surface both verdicts and let the human decide. Do not silently drop it or force a merge. |
| `OK` and **UNSURE** | The supplied context could not decide it. | Note it. The finding stands exactly as it already was. |
| **UNAVAILABLE** | No second opinion was obtained. | Say so in one line with the `reason`. The finding stands unchanged. Never read this as agreement or disagreement. |

## When to fire it

Nothing fires this skill automatically. Invoke it when one claim is both blocking and
arguable:

- a **Critical** or **High** Pullfrog finding you are about to act on;
- a load-bearing claim in your own analysis that decides the shape of a change;
- a close call an audit skeptic left standing.

Include High findings as well as Critical ones. Weigh a `DISAGREE` harder than an
`AGREE`, per the correlated-blind-spot note above.

## Standalone use

For a `/second-opinion <claim>` invocation on its own:

1. Build the dossier: the claim in one line, plus the relevant hunk when `$ARGUMENTS`
   names a `file:line` or snippet.
2. Run the helper.
3. Report your read of the claim and Opus's verdict side by side. On `DISAGREE`, present
   both cases and recommend how to resolve them. On `UNAVAILABLE`, answer from your own
   analysis and note that the second opinion was not reachable.
