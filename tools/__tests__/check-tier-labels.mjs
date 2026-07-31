
import { check, CODEX_MODELS, freshTierLabelSnapshot, stageTierLabels, PRESENT_TIER_LABELS } from "./_harness.mjs"

const tierLabelCases = () => {
  const missing = stageTierLabels(
    "missing",
    CODEX_MODELS,
    freshTierLabelSnapshot(["worker:sonnet"]),
  )
  check(
    "check-tier-labels.mjs",
    "a missing snapshotted label names the expected selectors, snapshot inventory, and shortfall",
    [],
    {
      status: 1,
      stdout: /tier-labels FAIL[\s\S]*looked for: tier:cheap, tier:deep[\s\S]*snapshot labels: worker:sonnet[\s\S]*missing: tier:cheap, tier:deep[\s\S]*problem: declared tier labels are missing/,
    },
    { path: missing.path },
  )

  const declared = stageTierLabels("declared")
  check(
    "check-tier-labels.mjs",
    "passes when a fresh canonical snapshot contains every declared tier label",
    [],
    {
      status: 0,
      stdout: /tier-labels PASS[\s\S]*looked for: tier:cheap, tier:deep[\s\S]*snapshot labels: tier:cheap, tier:deep, worker:sonnet[\s\S]*missing: \(none\)/,
    },
    { path: declared.path },
  )

  const staleSnapshot = freshTierLabelSnapshot(PRESENT_TIER_LABELS)
  staleSnapshot.capturedAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()
  const stale = stageTierLabels("stale", CODEX_MODELS, staleSnapshot)
  check(
    "check-tier-labels.mjs",
    "a snapshot older than 30 days fails closed",
    [],
    { status: 1, stdout: /tier-labels FAIL[\s\S]*problem: snapshot is 31 days old; refresh it before 30 days/ },
    { path: stale.path },
  )

  const nonCanonical = stageTierLabels("non-canonical", CODEX_MODELS, {
    ...freshTierLabelSnapshot(),
    editedByHand: true,
  })
  check(
    "check-tier-labels.mjs",
    "a snapshot whose shape cannot be produced by the refresh tool fails closed",
    [],
    { status: 3, stderr: /tier-labels ERROR[\s\S]*must have exactly schemaVersion 1, team, capturedAt, and labels/ },
    { path: nonCanonical.path },
  )

  const unparseable = stageTierLabels("unparseable-snapshot", CODEX_MODELS, "not-json")
  check(
    "check-tier-labels.mjs",
    "an unparseable snapshot fails closed",
    [],
    { status: 3, stderr: /tier-labels ERROR[\s\S]*could not be read as JSON/ },
    { path: unparseable.path },
  )

  const noDeclaredTiers = stageTierLabels("no-declared-tiers", {
    default: CODEX_MODELS.default,
  })
  check(
    "check-tier-labels.mjs",
    "zero declared tiers fail so a config path typo cannot report a clean run",
    [],
    { status: 1, stdout: /no non-default worker tiers are declared/ },
    { path: noDeclaredTiers.path },
  )
}

export { tierLabelCases as cases }
