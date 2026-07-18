---
name: provider-update
description: Port this repo's Claude Code harness to the other two agentic coding providers (opencode + Codex) and re-sync any that has gone missing or stale. Enumerates every harness piece (rules, skills, subagents, hooks, MCP, memory, orchestration), diffs each provider's equivalent against the Claude Code source of truth, updates what drifted respecting each provider's schema, and records what genuinely cannot be replicated as an honest gap in providers.md. Idempotent — re-run when everything is current and it reports "all providers in sync" and changes nothing. Use after adding/editing an agent, skill, hook, or MCP server, or when asked to make the harness run on opencode or Codex.
argument-hint: "[provider: opencode|codex|all] [--check]"
---

# provider-update: make the harness executable on all three providers

**Input**: `$ARGUMENTS`
- No args → sync **all** providers.
- `opencode` or `codex` → scope to one provider.
- `--check` (or `--dry-run`) → **report only, write nothing**. This is the idempotency probe and the safe first run.

## What this skill is for

The harness lives in `.claude/` and is authored for **Claude Code**. The same behavior must be reachable from **opencode** and **Codex**. This skill is the re-runnable sync: for every harness piece it (1) finds the per-provider equivalent, (2) diffs it against the Claude Code source, (3) updates what is missing or stale respecting that provider's schema, and (4) records what a provider genuinely *cannot* do as an honest gap — never a faked equivalent.

**Claude Code (`.claude/`) is the source of truth. Always.** Never silently treat opencode or Codex as canonical. If a provider's file has diverged in a way that looks intentional (someone edited the opencode mirror, not the Claude source), **stop and ask via `AskUserQuestion`** which side wins before overwriting — do not assume the `.claude/` side is newer just because it is canonical.

## Step 0 — re-derive each provider's capabilities from the live web, EVERY run (MANDATORY, blocking)

**This step is not optional and not skippable. Do it first, before enumerating anything, before any write, on every single run — including `--check`.** If the web is unreachable, **stop and say so** (`AskUserQuestion`: proceed against the last-known snapshot, or abort) — never silently fall back to the static map, because the whole point of this step is that the map is stale by assumption.

The equivalence map below is a **prior, not a fact**. Provider schemas, file locations, and known bugs change month to month, and **a provider gaining a capability is the case this step exists to catch** — e.g. if opencode ships per-agent hooks, or Codex fixes the spawn-model bug, or Codex skills gain model/effort, this run must discover that and act on it, not keep repeating last month's gap.

**The rule: every "none" / "gap" / "NO x" / "known bug" / "cannot" cell in the map and in `providers.md` is a HYPOTHESIS to re-test against live docs this run — never a settled fact.** Concretely:

1. For each provider, `WebSearch` + `WebFetch` the current capability surface and read it fresh:
   - **opencode** — `https://opencode.ai/docs/` (+ the GitHub repo/changelog). Re-derive: rules / `AGENTS.md` vs `CLAUDE.md` precedence; agents `permission` schema; **whether per-agent hooks now exist** (today: no — plugins are global, `tool.execute.before/after` carries no agent identity); whether `permission.bash` still matches the **raw string** (today: yes; a tree-sitter parse is an open TODO); plugin API; MCP config shape; **whether a scripted/deterministic orchestrator now exists**.
   - **Codex** — the OpenAI Codex CLI docs + repo/changelog. Re-derive: `AGENTS.md` discovery order + the `project_doc_max_bytes` cap value (today ~32 KiB — read the current number); `.agents/skills` vs `~/.codex/prompts`; `.codex/agents/*.toml` `model` + `model_reasoning_effort`; **whether the spawn-model bug is fixed**; **whether skills can now carry per-skill model/effort**; **whether `codex_hooks` is still off-by-default / still flaky on Windows**; **whether a typed memory store now exists**; MCP config shape.
   - Include the phrase "changelog" or "release notes" in at least one query per provider so a newly shipped capability surfaces even if the docs page lags.
2. **Build a live capability table for THIS run** from what you just read. Where it disagrees with the map or with `providers.md`, **the live reading wins** and drives the rest of the skill:
   - A gap that is **now supported** → **port it this run** (add the files, translate the schema) and flip its `providers.md` cell from `gap` to `ported`. This is the opencode-hooks case: the moment opencode has per-agent hooks, this run stops treating the per-agent fence as an opencode gap and ports it.
   - A capability that **regressed / was removed** → stop relying on it; if a mirror depended on it, repair or re-gap it.
   - A known bug now **fixed** (Codex spawn-model) → drop the "known-broken" caveat and treat the pin as real.
