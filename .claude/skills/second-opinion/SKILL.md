---
name: second-opinion
description: Get an independent cross-model second opinion (GLM-5.2 via opencode) on a specific, load-bearing technical claim or a Critical code-review finding — a different model reads the claim + code and returns AGREE / DISAGREE / UNSURE. Use to stress-test a single Critical finding, a risky assertion, or a close call before you commit to it. Auto-fired inside /pr-review on each Critical finding that survives the skeptic. Not for open-ended research (use /deep-research) or multi-lens judgement (use /llm-council).
argument-hint: <a claim to test, optionally with a file:line to pull context from>
---

# Second Opinion (cross-model)

**Input**: $ARGUMENTS

Ask a **different model**, GLM-5.2 run through the local `opencode` CLI on the OpenCode Go
subscription, to independently judge one concrete claim. Claude and GLM fail in different
ways; a second architecture disagreeing is a real signal, an agreement is corroboration.
**Locked decision: no standing consensus voting** (a refuter kills false positives where N
agents voting rubber-stamp each other); the skeptics' one real gap is that they share a
model family, so their blind spots correlate, and that gap is what GLM closes. This is the
**on-demand cross-model diversity** the harness reserves for high-stakes calls: bring it
only when it pays.

## Operating rules

- **Interactive-only, degrades to a no-op.** `opencode` is a local CLI, absent from CI
  runners, offline, and on unfunded or rate-limited plans. Every one of those returns
  `UNAVAILABLE`: the skill **says so in one line and moves on**, completing the work
  without it.
- **Never force a decision.** A GLM verdict is *input*, not a gate. It never auto-merges,
  auto-drops a finding, or overrides Claude's own judgement — it surfaces a second view for
  a human to weigh.
- **One claim per call.** Feed a single, self-contained finding + its code. GLM judges only
  from the text you send it — no repo access — so include the cited hunk.

## How it runs — the helper

The mechanics (invoke opencode, parse its JSONL event stream, extract the verdict, degrade
on any failure) live in a deterministic helper so nothing is left to per-run improvisation:

```bash
node .claude/skills/second-opinion/second-opinion.mjs <<'FINDING'
<the finding dossier: title · severity · repo/path:line · the claimed defect · the cited code/diff hunk>
FINDING
```

It reads the dossier from **stdin** (no argv length / quoting limits — diffs are safe),
prompts GLM as an independent skeptic, and prints **one line of JSON** to stdout, always
exiting 0:

| Field | Meaning |
|---|---|
| `status` | `OK` (a verdict was obtained) or `UNAVAILABLE` (opencode absent / capped / errored / unparseable) |
| `verdict` | `AGREE` · `DISAGREE` · `UNSURE` (only when `status: OK`) |
| `confidence` | `high` · `medium` · `low` |
| `reasoning` | ≤ 2 sentences citing the specific code |
| `reason` | why it degraded (only when `status: UNAVAILABLE`) |
| `model` | the slug used |

Options: `--model <slug>` (default `opencode-go/glm-5.2`; swap only to a live opencode slug),
`--timeout <ms>` (default 180000). GLM is verbose/slow — the timeout is a backstop that
yields `UNAVAILABLE`, never a hang.

## Interpreting the verdict

| Result | What it means | What to do |
|---|---|---|
| `OK` · **AGREE** | An independent model confirms the defect and the severity. | Corroborated — state that the finding is cross-model confirmed. |
| `OK` · **DISAGREE** | GLM argues the code is correct / the severity inflated / the claim unsupported. | Mark the finding **CONTESTED**; surface **both** verdicts (Claude's + GLM's reasoning) and let the human decide. Do not silently drop it and do not force a merge. |
| `OK` · **UNSURE** | The context couldn't decide it. | Note it; the finding stands as Claude's review already ruled. |
| **UNAVAILABLE** | No second opinion was obtained. | Say so in one line (with the `reason`); the finding stands unchanged. Never read this as agreement or disagreement. |

## Standalone use

For a `/second-opinion <claim>` invocation outside a review:

1. Build the dossier: the claim in one line, plus — if `$ARGUMENTS` names a `file:line` or a
   snippet — read that context and include the relevant hunk so GLM judges the real code.
2. Run the helper.
3. Report **your** read of the claim and **GLM's** verdict side by side. On `DISAGREE`,
   present both cases and recommend how to resolve; on `UNAVAILABLE`, answer from your own
   analysis and note the second opinion wasn't reachable.

## Inside /pr-review

`/pr-review` Phase 6 fires this on each **Critical** finding that survives the adversarial
skeptic (interactive runs only). The verdict table above is the whole contract there; the
only thing `/pr-review` adds is the `CONTESTED` tag it puts on a `DISAGREE`.
