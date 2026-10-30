import { publicApi } from './api.mjs'
import { safeFailureMessage } from '../credentials.mjs'

async function setAndVerify(api, language) {
  await api('PUT', 'profile/language', { language })
  const { payload } = await api('GET', 'profile')
  if (payload?.language !== language) throw new Error('Profile language readback did not match the requested language.')
}

export async function withLegacyProfileLanguage(vars, run) {
  if (!vars.legacyProfileLanguage || vars.preconditionFailure) return run()
  const api = publicApi(vars.credentialKey)
  try {
    const { payload } = await api('GET', 'profile')
    const original = payload?.language
    if (!['en', 'pt-BR'].includes(original)) throw new Error('Legacy locale setup requires a restorable profile language.')
    try {
      await setAndVerify(api, vars.legacyProfileLanguage)
      return await run()
    } finally {
      await setAndVerify(api, original)
    }
  } catch (error) {
    const reason = `Legacy profile language unavailable. ${safeFailureMessage(error)}`
    return { error: reason, metadata: { astraPreconditionFailure: true, astraPreconditionReason: reason } }
  }
}
