import { structural, behavior, composition } from './assertions.mjs'
import { restartProposal, restartReadback } from './restart.mjs'
import { publicApi } from './fixtures/api.mjs'
import { readRestartSnapshot } from './fixtures/restart.mjs'
import { requireEvalOrigin } from './fixtures/reset.mjs'

export async function completeRestart(output, vars) {
  requireEvalOrigin()
  const context = { vars: { ...vars, restart: undefined }, test: { vars } }
  const checks = [await structural(output, context), behavior(output, context), composition(output, context), restartProposal(output, vars)]
  if (checks.some((check) => check.pass !== true || check.metadata?.skipped || check.metadata?.unavailable)) return output
  const api = publicApi(vars.credentialKey)
  const held = await readRestartSnapshot(api)
  if (!restartReadback({ ...output, restartReadback: { held, after: held } },
    { ...vars, restart: { ...vars.restart, decision: 'preview' } }).pass) {
    return { ...output, restartReadback: { held, after: held } }
  }
  const pending = output.composition.pendingOperations[0]
  const path = `ai/pending-operations/${pending.id}`
  if (vars.restart.decision === 'approve') {
    const { payload } = await api('POST', `${path}/confirm?clientContext=${encodeURIComponent(JSON.stringify(vars.clientContext))}`)
    if (typeof payload?.confirmationToken !== 'string' || !payload.confirmationToken.trim()) throw new Error('Restart confirmation lacks its token.')
    // The token stays in memory and never enters the graded output or evidence reports.
    await api('POST', `${path}/execute`, { confirmationToken: payload.confirmationToken, clientContext: vars.clientContext })
  } else if (vars.restart.decision === 'reject') {
    await api('POST', `${path}/revise`, { previewFingerprint: pending.previewFingerprint, items: [], clientContext: vars.clientContext })
    const confirmation = await api('POST', `${path}/confirm`, undefined, [], [404])
    if (confirmation.status !== 404) throw new Error('Rejected restart remains confirmable.')
  } else if (vars.restart.decision !== 'preview') throw new Error('Unknown restart decision.')
  return { ...output, restartReadback: { held, after: await readRestartSnapshot(api) } }
}
