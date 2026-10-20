import { inScopeSections, sectionsOf } from "./ticket-executability.mjs"

/** A section heading whose body describes work done after, and outside, the merge. */
const MANUAL_HEADING = /^(?:rollout|kill[ -]?switch|manual step|post[ -]?merge step|deployment step|operations? step)/i

const REVERSAL_HEADING = /^(?:kill[ -]?switch|revert|rollback|roll back|reversal|undo)\b/i

/** A bullet label that describes UNDOING the change, which is a reversal note and never an outstanding step. */
const REVERSAL_LABEL = /^(?:kill[ -]?switch|revert|rollback|roll back|undo)\b\s*[:.-]?\s*/i

/** A leading label that only names the section again. Stripped so the clause reads as an action. */
const STEP_LABEL = /^(?:rollout|deploy(?:ment)?|manual step|post[ -]?merge)\b\s*[:.]\s*/i

const BULLET = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/

/**
 * The external systems this stack actually touches. A name here only says "this clause leaves the
 * repository"; only `render` carries navigation detail, because only Render's UI was read.
 */
const PLATFORMS = [
  { key: "render", pattern: /(?<![\w.-])Render(?![\w.-])/, label: "Render" },
  { key: "posthog", pattern: /(?<![\w.-])PostHog(?![\w.-])/, label: "PostHog" },
  { key: "stripe", pattern: /(?<![\w.-])Stripe(?![\w.-])/, label: "Stripe" },
  { key: "supabase", pattern: /(?<![\w.-])Supabase(?![\w.-])/, label: "Supabase" },
  { key: "play", pattern: /(?<![\w.-])(?:Play Console|Google Play)(?![\w.-])/, label: "the Google Play Console" },
  { key: "appstore", pattern: /(?<![\w.-])App Store Connect(?![\w.-])/, label: "App Store Connect" },
  { key: "sendgrid", pattern: /(?<![\w.-])SendGrid(?![\w.-])/, label: "SendGrid" },
  { key: "cloudflare", pattern: /(?<![\w.-])Cloudflare(?![\w.-])/, label: "Cloudflare" },
  { key: "vercel", pattern: /(?<![\w.-])Vercel(?![\w.-])/, label: "Vercel" },
]

const OUTSIDE_THE_REPO = [
  ...PLATFORMS.map((platform) => platform.pattern),
  /\bdashboard\b/i,
  /\bconsole\b/i,
  /\benv(?:ironment)? var(?:iable)?s?\b/i,
  /^set\b[^.]*\b(?:key|secret|token|credential|env|variable)\b/i,
  /\blive (?:query|read|check)\b/i,
  /\bproduction (?:database|query|read)\b/i,
]

const FOOTER = /\n\s*(?:<sub>Migrated from Linear|<details><summary>|---\s*\n\s*<sub>)/

/** A configuration key in .NET section:key form, backticked or bare. */
const CONFIG_KEY = /`?\b([A-Za-z][\w.]*(?::[A-Za-z][\w.]*)+)\b`?/

const isOutsideTheRepo = (clause) => OUTSIDE_THE_REPO.some((pattern) => pattern.test(clause))

const platformOf = (clause) => PLATFORMS.find((platform) => platform.pattern.test(clause)) ?? null

const SPLIT = /(?<!\d)\.\s+|;\s*|,\s*(?:then\s+|and then\s+)?|\s+then\s+/

const clausesOf = (text) => {
  const masked = []
  const placeholder = (index) => `\u0000${index}\u0000`
  const flattened = text.replace(/`[^`]*`|\([^()]*\)/g, (span) => {
    masked.push(span)
    return placeholder(masked.length - 1)
  })
  return flattened
    .split(SPLIT)
    .map((clause) =>
      clause
        .replace(/^\s*(?:and|also)\s+/i, "")
        .trim()
        .replace(/[.,;]+$/, "")
        .replace(/\u0000(\d+)\u0000/g, (unused, index) => masked[Number(index)]),
    )
    .filter((clause) => clause.length > 0)
}

const evidenceFor = (identifier, sections, manualHeadings) => {
  const needle = identifier.replaceAll(":", "__")
  const found = []
  for (const section of sections) {
    if (manualHeadings.has(section.heading)) continue
    for (const line of section.lines) {
      if (!line.includes(identifier) && !line.includes(needle)) continue
      const trimmed = line.replace(BULLET, "$1").trim()
      if (trimmed.length > 0) found.push({ heading: section.heading || "the body", quote: trimmed })
      if (found.length === 2) return found
    }
  }
  return found
}

const renderEnvironmentVariableDetail = (identifier, repo) => {
  const dotnet = repo === "api" && identifier.includes(":")
  const key = dotnet ? identifier.replaceAll(":", "__") : identifier
  const detail = [
    "Open the Render Dashboard and select the service this repository deploys.",
    'Click the "Environment" tab in the left sidebar.',
    'Click "+ Add Environment Variable".',
    `Key: \`${key}\``,
  ]
  if (dotnet) {
    detail.push(
      `NOT \`${identifier}\`. .NET maps \`__\` in an environment variable name to \`:\` in a configuration key, so \`${key}\` is what binds \`${identifier}\`. Proven by execution on .NET 10.0.204 with Microsoft.Extensions.Configuration.EnvironmentVariables, not from memory.`,
    )
  }
  detail.push('Choose "Save, rebuild, and deploy" from the save dropdown, so the running service picks the value up.')
  return detail
}