3. **Record the verification log** in the run output AND in `providers.md`: per provider, the doc/changelog URL, the date checked, and every cell whose status **changed** since the map/prior `providers.md`. A capability you could not confirm from the live docs is reported **`unverified` and carried at its prior value** — never upgraded to "supported" on a guess, never applied as fact.

Because this run's behavior is driven by the **freshly-built** capability table (step 2), not by the static map, the skill stays correct as providers evolve without editing the skill — a new capability is picked up the next time you run it.

## The harness inventory — derive it, never recite it

The first deliverable is a **checked-from-disk** inventory of what exists on the Claude Code side. Enumerate from the filesystem so a piece added since this skill was written is still covered:

| Piece | Enumerate with |
|---|---|
| Project rules | `CLAUDE.md` at repo root + every nested `apps/*/CLAUDE.md`, `packages/*/CLAUDE.md`, and the `@`-imported sibling `../orbit-api/CLAUDE.md`, `../orbit-landing-page/CLAUDE.md` |
| Skills | `.claude/skills/*/SKILL.md` |
| Subagents | `.claude/agents/*.md` (note each one's `model:` / `effort:` / `tools:` / `hooks:`) |
| Hooks | `.claude/hooks/*.mjs` + their wiring in `.claude/settings.json` (`PreToolUse` / `PostToolUse` / `Stop`) + shared `.claude/hooks/_lib/*.mjs` |
| MCP | `.mcp.json` (`mcpServers`) |
| Memory | `.claude/projects/**/memory/` + `MEMORY.md` (Claude-Code-only by design) |
| Orchestration | the Workflow tool + any scripted `run.mjs` (e.g. `.claude/skills/drive/run.mjs`) |

Then enumerate what each other provider *already* has: `.opencode/agents/*.md`, `.opencode/plugin/*.js`, `opencode.json`; `.codex/`, `.agents/`, `AGENTS.md`, `~/.codex/config.toml`. The gap is (Claude source) − (provider has).

## The equivalence map (a PRIOR — Step 0's live table overrides every cell)

| Harness piece | Claude Code (source) | opencode | Codex |
|---|---|---|---|
| Project rules | `CLAUDE.md` (nested, `@import`) | reads `CLAUDE.md` natively — **do not create `AGENTS.md` for opencode's sake**, it shadows `CLAUDE.md` | `AGENTS.md` (nested, walks git-root→cwd, **32 KiB `project_doc_max_bytes` cap**, no `@import`) |
| Skills / commands | `.claude/skills/*/SKILL.md` (`/name`) | discovers `.claude/skills/**` as-is (no port needed) | `.agents/skills/*/SKILL.md` (`/skills`, `$name`; auto-invoked by description) + `~/.codex/prompts/*.md` (deprecated). **No per-skill model/effort.** |
| Subagents + model pin | `.claude/agents/*.md` (`model:` / `effort:` frontmatter) | `.opencode/agents/*.md` — **permission DENYLIST, inverted** from Claude's allowlist; no per-agent model in the mirrors | `.codex/agents/*.toml` (`model` + `model_reasoning_effort`). **Known spawn-model bug — verify the pin is honored.** |
| Hooks (blocking) | `.claude/hooks/*.mjs` (PreToolUse deny/modify, per-agent scoping) | **NO per-agent hooks**; global `.opencode/plugin/*.js` (`permission.bash` denylist, last-match-wins, raw-string match) | Codex hooks (`[features] codex_hooks=true`, **off by default, flaky on Windows**) |
| MCP | `.mcp.json` | native (`opencode.json` → `mcp`) | `~/.codex/config.toml` / `.codex/config.toml` (stdio + HTTP/OAuth) |
| Memory | `memory/` + `MEMORY.md` (Claude-Code-only) | **none** | **none** (AGENTS.md holds static instructions only) |
| Orchestration | Workflow tool / scripted `run.mjs` | — (no scripted deterministic orchestrator) | subagents (`agents.max_threads`, `max_depth`) — **no scripted orchestrator** |

## Per-piece procedure

For each row, **detect → (ask if needed) → update → verify**. Detection must be mechanical (compare file sets and contents), not vibes.

### 1. Project rules

- **opencode**: no action. opencode reads `CLAUDE.md` natively; `opencode.json.instructions` already lists the extra docs. Confirm that list still matches the real `CLAUDE.md` `@import` set and the doc registry; if `CLAUDE.md` gained an import, add it to `opencode.json.instructions`. **Never create `AGENTS.md`.**
- **Codex**: needs `AGENTS.md`, and this is the skill's headline conflict. Codex reads `AGENTS.md` literally with **no `@import`**, so it cannot follow `CLAUDE.md`'s import tree; and creating `AGENTS.md` is explicitly **banned by `CLAUDE.md`** because opencode would then prefer it and shadow `CLAUDE.md`.
  - **This is a destructive/source-of-truth decision — `AskUserQuestion` before creating `AGENTS.md`.** Present the resolution options (below) and let the user pick; do not create it silently.
  - Recommended resolution: **generate `AGENTS.md` deterministically from the flattened `CLAUDE.md` tree** (root + nested + resolved `@import`s), so opencode reading it is *harmless* (identical content, no drift), and re-generate it on every `provider-update` run. Respect the **32 KiB cap**: if the flattened rules exceed it, split across nested `AGENTS.md` files (per-workspace) placed where Codex's git-root→cwd walk will pick them up, or trim to the launch-critical rules and link the rest — and **report** exactly what was dropped (never silently truncate; that is the `visual-delivery` "silent cap" failure mode applied to rules).
  - Before regenerating, if `AGENTS.md` exists and differs from the freshly flattened `CLAUDE.md`, that difference may be a hand-edit — **ask before overwriting**.

### 2. Skills

- **opencode**: no port — it reads `.claude/skills/**` directly. Verify discovery still holds per live docs; if opencode changed its skill path, note it.
- **Codex**: mirror each `.claude/skills/<name>/SKILL.md` to `.agents/skills/<name>/SKILL.md`. Detection = set difference of skill names between the two trees, plus a content hash per shared name to catch stale bodies. When porting, **drop any `model:`/`effort:` frontmatter Codex can't honor** and record that loss in `providers.md` (Codex skills carry no per-skill model/effort). Prefer a pointer body (`Read and follow ../../.claude/skills/<name>/SKILL.md`) over a copy so the skill stays single-sourced — unless Codex cannot resolve a relative read at skill-run time (verify), in which case copy and hash-track for staleness.

### 3. Subagents + model pinning

- **opencode**: for each `.claude/agents/<name>.md` there must be a `.opencode/agents/<name>.md` pointer. Detection = set difference (this is where **`Explore.md`** currently shows as an opencode gap). When creating a mirror, **translate the allowlist to a denylist**, and get the ordering right:
  - opencode `permission` defaults to **allow**, and the **last matching rule wins** → the catch-all `"*": deny` MUST come **first**, specific `allow`s after.
  - A Claude `tools:` allowlist that omits WebFetch/WebSearch → deny `webfetch`/`websearch` explicitly (absence = granted otherwise).
  - Never end a `permission.bash` allow pattern in `*` (an interior/trailing `*` compiles to dotall `.*` and spans `&&`/`|`, admitting chaining). Pin exact tails, as the `primer` mirror documents.
  - opencode mirrors carry **no per-agent model** — do not invent one.
- **Codex**: `.codex/agents/<name>.toml` with `model` + `model_reasoning_effort` mapped from the Claude `model:`/`effort:`. **Verify the spawn-model bug**: after writing, if Codex does not actually honor the pinned model on spawn, record it in `providers.md` as a known-broken pin rather than claiming parity. Map effort levels to Codex's accepted values (verify the enum).

### 4. Hooks (blocking gates)

- **opencode**: enforcement is the **global** `.opencode/plugin/orbit-guardrails.js`, which imports the same `.claude/hooks/_lib/*.mjs` rule core. Detection: confirm every `_lib` rule wired in `.claude/settings.json` is also invoked in the plugin's `tool.execute.before`/`after`. If `settings.json` gained a hook backed by a `_lib` rule, add the matching call to the plugin. **Keep the plugin file `.js`** (the loader globs `{plugin,plugins}/*.{ts,js}` one level deep — renaming to `.mjs` unloads every guardrail).
  - **Honest gap**: the **per-agent** hook (e.g. `primer-shell-allowlist.mjs` scoped in agent frontmatter) has **no opencode equivalent** — opencode has no per-agent hooks; `tool.execute.before` sees no agent identity. Record this in `providers.md`; the opencode `primer` mirror falls back to `permission.bash` globs, which stop accidents but not chaining. Do not claim parity.
- **Codex**: Codex hooks are gated behind `[features] codex_hooks=true`, **off by default and flaky on Windows** (the dev machine). Do **not** enable them by default. Record the hook layer as an honest gap for Codex unless the user opts in; if they do, port only the `bash`/git guards and note the Windows flakiness.

### 5. MCP

- **opencode**: `opencode.json.mcp`. Detection = set difference of server names between `.mcp.json.mcpServers` and `opencode.json.mcp`, plus a shape check. Translate: Claude `type: http` → opencode `type: remote`; Claude stdio (`command`+`args`) → opencode `type: local` with `command` as an **array**; env interpolation `${VAR}` → opencode `{env:VAR}`. Add any server present in `.mcp.json` but absent from `opencode.json` (e.g. verify `sentry`, `pencil`, `chrome-devtools` presence — some are intentionally Claude-only; **ask** before adding a browser/desktop server opencode can't drive).
- **Codex**: `~/.codex/config.toml` (user-global) or `.codex/config.toml` (project). Translate each server to Codex's TOML MCP block (stdio + HTTP/OAuth). Prefer project `.codex/config.toml` for repo-scoped servers so they are checked in; keep secrets as env references, never inline.

### 6. Memory

- As of the prior snapshot, neither opencode nor Codex has a typed memory store — but **re-test this in Step 0 every run** (a provider could ship one). If it is still absent, **do not fake one**: record in `providers.md` as a gap (with the date last re-checked), noting the closest analog is static rules in `CLAUDE.md`/`AGENTS.md`, which is not the same capability, and create no file. If Step 0 finds a real memory store now exists, port the memory layer and flip the cell to `ported`.

### 7. Orchestration

- **opencode**: as of the prior snapshot, no scripted deterministic orchestrator — but re-test in Step 0. The scripted `run.mjs` (drive engine) is Claude-Code-invoked; opencode has subagents but no Workflow-tool/`run.mjs` equivalent. Record it as a gap (with re-check date) unless Step 0 finds one now exists.
- **Codex**: has subagents (`agents.max_threads`, `max_depth`) but as of the prior snapshot **no scripted deterministic orchestrator** — re-test in Step 0. Record the `run.mjs`-style pipeline as a Codex gap unless Step 0 finds otherwise.

## The honest-gaps ledger — `providers.md`

Maintain a repo-root `providers.md` (or `.claude/providers.md` — pick one and keep it) as the single matrix of **what is ported vs. what is a documented gap**. Every "cannot replicate" from the procedure above lands here with the reason. Shape:

- A per-piece × per-provider table: `ported` / `n/a (native)` / `gap: <one-line reason>`, **each cell tagged with the date it was last re-verified live** (so a stale `gap` is visibly overdue for a re-check, and Step 0 knows what it re-tested).
- The known-broken pins (Codex spawn-model bug) and weaker fences (opencode raw-string `permission.bash`, no per-agent hook) called out explicitly — each also dated, since these are exactly the cells most likely to flip.
- The Step-0 verification log: which provider doc/changelog URL + date each run checked against, and every cell whose status changed this run.

Update `providers.md` in the same run. Never write a fake equivalent to make a cell look green — a stated gap is the correct, honest state.

## Gates — always ask before these

Use `AskUserQuestion` (recommended option first) before:

1. **Creating `AGENTS.md`** (violates a standing `CLAUDE.md` rule; needs the resolution choice).
2. **Overwriting a provider file that differs from the freshly-derived Claude source** in a way that could be an intentional hand-edit (source-of-truth ambiguity).
3. **Enabling Codex hooks** (`codex_hooks=true`) given the Windows flakiness.
4. **Adding an MCP server to a provider that structurally can't use it** (e.g. a desktop/browser server to headless Codex).
5. **Deleting** any provider file (a stale mirror whose Claude source was removed → confirm the removal was intentional before deleting the mirror).

Batch related asks into one call.

## Verify + report (idempotency)

Re-run detection after writing. The run's report MUST state, **per provider**:

- **Added** — new files created (path each).
- **Updated** — files brought back in sync (path + what drifted).
- **Gaps** — the honest, documented "cannot replicate" list (from `providers.md`).
- **Verified-against** — the doc URL + date per Step 0.

**Idempotency check**: after a real sync, run the skill once more with `--check`. If everything is current it must report **"all providers in sync"** and write nothing. A second run that still wants to write means the sync is non-deterministic — fix the detector, don't paper over it.

If `--check` was the invocation, produce the same report but make **zero writes** — it is purely the drift diff.

## Notes on grounding

- This skill is authored against the real repo layout: `.claude/agents/*.md` ↔ `.opencode/agents/*.md` (thin pointers), `.opencode/plugin/orbit-guardrails.js` (global, shares `_lib`), `opencode.json` (MCP + `instructions`), `.mcp.json`. Codex has **no** footprint yet (`.codex/`, `.agents/`, `AGENTS.md` all absent) — the first non-`--check` run bootstraps it (behind the `AGENTS.md` gate).
- A known live drift at authoring time: `.claude/agents/Explore.md` has no `.opencode/agents/Explore.md` mirror. A correct run flags and fixes exactly that.
- Prefer **pointers over copies** everywhere a provider can resolve them, so each piece stays single-sourced in `.claude/` and drift is structurally impossible. Copy only where a provider cannot follow a pointer, and then **hash-track** the copy so the next run detects staleness.
