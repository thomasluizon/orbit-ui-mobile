# Standing rules: the always-loaded core

**At a glance:** the judgement that loads on EVERY turn. Everything else lives in
`.claude/playbooks/`: **read the playbook yourself** when you start that activity, because no file
path predicts it.

| playbook | read it when |
|---|---|
| `debugging.md` | a bug, a triage, `/investigate`, a merge conflict |
| `review-and-audit.md` | `/audit-*`, a Pullfrog review to act on, any fan-out assessment |
| `planning-and-artifacts.md` | `/ticket`, `/orchestrate`, ticket writing, ADRs |
| `context-engineering.md` | authoring anything the agent reads: a rule, playbook, skill, agent, tool, ticket |

### 1. No red-capable command, no hypothesising

Before theorising about a bug, RUN one fast, deterministic command that drives the real code path
and asserts the exact symptom. Until it is red you have a story, not a bug. Cut the repro down first.

### 2. Tag temporary debug output with a unique prefix

`[DEBUG-a4f2]`, so removing it is one grep. Confirm the grep is empty before calling it done.

### 3. Copy every identifier from this run's output, never from memory

Every GitHub or ticket-tracker identifier you pass to a tool (node id, PR number, SHA, run id, comment id,
issue key) is COPIED from output produced in the same run. Never from memory, never reconstructed.
**A `||` fallback that retries a failed write is forbidden**: it makes the write the probe. Node ids
are globally unique, so a wrong one does not fail, it hits a stranger's repository (2026-08-08).
Gates: `.claude/hooks/forbid-invented-identifier.mjs`, `tools/lib/github-target.mjs`.

### 4. Never re-flag what a gate already enforces

If ESLint `local/*`, a `guards.yml` job (Dash Ban, Copy Register, Suppressions Ratchet, Expo SDK
Pin, Cross-Platform Parity), or Roslyn `ORBIT0001..0005` fails on it, saying it by hand is noise.

### 5. Load-bearing strings need approval before they change

Never silently change a URL slug, anchor id, primary nav label, or a form field's `name` or order.
Each carries SEO, analytics, or autofill; every test stays green while attribution regresses.

### 6. Expanding the design system is a request, not a judgement call

Needs a token, colour, gradient, radius, shadow, font, or effect `DESIGN.md` lacks? Stop and ask: name it,
its role, and why the current system cannot do the job.

### 7. Assert the obvious option, never a menu

State the obvious option and ask for confirmation or override. Never list an open question you
would annotate "Recommend: X"; decide X and move on.

### 8. Never present a zero-result lookup as data

Retry once with different wording, then say the answer came from built-in defaults, not a match.
Never invent ratings, prices, reviews, or org details, or a `file:line` no tool gave you.