const stepFor = (clause, { repo, sections, manualHeadings }) => {
  const platform = platformOf(clause)
  const configKey = CONFIG_KEY.exec(clause)?.[1] ?? null
  const step = { action: clause, platform: platform?.label ?? null, identifier: configKey, detail: [], evidence: [] }

  if (platform?.key === "render" && configKey) {
    step.detail = renderEnvironmentVariableDetail(configKey, repo)
  } else if (platform?.key === "render") {
    step.detail = ["Open the Render Dashboard, select the service this repository deploys, and confirm it has deployed the merge commit."]
  } else if (platform) {
    step.detail = [`Do this in ${platform.label}. The ticket does not name the exact screen, so open ${platform.label} and follow the quoted step.`]
  }

  if (configKey) step.evidence = evidenceFor(configKey, sections, manualHeadings)
  return step
}

const manualRegions = (sections) => {
  const regions = []
  let scope = null
  for (const section of sections) {
    if (scope !== null && section.level <= scope.level) scope = null
    let kind = scope?.kind ?? null
    if (REVERSAL_HEADING.test(section.heading)) {
      scope = { level: section.level, kind: "reversal" }
      kind = "reversal"
    } else if (MANUAL_HEADING.test(section.heading)) {
      scope = { level: section.level, kind: "step" }
      kind = "step"
    }
    if (kind !== null) regions.push({ section, kind })
  }
  return regions
}

/**
 * @param description the ticket body, verbatim
 * @param options.repo the ticket's repo:* key, used only to decide whether the .NET `__` mapping applies
 * @returns `{ steps: [{action, platform, identifier, detail, evidence}], reversal: [string], headings: [string] }`,
 *          and `steps` is empty for the common ticket that carries no rollout section at all
 */
export const extractManualSteps = (description, { repo = null } = {}) => {
  const body = String(description ?? "").split(FOOTER)[0]
  const sections = inScopeSections(sectionsOf(body))
  const manual = manualRegions(sections)
  const manualHeadings = new Set(manual.map(({ section }) => section.heading))
  const steps = []
  const reversal = []

  for (const { section, kind } of manual) {
    for (const line of section.lines) {
      const text = (BULLET.exec(line)?.[1] ?? line).trim()
      if (text.length === 0) continue
      if (kind === "reversal" || REVERSAL_LABEL.test(text)) {
        reversal.push(text.replace(REVERSAL_LABEL, "").trim())
        continue
      }
      for (const clause of clausesOf(text.replace(STEP_LABEL, ""))) {
        if (!isOutsideTheRepo(clause)) continue
        steps.push(stepFor(clause, { repo, sections, manualHeadings }))
      }
    }
  }

  return { steps, reversal, headings: [...manualHeadings] }
}

/**
 * The one renderer. The same markdown is printed to the terminal at handover and posted as the
 * ticket comment at completion, so the two surfaces cannot drift into two different instructions.
 * Returns null when there is nothing to say, which is the case this whole file optimises for.
 */
export const renderManualSteps = (result, { heading = "Manual steps, still outstanding" } = {}) => {
  if (!result || result.steps.length === 0) return null
  const lines = [`**${heading}**`, "", "This ticket carries work that happens outside the repository. No gate can see it, so it is written here.", ""]
  result.steps.forEach((step, index) => {
    lines.push(`${index + 1}. ${step.action}`)
    for (const detail of step.detail) lines.push(`   - ${detail}`)
    for (const evidence of step.evidence) lines.push(`   - Confirm it took effect. ${evidence.heading} says: "${evidence.quote}"`)
    lines.push("")
  })
  if (result.reversal.length > 0) {
    lines.push("**To reverse it**", "")
    for (const note of result.reversal) lines.push(`- ${note}`)
    lines.push("")
  }
  return lines.join("\n").trimEnd()
}
