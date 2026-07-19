# Fresh session prompt — should I drop my custom harness for a standard one?

> Run in a NEW session. **Opus 4.8 @ xhigh.** Paste everything between the rules.
> This is a RESEARCH + DECISION session. **Write no production code and change no harness files.**

---

One question, and I want a decision, not a survey:

**Should I keep my custom AI-dev harness, prune it hard, or delete most of it and adopt a
standardized off-the-shelf approach?**

## The concrete situation

I am a solo developer building Orbit (a habit tracker: Next.js web + Expo mobile + a .NET API).
Over the past weeks I built a large bespoke harness on top of Claude Code. Measured just now:

| piece | count |
|---|---|
| `.claude/skills/` | 33 skills |
| `.claude/agents/` | 12 subagents |
| `.claude/hooks/` | 29 hook/lib files |
| `.claude/rules/` | 6 standing-rule files (47 rules) |
| `tools/` | 11 scripts (~1,900 lines) |
| `eslint-rules/` | 27 custom rules |
| **total harness** | **~23,200 lines in `.claude/` + ~1,900 in `tools/` + 868 lines of root docs** |

That is roughly **25,000 lines of harness** wrapping an app of ~164,000 lines
(`apps/web` 78,495 + `apps/mobile` 85,209). Centrepieces: `/drive` (a Node driver that spawns
one fresh headless `claude -p` per work bundle), `WORKFLOW.md` (a path-picking guide), and a
custom visual-completion gate (surface manifest → screenshot capture → LLM vision judge →
coverage oracle → Stop hook).

**It is not working.** Read `fix-problem.md` at the repo root for the full, evidence-backed
post-mortem, and `.claude/specs/issue-539.spec.md`. Then read the actual issue:
`gh issue view 539 -R thomasluizon/orbit-ui-mobile`. The short version: **seven sessions have
failed to complete one visual-redesign issue.** A 10-hour unattended run produced zero completed
bundles. The custom completion gate was mechanically destroying the custom driver's status
messages, turning finished work into recorded failures. The custom vision judge scored a page
that was byte-identical to the pre-redesign baseline as fully "transformed."

**The hypothesis I want tested, hard: the #539 failure was not caused by too little harness. It
was caused by harness.** Two bespoke safety systems fought each other, and the failure modes were
all in the custom layer, not in the model or the app.

## What to research

Use **`/deep-research`**. Do not stop at one alternative. Find and compare the approaches people
who ship a lot actually use in 2026, including at minimum:

- **GSD** (the user named it — find out what it actually is and whether it fits).
- **What high-output practitioners actually run.** Matt Pocock is one named example; find his
  current setup if it is documented. Look for others who publish their real configs rather than
  theorize.
- **"Loop engineering"** — the pattern of a tight generate→verify→repeat loop. Note my own vault
  already concluded it "names an existing pattern, not a new algorithm"; test that.
- **Spec-driven development** toolkits (e.g. GitHub's spec-kit and equivalents), and the
  `AGENTS.md` convention.
- **Vanilla Claude Code, used well** — plan mode, `/goal`, native skills, subagents, hooks, and
  nothing else. This is a serious candidate and must be evaluated as one, not as a straw man.
- Anything else the research surfaces: Aider conventions, Cursor rules, Amp, OpenHands, BMAD,
  and so on.

For each candidate get **primary sources with live URLs**: the actual repo, the actual docs, the
actual config. Note last-commit dates and whether a project is maintained. Reject anything you
cannot verify on a primary source, and say so.

## Compare on these axes, not on vibes

1. **Would it have prevented my specific failures?** Walk each candidate against the concrete
   failure list in `fix-problem.md` (§5 in particular). This is the decisive axis. A framework
   that would have failed identically is not an improvement.
2. **Lines of config I have to own and debug**, versus lines someone else maintains and upgrades.
3. **How completion is decided** — self-report, deterministic check, human gate, or a model
   judge. My whole failure was here.
4. **Unattended capability**, and whether unattended is even the right mode for a solo dev.
5. **Migration cost** from where I actually am, and **what I would lose.** Some of my harness is
   genuinely earning its keep: the ESLint rules, the git guardrails, and the cross-repo parity
   checks catch real defects. Be specific about what to keep.
6. **Lock-in and failure modes** when the tool is wrong.

## Then run /llm-council

Run **`/llm-council`** on: *"Keep, prune, or replace this harness?"* with genuinely opposed
lenses — at minimum: the sunk-cost skeptic, the maintenance realist, the shipping pragmatist, and
someone who argues the custom harness is correct and the real problem was one bad gate.

Then **spawn separate adversarial agents to refute whatever the council converges on.** In
particular, force someone to argue the case I am probably too tired to make myself: *"delete
everything and use vanilla Claude Code with plan mode and /goal."* If that survives, I want to
know.

## What I want back

1. **One recommendation** — keep / prune / replace — stated in the first two sentences.
2. **A comparison table** of the real candidates against the six axes.
3. **A concrete keep/delete list for MY harness**, file by file or directory by directory. Name
   what earns its keep and what is dead weight. If the answer is "delete 30 of the 33 skills,"
   say which three survive and why.
4. **A migration plan** with a first step I can do in under an hour, and an explicit statement of
   what breaks.
5. **The strongest argument against your own recommendation**, kept visible.
6. **An honest cost estimate** for the migration, in wall-clock hours, and what it does to #539
   specifically. #539 is a launch gate and it blocks the demo-clip recording that is my entire
   marketing bottleneck.

## Constraints

- **Write no production code. Change no harness files.** This session decides; it does not
  implement. If the answer is "replace," the implementation is a separate session.
- Do not let sunk cost drive the answer, in either direction. 25,000 lines is a reason to be
  honest, not a reason to keep it and not a reason to burn it.
- Be concrete about my stack: Turborepo, Next.js web + Expo mobile + a separate .NET API repo,
  mandatory cross-platform parity, solo dev, subscription-based model access (so wall-clock and
  rate limits are the real currency, not dollars).
- If the honest answer is "your harness is mostly fine, one gate was broken, keep it," say that
  plainly. I want the true answer, not the dramatic one.

---

## Paste separately, after the prompt above

/goal the transcript contains a single stated recommendation (keep / prune / replace) in its first two sentences, a comparison table of at least four real alternatives verified against primary-source URLs, a file-by-file keep/delete list for the existing .claude harness, a migration plan whose first step takes under an hour, an explicit estimate in wall-clock hours, the strongest counter-argument to the recommendation, and a walkthrough of whether each alternative would have prevented the specific failures listed in fix-problem.md. No production code or harness files were modified. Stop and ask rather than recommending on vibes or without primary sources.
