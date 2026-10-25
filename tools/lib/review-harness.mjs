export const UI_REVIEW_SWEEP_CONTRACT = Object.freeze({
  lanes: Object.freeze([
    Object.freeze({
      name: "execution",
      applicability: "mandatory",
    }),
    Object.freeze({
      name: "motion",
      applicability: "when the change animates",
      notApplicable: "no changed animation",
    }),
    Object.freeze({
      name: "gates",
      applicability: "mandatory",
    }),
    Object.freeze({
      name: "the change",
      applicability: "mandatory",
      evidence: Object.freeze(["interface-review", "better-interface"]),
    }),
  ]),
  closeGate: Object.freeze([
    Object.freeze({ name: "design-reviewer" }),
    Object.freeze({ name: "completeness-critic" }),
  ]),
})

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

const REQUIRED_REVIEW_EVIDENCE = reviewEvidenceRequirements()

const reviewEvidenceTemplateAnswer = ({ notApplicable }) => notApplicable
  ? `<what it found, "no findings", or "not applicable: ${notApplicable}">`
  : `<what it found, or "no findings">`

const reviewEvidenceLine = ({ name, notApplicable }) => {
  const label = name === "better-interface" ? "better-interface (full mode)" : name
  const answer = reviewEvidenceTemplateAnswer({ notApplicable })
  return `- ${label}: ${answer}`
}

export const renderReviewEvidenceBlock = (contract = UI_REVIEW_SWEEP_CONTRACT) => `## Review harness

${reviewEvidenceRequirements(contract).map(reviewEvidenceLine).join("\n")}`

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
