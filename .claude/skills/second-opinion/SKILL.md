---
name: second-opinion
description: Ask Claude Opus 5.5 for an independent verdict on one claim. Use it to approve user-facing copy or to test one blocking finding. It returns AGREE, DISAGREE or UNSURE. Nothing fires it by itself. One claim for each call.
argument-hint: <a claim to test, optionally with a file:line to pull context from>
---

# Second Opinion

**Input**: $ARGUMENTS

Ask Claude Opus 5.5 through the local `claude` CLI to judge one claim. The call is independent, but it comes from the same vendor. Its blind spots match your own. Treat `AGREE` as weak support and read the code yourself.

## Rules

- Run the helper inside your own turn. Use the same `--settings` and the same environment as this session. Never start a new worker for it.
- Send one claim for each call. The model has no repository access, so include the cited code.
- A verdict is input, not a gate. It never merges a pull request or drops a finding by itself.
- When `claude` is absent, offline, timed out or returns no usable answer, the helper prints `UNAVAILABLE`. Say so in one line. Never read it as agreement or disagreement.

## Run it

```bash
node .claude/skills/second-opinion/second-opinion.mjs <<'CLAIM'
<the claim, its severity, the path and line, and the cited code or diff>
CLAIM
```

The helper reads the claim from stdin. It treats the claim as untrusted text. It starts `claude -p` with no tool, no MCP server, no setting source, no skill and no session file. It prints one line of JSON and always exits 0.

| Field | Meaning |
|---|---|
| `status` | `OK` or `UNAVAILABLE` |
| `verdict` | `AGREE`, `DISAGREE` or `UNSURE`, only when `status` is `OK` |
| `confidence` | `high`, `medium` or `low` |
| `reasoning` | At most 2 sentences that cite the code |
| `reason` | Why it was unavailable |
| `model` | The model slug |

## Use it for

- **Copy approval.** Write the copy against `BRAND.md`. Then send it as a claimed defect, for example "this copy breaks the brand voice, and here is why". `DISAGREE` means the copy is approved. `AGREE` gives you the defect to fix. Run it for each locale.
- **A blocking finding.** Test a Critical or High review finding that you are about to act on, or a claim that decides the shape of a change.

## Read the verdict

| Result | Action |
|---|---|
| `AGREE` | State that Opus supports the claim. Check the code yourself. |
| `DISAGREE` | Mark the claim **CONTESTED**. Show both cases. Settle it by reading the code. |
| `UNSURE` | The claim stands as it was. |
| `UNAVAILABLE` | Answer from your own analysis. Say that no second opinion was reached. |

For a direct `/second-opinion <claim>` call, build the claim from `$ARGUMENTS` and add the code when it names a `file:line`. Report your own read and the verdict side by side.
