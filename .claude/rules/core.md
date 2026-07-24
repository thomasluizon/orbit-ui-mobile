# Standing rules: the always-loaded core

**At a glance:** the only judgement rules that load on EVERY turn. Everything else lives in
`.claude/playbooks/` and is read on demand. A rule belongs here only if it applies in any turn AND
no skill invocation reliably precedes it. Rationale and the full rule set: `.claude/playbooks/README.md`.

The rest of the judgement tier loads two ways, by whether a file path can predict relevance.

**Path-scoped: these load themselves** when you touch a matching file, via `paths:` frontmatter.
Nothing to remember.

| rule | auto-loads when you touch |
|---|---|
| `.claude/rules/visual-delivery.md` | `apps/web/**`, `apps/mobile/**`, the shared theme |
| `.claude/rules/product-and-content.md` | the i18n JSON, `globals.css`, the theme, the landing page |

**Activity-scoped: READ these yourself** when you start that activity. No file path predicts them,
so nothing can trigger them for you.

| playbook | read it when |
|---|---|
| `.claude/playbooks/debugging.md` | a bug, a triage, `/investigate`, a merge conflict |
| `.claude/playbooks/review-and-audit.md` | `/pr-review`, `/audit-*`, `/commit-sweep`, any fan-out assessment |
| `.claude/playbooks/planning-and-artifacts.md` | `/feature`, `/bug`, `/orchestrate`, ticket writing, ADRs |
| `.claude/playbooks/context-engineering.md` | authoring or editing anything the agent reads: a `CLAUDE.md`, a rule, a playbook, a skill, an agent, a tool interface, a ticket body |

### 1. No red-capable command, no hypothesising

Before theorising about a bug, build and RUN one command that drives the real code path, asserts the
exact symptom, and is deterministic and fast. Until it exists and is red you do not have a bug, you
have a story about one. Then cut the repro down before you think.

### 2. Tag temporary debug output with a unique prefix

`[DEBUG-a4f2]`, so removing it is one grep. Confirm the grep is empty before calling the fix done.

### 3. Never re-flag what a gate already enforces

If ESLint `local/*`, a `guards.yml` job (Dash Ban, Copy Register, Suppressions Ratchet, Expo SDK
Pin, Cross-Platform Parity), or Roslyn `ORBIT0001..0005` already fails on it, repeating it by hand
is noise. The inverse of gates-over-prose, and the most-broken rule.

### 4. Load-bearing strings need approval before they change

Never silently change a URL slug, an anchor id, a primary nav label, or a form field's `name` or
order. Each carries SEO, analytics, or autofill, and every test stays green while attribution
regresses. Changing one is a decision, not a refactor.

### 5. Expanding the design system is a request, not a judgement call

If a change seems to need a token, colour, gradient, radius, shadow, font, or effect `DESIGN.md`
lacks, stop and ask: name the addition, its role, and why the current system cannot do the job.

### 6. Assert the obvious option; do not offer a menu you know the answer to

When context makes one option obvious, state it and ask for confirmation or override. Never list an
open question you would immediately annotate with "Recommend: X" - decide X and move on.

### 7. Never present a zero-result lookup as data

Retry once with different wording, then say explicitly that the answer came from built-in defaults
rather than a match. Never invent ratings, prices, reviews, or org details, and never fabricate a
`file:line` a tool did not give you.
