/**
 * The step that outlives the pull request.
 *
 * The gap, measured: orbit-tickets#81 shipped the PostHog server SDK and its body said, verbatim,
 * "Rollout: merge, deploy to Render, then set `PostHog:ApiKey` in the Render env. The code path is
 * inert until the key exists." The pull request was perfect, CI was green, the review was clean,
 * `complete-ticket.mjs` set Status Done and closed the issue on 2026-08-08, and at no point did
 * anything in that path mention the key. Every gate in this harness measures the PULL REQUEST, and
 * that step is not in one, so the instruction ended up readable only inside a closed ticket body.
 *
 * State it honestly, because the near-miss is the argument and the disaster is not: the key turned
 * out to be set already. Verified live 2026-08-10 against the PostHog project: `posthog-dotnet`
 * 2.12.1 has been delivering `signup_completed` and the four `subscription_*` events since
 * 2026-07-25, 20 signups with `distinct_id` set to the user GUID and the `plan` person property on
 * all 21 people. Nothing was lost. What is missing is not the key, it is any mechanism that KNEW:
 * the harness neither surfaced the step nor checked it, and 13 of the 166 open tickets carry a step
 * of the same shape, including price changes in Stripe and the Google Play Console.
 *
 * So the step is carried to the human at the two moments a human is reading (the /orchestrate
 * handover and the /merge-prs report) and written to the ticket as a comment BEFORE the ticket
 * closes, because a step that lives only in a terminal report dies with the scrollback.
 *
 * Three rules this file is built around:
 *
 * 1. **Silence is the correct output for the common case.** A ticket with no rollout section
 *    produces nothing at all. This is output, never a gate: a missing section is not an error and
 *    cannot halt a healthy run.
 * 2. **Expand only what is verified; quote everything else.** The Render navigation labels below
 *    come from Render's own configure-environment-variables documentation, read 2026-08-10. The
 *    `__` to `:` mapping was proven by execution, not memory: a console app on .NET 10.0.204 with
 *    Microsoft.Extensions.Configuration.EnvironmentVariables read `PostHog__ApiKey` back as the
 *    configuration key `PostHog:ApiKey`. Anything not on that footing is quoted from the ticket
 *    rather than invented, per CLAUDE.md code standard 8.
 * 3. **A clause is a step only when it acts OUTSIDE the repository.** "merge" is the harness's job
 *    and is dropped; "set the key in the Render env" is Thomas's and is kept.
 */

import { inScopeSections, sectionsOf } from "./ticket-executability.mjs"

/** A section heading whose body describes work done after, and outside, the merge. */
const MANUAL_HEADING = /^(?:rollout|kill[ -]?switch|manual step|post[ -]?merge step|deployment step|operations? step)/i

/**
 * A heading whose WHOLE section undoes the change. Anchored, so "Rollout / kill switch" stays a
 * rollout section whose individual bullets are still labelled one by one, while a standalone
 * `## Kill switch` makes every line beneath it a reversal.
 *
 * Without this, a standalone kill-switch section's bullets start straight in on the action
 * ("Remove `PostHog:ApiKey` from the Render env") with no label to strip, so they were read as
 * outstanding steps. The renderer then expanded "Remove the key" into "Click + Add Environment
 * Variable", instructing the exact opposite of the ticket's intent. Reported by the Codex reviewer
 * on PR #709 and reproduced before this fix.
 */
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
/**
 * Every platform name is matched CASE-SENSITIVELY, because each is a proper noun and several are
 * also ordinary verbs. Measured over the 166 open tickets: a case-insensitive `render` matched "the
 * localized branch has nothing to render" (#24) and the RENDER in `RENDER-CORRECTNESS.md` (#36), and
 * a case-insensitive `resend` matches "resend the code" throughout the auth tickets. The word
 * boundary is widened to reject a name embedded in a filename or an identifier.
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

/**
 * Evidence that a clause acts outside the repository. A platform name is the strongest signal; the
 * rest cover the cases that name no vendor at all, such as #13's "verified by a live query" against
 * the production database.
 */
const OUTSIDE_THE_REPO = [
  ...PLATFORMS.map((platform) => platform.pattern),
  /\bdashboard\b/i,
  /\bconsole\b/i,
  /\benv(?:ironment)? var(?:iable)?s?\b/i,
  /**
   * "set" has to LEAD the clause. Anchored anywhere, it matched "storing the granted scope set per
   * key" on #18, which is a sentence about a data model, not an instruction to anybody.
   */
  /^set\b[^.]*\b(?:key|secret|token|credential|env|variable)\b/i,
  /\blive (?:query|read|check)\b/i,
  /\bproduction (?:database|query|read)\b/i,
]

/**
 * The Linear migration footer and its collapsed reference list are provenance, not work. They sit
 * after the last heading, so they land inside whichever section came last, which on a 6.2 body is
 * usually Rollout. Left in, #144 handed over its own Linear URL as a step because the slug contains
 * the word "stripe".
 */
const FOOTER = /\n\s*(?:<sub>Migrated from Linear|<details><summary>|---\s*\n\s*<sub>)/

/** A configuration key in .NET section:key form, backticked or bare. */
const CONFIG_KEY = /`?\b([A-Za-z][\w.]*(?::[A-Za-z][\w.]*)+)\b`?/

const isOutsideTheRepo = (clause) => OUTSIDE_THE_REPO.some((pattern) => pattern.test(clause))

const platformOf = (clause) => PLATFORMS.find((platform) => platform.pattern.test(clause)) ?? null

/**
 * One bullet becomes one or more clauses. Splitting on the comma matters: #81's single bullet is
 * "merge, deploy to Render, then set `PostHog:ApiKey` in the Render env", three actions with two
 * different owners, and only the last two are Thomas's.
 *
 * Code and parentheses are MASKED before the split and restored after. Without that, #13's
 * "verified by a live query (`SELECT \"Purpose\", COUNT(*), SUM(\"Calls\") FROM ...`)" is cut at the
 * first comma inside the SQL and Thomas is handed half a query. A separator inside a backticked span
 * or a bracket is punctuation in someone else's language, not a clause boundary in this one.
 */
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

/**
 * The lines elsewhere in the ticket that talk about the same identifier. This is where the
 * confirmation comes from: #81's Expected behaviour already says what "it took effect" looks like,
 * so the step quotes the ticket instead of a guess about what PostHog shows.
 */
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

/**
 * Render's dashboard, in Render's own words. Source: render.com/docs/configure-environment-variables,
 * read 2026-08-10. The save dropdown's three options are quoted exactly because picking the wrong one
 * ("Save only") leaves the variable saved and the service still running without it.
 */
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

/**
 * The manual sections, each tagged `step` or `reversal`, with a heading's scope carried through its
 * DESCENDANTS exactly as `inScopeSections` carries Out of scope through its own.
 *
 * A flat filter on the heading matched only the exact heading, so a body organised as `## Rollout`
 * followed by `### Render` selected the empty parent and dropped every child: `extractManualSteps`
 * returned nothing and completion closed the ticket without the comment this whole file exists to
 * post. Reported by the Codex reviewer on PR #709 and reproduced before this fix.
 *
 * A sibling or ancestor heading ends the region, so `## Parity` after `## Rollout` is not rollout.
 */
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
