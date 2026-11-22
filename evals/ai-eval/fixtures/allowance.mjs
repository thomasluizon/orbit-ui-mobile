function allowance(profile) {
  if (!Number.isInteger(profile?.aiMessagesUsed) || !Number.isInteger(profile.aiMessagesLimit)
    || profile.aiMessagesUsed < 0 || profile.aiMessagesLimit < 1) {
    throw new Error('Budget fixture lacks valid message allowance evidence.')
  }
  return profile.aiMessagesLimit - profile.aiMessagesUsed
}

export async function exhaustAllowance(api, profile, locale) {
  const remaining = allowance(profile)
  if (remaining <= 0) return
  if (remaining > 5) throw new Error('Budget fixture needs more than five ordinary messages; setup cannot reset counters, rotate accounts or raise limits.')
  let previousUsed = profile.aiMessagesUsed
  for (let attempt = 0; attempt < remaining; attempt++) {
    const body = new FormData()
    body.set('message', locale === 'pt-BR' ? 'Oi.' : 'Hello.')
    body.set('history', '[]')
    body.set('clientContext', JSON.stringify({ platform: 'web', locale: locale ?? 'en' }))
    const response = await api('POST', 'chat', body, ['AI_DAILY_BUDGET_EXCEEDED', 'PAY_GATE'])
    const { payload: current } = await api('GET', 'profile')
    const left = allowance(current)
    if (current.aiMessagesLimit !== profile.aiMessagesLimit) throw new Error('Budget fixture message limit changed during setup.')
    if (left <= 0) return
    if (current.aiMessagesUsed <= previousUsed) {
      const reason = response.payload?.errorCode === 'AI_DAILY_BUDGET_EXCEEDED'
        ? 'Daily safety budget prevented message allowance exhaustion.' : 'Ordinary chat did not consume message allowance.'
      throw new Error(`${reason} Setup cannot reset counters, rotate accounts or raise limits.`)
    }
    previousUsed = current.aiMessagesUsed
  }
  throw new Error('Budget fixture did not exhaust its message allowance within the bounded setup; counters, accounts and limits cannot be changed.')
}
