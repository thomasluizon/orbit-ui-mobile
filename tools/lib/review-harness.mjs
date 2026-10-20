export const REVIEW_HARNESS_REPOSITORY = "ui"
export const REDESIGN_BASE = "redesign/main"

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
      notApplicable: "no changed animation",
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
      evidence: Object.freeze(["interface-review", "better-interface"]),
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
  closeGate: Object.freeze([
    Object.freeze({ name: "design-reviewer", instruction: "design-reviewer on the diff" }),
    Object.freeze({ name: "completeness-critic", instruction: "completeness-critic against the surface inventory" }),
  ]),
})

const inlineCodeList = (values) => values.map((value) => `\`${value}\``).join(", ")

export const reviewEvidenceRequirements = (contract = UI_REVIEW_SWEEP_CONTRACT) => Object.freeze([
  ...contract.lanes.flatMap((lane) =>
    (lane.evidence ?? [`${lane.name} lane`]).map((name) => Object.freeze({
      name,
      applicability: lane.applicability,
      notApplicable: lane.notApplicable ?? null,
    })),
  ),
  ...contract.closeGate.map(({ name }) => Object.freeze({ name, applicability: "mandatory", notApplicable: null })),
])

export const REQUIRED_REVIEW_EVIDENCE = reviewEvidenceRequirements()

export const reviewEvidenceTemplateAnswer = ({ notApplicable }) => notApplicable
  ? `<what it found, "no findings", or "not applicable: ${notApplicable}">`
  : `<what it found, or "no findings">`

const reviewEvidenceLine = ({ name, notApplicable }) => {
  const label = name === "better-interface" ? "better-interface (full mode)" : name
  const answer = reviewEvidenceTemplateAnswer({ notApplicable })
  return `- ${label}: ${answer}`
}

export const renderReviewEvidenceBlock = (contract = UI_REVIEW_SWEEP_CONTRACT) => `## Review harness

${reviewEvidenceRequirements(contract).map(reviewEvidenceLine).join("\n")}`

export const renderUiReviewSweepContract = () => {
  const [registry, githubTree, vercel] = UI_REVIEW_SWEEP_CONTRACT.sourceFamilies
  const laneLines = UI_REVIEW_SWEEP_CONTRACT.lanes
    .map(({ name, applicability, skills }) => `- ${name} (${applicability}): ${inlineCodeList(skills)}`)
    .join("\n")
  const closeGate = UI_REVIEW_SWEEP_CONTRACT.closeGate
    .map(({ name, instruction }) => `- One for \`${instruction}\`, told to read \`.claude/agents/${name}.md\`.`)
    .join("\n")

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

Run the four read-only lanes yourself, in this session, in order:

${laneLines}

Within the change lane, run \`interface-review\` before \`better-interface\`.
Spawn exactly two sub-agents for the close gate:

${closeGate}

Spawn no other sub-agent. If no changed path matches the sweep's scope, spawn none.
Verify each lane's PASS, not only its findings. A routed domain marked skipped is not covered.
Fix every in-scope finding in this pull request. Only then write:

\`\`\`md
${renderReviewEvidenceBlock()}
\`\`\`

A line claiming a review you did not run is forbidden.`
}

/** The paths whose rendered UI requires the D76 review sweep. */
export const UI_SCOPE = /^apps\/(?:web|mobile)\/(?:app|components|hooks|stores|lib)\//

export const isUiReviewPath = (path) => UI_SCOPE.test(path)

export const composedOrderNeedsUiReview = (repositoryKey, baseBranch) => (
  repositoryKey === REVIEW_HARNESS_REPOSITORY && baseBranch === REDESIGN_BASE
)

/**
 * A closed set, checked lowercased after punctuation is stripped. An open "looks empty" heuristic
 * would guess; this refuses only what somebody typed to fill the line.
 */
const PLACEHOLDERS = new Set(["", "todo", "tbd", "na", "n a", "none", "pending", "wip", "x", "y", "yes", "no", "done", "ok", "a confirmar"])

export const reviewHarnessSectionLines = (source) => {
  const lines = source.split(/\r?\n/)
  const headingIndex = lines.findIndex((line) => /^#{2,}\s+review\s+harness\s*$/i.test(line.trim()))
  if (headingIndex === -1) return null

  const headingLevel = lines[headingIndex].trim().match(/^#+/)[0].length
  const sectionLines = []
  for (let index = headingIndex + 1; index < lines.length; index++) {
    const heading = lines[index].trim().match(/^(#+)\s+\S/)
    if (heading && heading[1].length <= headingLevel) break
    sectionLines.push(lines[index])
  }
  return sectionLines
}

const normalizeEvidence = (value) => value
  .toLowerCase()
  .replaceAll(/[`*_~[\]()<>./\\|,;:!?"'-]/g, " ")
  .replaceAll(/\s+/g, " ")
  .trim()

export const reviewEvidenceProblem = (sectionLines) => {
  const evidenceOf = (skill) => {
    const pattern = new RegExp(`${skill}\\b[^:\\n]*:(.*)$`, "i")
    for (const line of sectionLines) {
      const match = line.match(pattern)
      if (match) return match[1]
    }
    return null
  }

  const missing = []
  const empty = []
  const invalidConditional = []
  for (const requirement of REQUIRED_REVIEW_EVIDENCE) {
    const raw = evidenceOf(requirement.name)
    if (raw === null) {
      missing.push(requirement.name)
      continue
    }
    const normalized = normalizeEvidence(raw)
    const templateAnswer = normalizeEvidence(reviewEvidenceTemplateAnswer(requirement))
    if (PLACEHOLDERS.has(normalized) || normalized.length < 8 || normalized === templateAnswer) {
      empty.push(requirement.name)
      continue
    }
    const notApplicable = requirement.notApplicable
      ? `not applicable ${requirement.notApplicable}`
      : null
    if (normalized.startsWith("not applicable") && normalized !== notApplicable) {
      invalidConditional.push(requirement.name)
    }
  }

  if (missing.length > 0 || empty.length > 0 || invalidConditional.length > 0) {
    return [
      missing.length > 0 ? `no line for: ${missing.join(", ")}` : null,
      empty.length > 0 ? `empty or placeholder evidence for: ${empty.join(", ")}` : null,
      invalidConditional.length > 0
        ? `invalid not-applicable statement for: ${invalidConditional.join(", ")}; use "not applicable: no changed animation" only for the motion lane`
        : null,
    ]
      .filter(Boolean)
      .join("; ")
  }
  return null
}
