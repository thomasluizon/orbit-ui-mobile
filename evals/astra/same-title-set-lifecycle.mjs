import { structural, behavior, composition } from './assertions.mjs'
import { sameTitleProposal } from './same-title-set.mjs'
import { publicApi } from './fixtures/api.mjs'
import { readSameTitleSet } from './fixtures/same-title-set.mjs'
import { requireEvalOrigin } from './fixtures/reset.mjs'

export async function completeSameTitleSet(output, vars) {
  requireEvalOrigin()
  const context = { vars: { ...vars, sameTitleSet: undefined }, test: { vars } }
  const checks = [await structural(output, context), behavior(output, context), composition(output, context), sameTitleProposal(output, vars)]
  if (checks.some((check) => check.pass !== true || check.metadata?.skipped || check.metadata?.unavailable)) return output
  const api = publicApi(vars.credentialKey)
  const parentId = vars.sameTitleBaseline.parent.id
  const held = await readSameTitleSet(api, parentId)
  if (JSON.stringify(held) !== JSON.stringify(vars.sameTitleBaseline)) return { ...output, sameTitleReadback: { held, after: held } }
  for (const pending of output.composition.pendingOperations ?? []) {
    const path = `ai/pending-operations/${pending.id}`
    const { payload } = await api('POST', `${path}/confirm?clientContext=${encodeURIComponent(JSON.stringify(vars.clientContext))}`)
    if (typeof payload?.confirmationToken !== 'string' || !payload.confirmationToken.trim()) throw new Error('Same-title confirmation lacks its token.')
    // The token stays in memory and never enters the graded output or evidence reports.
    await api('POST', `${path}/execute`, { confirmationToken: payload.confirmationToken, clientContext: vars.clientContext })
  }
  return { ...output, sameTitleReadback: { held, after: await readSameTitleSet(api, parentId) } }
}
