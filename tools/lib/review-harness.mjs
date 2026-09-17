export const REVIEW_HARNESS_REPOSITORY = "ui"
export const REDESIGN_BASE = "redesign/main"
export const REQUIRED_REVIEW_SKILLS = ["interface-review", "better-interface"]

export const UI_REVIEW_SWEEP_CONTRACT = Object.freeze({
  sourceFamilies: Object.freeze([
    Object.freeze({
      instruction: "Run `npx --yes ui-skills get <owner>/<name>` for each skill and verify a successful, non-empty fetch",
      skills: Object.freeze([
        "anthropics/frontend-design",
        "jakubkrehel/make-interfaces-feel-better",
        "emilkowalski/animation-vocabulary",
        "raphaelsalaja/mastering-animate-presence",
        "iart-ai/accessible-animation",
        "ibelick/fixing-accessibility",
        "wshobson/wcag-audit-patterns",
      ]),
    }),
    Object.freeze({
      instruction: "Use the GitHub Trees commands below and read every blob under each `skills/<name>/` directory",
      skills: Object.freeze([
        "better-ui",
        "better-accessibility",
        "better-layout",
        "better-writing",
        "better-typography",
        "better-colors",
        "interface-review",
        "better-interface",
      ]),
    }),
    Object.freeze({
      instruction: "Fetch the Vercel guideline text from `https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`",
      skills: Object.freeze([]),
    }),
  ]),
  lanes: Object.freeze([
    Object.freeze({
      name: "execution",
      applicability: "mandatory",
      skills: Object.freeze(["anthropics/frontend-design", "jakubkrehel/better-ui", "jakubkrehel/make-interfaces-feel-better"]),
    }),
    Object.freeze({
      name: "motion",
      applicability: "when the change animates",
      skills: Object.freeze(["emilkowalski/animation-vocabulary", "raphaelsalaja/mastering-animate-presence", "iart-ai/accessible-animation"]),
    }),
    Object.freeze({
      name: "gates",
      applicability: "mandatory",
      skills: Object.freeze(["the Vercel guideline text", "ibelick/fixing-accessibility", "wshobson/wcag-audit-patterns", "jakubkrehel/better-accessibility"]),
    }),
    Object.freeze({
      name: "the change",
      applicability: "mandatory",
      skills: Object.freeze([
        "jakubkrehel/interface-review",
        "jakubkrehel/better-interface in full mode",
        "jakubkrehel/better-accessibility",
        "jakubkrehel/better-layout",
        "jakubkrehel/better-writing",
        "jakubkrehel/better-typography",
        "jakubkrehel/better-colors",
        "jakubkrehel/better-ui",
      ]),
    }),
  ]),
  closeGate: Object.freeze(["design-reviewer on the diff", "completeness-critic against the surface inventory"]),
})

const inlineCodeList = (values) => values.map((value) => `\`${value}\``).join(", ")

export const renderUiReviewSweepContract = () => {
  const [registry, githubTree, vercel] = UI_REVIEW_SWEEP_CONTRACT.sourceFamilies
  const laneLines = UI_REVIEW_SWEEP_CONTRACT.lanes
    .map(({ name, applicability, skills }) => `- ${name} (${applicability}): ${inlineCodeList(skills)}`)
    .join("\n")
  const closeGate = inlineCodeList(UI_REVIEW_SWEEP_CONTRACT.closeGate)

  return `Use \`.claude/playbooks/redesign-screen.md\` as the authority. Complete all three source families before starting a lane:

1. ${registry.instruction}: ${inlineCodeList(registry.skills)}.
2. ${githubTree.instruction}: ${inlineCodeList(githubTree.skills)}.

\`\`\`bash
gh api "repos/jakubkrehel/skills/git/trees/main?recursive=1" --jq .truncated
gh api "repos/jakubkrehel/skills/git/trees/main?recursive=1" \\
  --jq '.tree[]|select(.type=="blob" and (.path|startswith("skills/<name>/")))|.path'
\`\`\`

Stop if \`truncated\` is \`true\`. Read every printed path from \`https://raw.githubusercontent.com/jakubkrehel/skills/main/<path>\`.
3. ${vercel.instruction}.

Run the four read-only lanes in this order:

${laneLines}

Within the change lane, run \`interface-review\` before \`better-interface\`. Then close with ${closeGate}.
Verify each lane's PASS, not only its findings. A routed domain marked skipped is not covered.
Fix every in-scope finding in this pull request. Only then write:

\`\`\`md
## Review harness

- execution lane: <what it found, or "no findings">
- motion lane: <what it found, "no findings", or "not applicable: no changed animation">
- gates lane: <what it found, or "no findings">
- interface-review: <what it found, or "no findings">
- better-interface (full mode): <what it found, or "no findings">
- design-reviewer: <what it found, or "no findings">
- completeness-critic: <what it found, or "no findings">
\`\`\`

A line claiming a review you did not run is forbidden.`
}

/** The paths whose rendered UI requires the D76 review sweep. */
export const UI_SCOPE = /^apps\/(?:web|mobile)\/(?:app|components|hooks|stores|lib)\//

export const isUiReviewPath = (path) => UI_SCOPE.test(path)

export const composedOrderNeedsUiReview = (repositoryKey, baseBranch) => (
  repositoryKey === REVIEW_HARNESS_REPOSITORY && baseBranch === REDESIGN_BASE
)
