export const meta = {
  name: 'vision-judge-539',
  description: 'Fan out vision-capable critics over captured #539 surface screenshots to prove which surfaces are NOT yet DESIGN.md-compliant',
  phases: [
    { title: 'Judge', detail: 'one design-reviewer + completeness-critic per surface group, reading its PNGs' },
    { title: 'Synthesize', detail: 'merge findings into a deduped punch-list' },
  ],
}

// args = { groups: [{ name, surfaces: [{ surfaceId, pngPaths: [abs...] }] }], designMd, defectsSpec, inventoryNote }
// Every path is absolute. designMd/defectsSpec are absolute file paths the agents Read themselves.

const groups = args?.groups ?? []
if (groups.length === 0) {
  log('vision-judge: no groups passed in args — nothing to judge')
  return { error: 'no-groups', punchList: [] }
}

const FINDINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['surfaces'],
  properties: {
    surfaces: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['surfaceId', 'status', 'findings'],
        properties: {
          surfaceId: { type: 'string' },
          status: { enum: ['transformed', 'partial', 'default', 'broken', 'no-artifact'] },
          findings: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['severity', 'issue'],
              properties: {
                severity: { enum: ['blocker', 'major', 'minor'] },
                issue: { type: 'string' },
                fileHint: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
}

phase('Judge')

function judgePrompt(group) {
  const lines = group.surfaces
    .map((s) => `- ${s.surfaceId}:\n${(s.pngPaths.length ? s.pngPaths : ['(NO SCREENSHOT ON DISK)']).map((p) => `    ${p}`).join('\n')}`)
    .join('\n')
  return `You are an adversarial visual-completeness critic for Orbit's #539 whole-app redesign. Your ONLY job is to FALSIFY the claim that these surfaces are "done" — find every surface still carrying default/untasteful styling or a DESIGN.md violation. Do not be charitable.

FIRST read these two files in full (they are the spec you judge against):
- ${args.designMd}
- ${args.defectsSpec}

Context you must apply: ${args.inventoryNote}

Then, for EACH surface below, use the Read tool on EVERY screenshot path listed (Read renders PNGs visually) and judge the rendered pixels against DESIGN.md:
${lines}

For each surface return a verdict:
- status "no-artifact" if a listed screenshot is missing on disk or Read shows a login/redirect/empty screen instead of the real surface (a surface you cannot see is UNKNOWN, never a pass).
- status "default" if it still looks default/shadcn/pre-redesign (opaque card-on-card, borders-as-borders, off-token colors, decorative glow/gradient, stretched full-bleed buttons, wrapped stat-tile labels, cramped or off-rhythm spacing).
- status "broken" if something is visibly wrong (overflow, double focus ring, misaligned indent, English text while the locale is pt-BR, raw PascalCase tool names).
- status "partial" if de-slopped but taste is thin (hierarchy, focal element size/weight, restraint).
- status "transformed" ONLY if it genuinely matches DESIGN.md's language with real taste.

List concrete findings (severity + specific issue + a fileHint when you can infer the component). Judge dark AND light, en AND pt-BR where both are provided. Be specific and pixel-grounded; never invent a file:line you did not derive. Return ONLY the structured object.`
}

const perGroup = await parallel(
  groups.map((group) => () =>
    agent(judgePrompt(group), {
      label: `judge:${group.name}`,
      phase: 'Judge',
      agentType: 'completeness-critic',
      schema: FINDINGS_SCHEMA,
    }),
  ),
)

phase('Synthesize')

const allSurfaces = perGroup.filter(Boolean).flatMap((r) => r.surfaces ?? [])
const notDone = allSurfaces.filter((s) => s.status !== 'transformed')
const byStatus = {}
for (const s of allSurfaces) byStatus[s.status] = (byStatus[s.status] ?? 0) + 1

log(`vision-judge: ${allSurfaces.length} surfaces judged — ${JSON.stringify(byStatus)}`)

return {
  judgedCount: allSurfaces.length,
  byStatus,
  transformed: allSurfaces.filter((s) => s.status === 'transformed').map((s) => s.surfaceId),
  punchList: notDone.map((s) => ({
    surfaceId: s.surfaceId,
    status: s.status,
    findings: s.findings,
  })),
}
