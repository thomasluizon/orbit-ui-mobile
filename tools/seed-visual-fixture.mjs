#!/usr/bin/env node
/**
 * seed-visual-fixture — seed the standard visual-verification fixture into the local Orbit API.
 *
 * WHY: a vision pass against an empty/one-row DB is structurally invalid
 * (`.claude/rules/visual-delivery.md` rule 3). This creates the rich fixture that
 * rule 4's per-surface screenshots must render against: a 3-level habit family
 * (so the drill affordance appears at the third tier), a childless habit, a
 * checklist habit, a long-title + long-description habit (to force wrap/overflow),
 * and — where the API allows — some scheduled/overdue/completed occurrences.
 *
 * HEADLESS FALLBACK ONLY. The PREFERRED path (an attended /drive run) needs no
 * token: seed through the already-signed-in browser via the web BFF —
 * `fetch('/api/habits', {method:'POST', credentials:'include', ...})` from the
 * logged-in page proxies authenticated to the API. Use this script only on a
 * renderless box where no browser session exists.
 *
 * USAGE:
 *   SEED_TOKEN=<bearer> node tools/seed-visual-fixture.mjs            # against http://localhost:5000
 *   API_BASE=http://localhost:5000 SEED_TOKEN=<jwt> node tools/seed-visual-fixture.mjs
 *
 * Get a token: the SESSION mints it itself — set TEST_ACCOUNTS=email:code on the
 * local API, restart `dotnet run`, and log in via the auth flow (SendCode returns
 * the fixed code for that email). This is the session's own job over the local
 * stack; never ask the human to enable an env var or restart a process. The script
 * prints every response so a drive session can adjust a payload shape on rejection.
 *
 * IDEMPOTENCY: this ADDS habits; run against a fresh/dev account, not production.
 * There is a hard guard below that refuses any non-localhost API_BASE.
 */

const API_BASE = process.env.API_BASE ?? 'http://localhost:5000'
const TOKEN = process.env.SEED_TOKEN

if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(API_BASE)) {
  console.error(`Refusing to seed a non-local API (${API_BASE}). This tool is local-dev only.`)
  process.exit(2)
}
if (!TOKEN) {
  console.error('Missing SEED_TOKEN (a bearer for a local dev account). See the header for how to get one.')
  process.exit(2)
}

const LONG_TITLE =
  'Beber dois litros de água ao longo do dia inteiro sem falhar nenhuma vez'
const LONG_DESC =
  'Uma descrição deliberadamente longa em pt-BR para forçar o wrap e provar que o layout não estoura a trilha nem quebra os rótulos em duas linhas.'

async function api(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let json
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = text
  }
  if (!res.ok) {
    console.error(`  ✗ ${path} -> ${res.status}`, json)
    throw new Error(`${path} failed (${res.status})`)
  }
  console.log(`  ✓ ${path} -> ${res.status}`)
  return json
}

/** Create a top-level habit; returns its id. */
const createHabit = (payload) => api('/api/habits', payload).then((r) => r?.id)
/** Attach one sub-habit (by title) to a parent; returns the created child id if the API returns it. */
const addSubHabit = (parentId, title) =>
  api(`/api/habits/${parentId}/sub-habits`, { subHabits: [title] }).then(
    (r) => r?.id ?? r?.children?.[r.children.length - 1]?.id ?? r?.[0]?.id,
  )

async function main() {
  console.log(`Seeding visual fixture into ${API_BASE} …`)

  // 3-level family: Water > Morning > Big glass > (a child, so Big glass shows the drill chevron at tier 3)
  const waterId = await createHabit({ title: 'Water', frequencyUnit: 'Day', frequencyQuantity: 1 })
  const morningId = await addSubHabit(waterId, 'Morning routine')
  const bigGlassId = morningId ? await addSubHabit(morningId, 'Big glass') : null
  if (bigGlassId) await addSubHabit(bigGlassId, 'First sip') // 4th tier -> forces the drill at tier 3

  // Childless single-row panel
  await createHabit({ title: 'Correr 5km', frequencyUnit: 'Day', frequencyQuantity: 1 })

  // Checklist (multi-row) habit
  await createHabit({
    title: 'Rotina da manhã',
    frequencyUnit: 'Day',
    frequencyQuantity: 1,
    checklistItems: [{ text: 'Alongar' }, { text: 'Meditar' }, { text: 'Café' }],
  })

  // Long-title + long-description (forces wrap/overflow, DESIGN.md measure + short-label rules)
  await createHabit({ title: LONG_TITLE, description: LONG_DESC, frequencyUnit: 'Day', frequencyQuantity: 1 })

  console.log(
    '\nDone. If any sub-habit call 400d, the /sub-habits payload shape differs — inspect the logged',
    'response and adjust addSubHabit(). Gamification (streak/level/achievements) and calendar',
    'occurrences are seeded by USING the app (log a few days) or a follow-up script; note the gap',
    'in the vision report rather than verifying those surfaces empty.',
  )
}

main().catch((err) => {
  console.error('\nSeed failed:', err.message)
  process.exit(1)
})
