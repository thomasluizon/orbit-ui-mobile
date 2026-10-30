import { describe, expect, it } from 'vitest'
import { accountRowLabelKey, formatAccountRowValue, presentAccountRows } from '../chat/account-rows-core'
import type { AccountRowsCard } from '../types/chat'

const t = (key: string) => key

describe('Astra account row presentation', () => {
  it('drops unknown keys', () => {
    expect(accountRowLabelKey('unexpected')).toBeNull()
    expect(accountRowLabelKey('plan')).toBe('chat.account.row.plan')
  })

  it('formats dates and counts for pt-BR', () => {
    expect(formatAccountRowValue({ key: 'trialEnd', value: '2026-09-26T12:00:00Z', valueType: 'date' }, 'pt-BR', t)).toContain('set.')
    expect(formatAccountRowValue({ key: 'astraAllowance', value: '1000/2500', valueType: 'count' }, 'pt-BR', t)).toBe('1.000 / 2.500')
  })

  it('localizes boolean and enum values', () => {
    expect(formatAccountRowValue({ key: 'lifetime', value: 'true', valueType: 'boolean' }, 'en', t)).toBe('chat.account.yes')
    expect(formatAccountRowValue({ key: 'plan', value: 'Free', valueType: 'enum' }, 'en', t)).toBe('chat.account.value.plan.Free')
  })

  it('recognizes the deployed Pro-days kind', () => {
    expect(formatAccountRowValue({ key: 'rewardType', value: 'pro_days', valueType: 'enum' }, 'en', t)).toBe('chat.account.value.rewardType.pro_days')
  })

  it.each(['pro_days', 'future_reward', null])('hides the unrelated percentage for %s while retaining actual counts', (kind) => {
    const card: AccountRowsCard = { kind: 'referral', rows: [
      { key: 'successfulReferrals', value: '8', valueType: 'count' },
      { key: 'pendingReferrals', value: '2', valueType: 'count' },
      { key: 'maxReferrals', value: '10', valueType: 'count' },
      { key: 'rewardType', value: kind, valueType: 'enum' },
      { key: 'discountPercent', value: '23', valueType: 'count' },
    ], surfaceId: 'profile' }
    expect(presentAccountRows(card)).toEqual(card.rows.slice(0, 4))
  })

  it('retains the matching coupon and all profile/plan rows', () => {
    const rows: AccountRowsCard['rows'] = [{ key: 'rewardType', value: 'discount', valueType: 'enum' }, { key: 'discountPercent', value: '23', valueType: 'count' }]
    for (const kind of ['referral', 'profile', 'plan'] as const) expect(presentAccountRows({ kind, rows, surfaceId: 'profile' })).toEqual(rows)
  })
})

it('presents the account time zone as a localized name', () => {
  expect(formatAccountRowValue({ key: 'timeZone', value: 'America/Sao_Paulo', valueType: 'text' }, 'pt-BR', key => key)).toMatch(/^Horário (Padrão de |de )Brasília$/)
})

it('retains an unsupported account time zone without blanking the block', () => {
  expect(formatAccountRowValue({ key: 'timeZone', value: 'Unsupported/Zone', valueType: 'text' }, 'pt-BR', t)).toBe('Unsupported/Zone')
})


it('omits unset plan details and false lifetime while preserving allowance and other account kinds', () => {
  const rows: AccountRowsCard['rows'] = [
    { key: 'plan', value: 'Pro', valueType: 'enum' },
    { key: 'trialEnd', value: '2026-11-01T12:00:00Z', valueType: 'date' },
    { key: 'planExpiry', value: null, valueType: 'date' },
    { key: 'interval', value: '', valueType: 'enum' },
    { key: 'source', value: null, valueType: 'enum' },
    { key: 'lifetime', value: 'false', valueType: 'boolean' },
    { key: 'astraAllowance', value: '78/250', valueType: 'count' },
  ]
  expect(presentAccountRows({ kind: 'plan', rows, surfaceId: 'profile' })).toEqual([rows[0], rows[1], rows[6]])
  for (const kind of ['profile', 'referral'] as const) expect(presentAccountRows({ kind, rows, surfaceId: 'profile' })).toEqual(rows)
  const lifetime = { key: 'lifetime', value: 'true', valueType: 'boolean' } as const
  expect(presentAccountRows({ kind: 'plan', rows: [lifetime], surfaceId: 'profile' })).toEqual([lifetime])
})
