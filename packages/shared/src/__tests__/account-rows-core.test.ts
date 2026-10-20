import { describe, expect, it } from 'vitest'
import { accountRowLabelKey, formatAccountRowValue } from '../chat/account-rows-core'

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
})
