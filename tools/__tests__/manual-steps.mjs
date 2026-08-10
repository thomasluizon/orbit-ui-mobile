import { T } from "./_harness.mjs"

const { extractManualSteps, renderManualSteps } = await import("../lib/manual-steps.mjs")

const TOOL = "lib/manual-steps.mjs"

/**
 * orbit-tickets#81's real Rollout section, verbatim, plus the two lines elsewhere in that body which
 * mention the same key. This is the ticket that closed Done on 2026-08-08 with the key never set, so
 * it is the fixture the whole library exists to answer.
 */
const POSTHOG = `## Scope

* US host \`https://us.i.posthog.com\`. Project API key read from configuration (\`PostHog:ApiKey\`, supplied as a Render env var). Absent key = the registration binds a no-op capture implementation.

## Expected behaviour

* With \`PostHog:ApiKey\` set on Render: each of the five events appears in the PostHog US project.

## Rollout / kill switch

* Rollout: merge, deploy to Render, then set \`PostHog:ApiKey\` in the Render env. The code path is inert until the key exists.
* Kill switch: remove the Render env var; next restart reverts to the no-op implementation.
`

const ORDINARY = `## Scope

- Fix the store selector

## Acceptance criteria

- The list renders
`

export const cases = () => {
  const posthog = extractManualSteps(POSTHOG, { repo: "api" })
  const rendered = renderManualSteps(posthog) ?? ""

  T(`${TOOL}: the rollout section yields the two steps that leave the repository`, posthog.steps.length === 2, JSON.stringify(posthog.steps.map((step) => step.action)))
  T(
    `${TOOL}: "merge" is the harness's job and never becomes one of Thomas's steps`,
    posthog.steps.every((step) => !/^merge$/i.test(step.action)),
    JSON.stringify(posthog.steps.map((step) => step.action)),
  )
  /** The defect in one assertion: the ticket says PostHog:ApiKey and Render needs PostHog__ApiKey. */
  T(`${TOOL}: a .NET config key is expanded to the env var name that actually binds it`, /Key: `PostHog__ApiKey`/.test(rendered), rendered)
  T(`${TOOL}: the colon form is named as the wrong one rather than silently dropped`, /NOT `PostHog:ApiKey`/.test(rendered), rendered)
  T(`${TOOL}: the expansion names the Render dashboard and its Environment tab`, /Render Dashboard/.test(rendered) && /"Environment" tab/.test(rendered), rendered)
  T(`${TOOL}: the save option is quoted, because "Save only" leaves the service running without the value`, /"Save, rebuild, and deploy"/.test(rendered), rendered)
  T(
    `${TOOL}: the confirmation is QUOTED from the ticket rather than invented`,
    /Confirm it took effect\. Expected behaviour says: "With `PostHog:ApiKey` set on Render/.test(rendered),
    rendered,
  )
  T(`${TOOL}: the kill switch is a reversal note, never an outstanding step`, posthog.reversal.length === 1 && /To reverse it/.test(rendered), JSON.stringify(posthog.reversal))

  /** Silence is the correct output for the common case. A missing section is not an error. */
  T(`${TOOL}: a ticket with no rollout section produces nothing at all`, extractManualSteps(ORDINARY, { repo: "ui" }).steps.length === 0)
  T(`${TOOL}: nothing to say renders as null, not as an empty heading`, renderManualSteps(extractManualSteps(ORDINARY, { repo: "ui" })) === null)
  T(`${TOOL}: an empty body is silent rather than throwing`, extractManualSteps("", { repo: "ui" }).steps.length === 0)

  /**
   * The `:` to `__` rewrite is .NET behaviour, so it applies to the .NET repo and nowhere else.
   * Applying it to a ui ticket would hand Thomas an env var name nothing reads.
   */
  const uiKey = renderManualSteps(extractManualSteps(POSTHOG, { repo: "ui" })) ?? ""
  T(`${TOOL}: the .NET env var mapping is not applied to a non-.NET repo`, !/PostHog__ApiKey/.test(uiKey) && /Key: `PostHog:ApiKey`/.test(uiKey), uiKey)

  /**
   * `\\brender\\b` matches the RENDER in RENDER-CORRECTNESS.md, which put a Render dashboard
   * instruction on a pure documentation ticket. A platform name has to stand alone.
   */
  const filename = extractManualSteps("## Rollout\n\n* The self-critique of `RENDER-CORRECTNESS.md` is attached to this issue before In Review.\n", { repo: "ui" })
  T(`${TOOL}: a platform name inside a filename is not a platform`, filename.steps.length === 0, JSON.stringify(filename.steps))

  /**
   * A comma inside a backticked span is punctuation in SQL, not a clause boundary here. Splitting on
   * it handed over half a query.
   */
  const query = extractManualSteps('## Rollout\n\nVerify with a live query (`SELECT "Purpose", COUNT(*) FROM "AiUsageDaily" GROUP BY 1`) after deploy.\n', { repo: "api" })
  T(
    `${TOOL}: a separator inside backticks does not split the clause`,
    query.steps.length === 1 && query.steps[0].action.includes('COUNT(*) FROM "AiUsageDaily"'),
    JSON.stringify(query.steps.map((step) => step.action)),
  )

  /** An Out of scope section is excluded here exactly as it is for executability. */
  const excluded = extractManualSteps("## Out of scope\n\n### Rollout\n\n* Set the key in the Render env.\n", { repo: "api" })
  T(`${TOOL}: a rollout heading nested under Out of scope is excluded with its parent`, excluded.steps.length === 0, JSON.stringify(excluded.steps))

  /**
   * A standalone `## Kill switch` section. Its bullets start straight in on the action with no label
   * to strip, so they read as outstanding steps and the renderer expanded "Remove the key" into
   * "Click + Add Environment Variable": the exact opposite of the ticket's intent. Reproduced before
   * the fix, on PR #709.
   */
  const standalone = extractManualSteps(
    "## Rollout\n\n* Set `PostHog:ApiKey` in the Render env.\n\n## Kill switch\n\n* Remove `PostHog:ApiKey` from the Render env.\n",
    { repo: "api" },
  )
  T(
    `${TOOL}: a standalone kill-switch SECTION is reversal, not an outstanding step`,
    standalone.steps.length === 1 && standalone.reversal.length === 1 && /^Set /.test(standalone.steps[0].action),
    JSON.stringify({ steps: standalone.steps.map((step) => step.action), reversal: standalone.reversal }),
  )
  T(
    `${TOOL}: a removal is never expanded into instructions that add the value back`,
    !/Remove/.test(renderManualSteps(standalone)?.split("**To reverse it**")[0] ?? ""),
    renderManualSteps(standalone) ?? "",
  )
  /** "Rollout / kill switch" is still ONE rollout section whose bullets are labelled one by one. */
  T(`${TOOL}: a combined rollout and kill-switch heading keeps its rollout bullets`, posthog.steps.length === 2 && posthog.reversal.length === 1)

  /**
   * A rollout organised under child headings. The flat heading filter selected the empty parent and
   * dropped every child, so completion closed the ticket with no comment at all.
   */
  const nested = extractManualSteps("## Rollout\n\n### Render\n\n* Set `FeatureFlags:Provider` in the Render env.\n\n## Parity\n\n* None.\n", { repo: "api" })
  T(`${TOOL}: a rollout subsection is carried with its parent`, nested.steps.length === 1 && /FeatureFlags/.test(nested.steps[0].action), JSON.stringify(nested.steps.map((step) => step.action)))
  T(`${TOOL}: a sibling heading after the rollout region ends it`, !nested.headings.includes("Parity"), JSON.stringify(nested.headings))

  /** A vendor whose UI was never read gets named, never navigated. Inventing a screen is standard 8. */
  const stripe = renderManualSteps(extractManualSteps("## Rollout\n\n* Then enable the new price in the Stripe dashboard.\n", { repo: "api" })) ?? ""
  T(`${TOOL}: an unverified vendor is named without an invented navigation path`, /Do this in Stripe\./.test(stripe) && !/left sidebar/.test(stripe), stripe)
}
