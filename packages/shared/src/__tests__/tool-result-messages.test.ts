import { describe, expect, it } from 'vitest'
import { IntlMessageFormat } from 'intl-messageformat'
import { buildActionChipsModel, resolveActionChipText } from '../chat/action-chips'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'
import { actionResultSchema, toolResultMessageParamsSchema } from '../types/chat'
import { apiToolResultKeys, makeEmojiToolResult } from '../test-support/tool-result-fixtures'

function leaf(catalog: object, key: string): unknown {
  return key.split('.').reduce<unknown>((value, segment) =>
    value && typeof value === 'object' ? Reflect.get(value, segment) : undefined, catalog)
}

describe('tool result message contract', () => {
  it('retains keyed metadata and numeric counts from the producer', () => {
    expect(makeEmojiToolResult(185)).toMatchObject({
      messageKey: 'chat.toolResult.updatedEmojis',
      params: { count: 185, totalCount: 185, skippedCount: 0, partial: false },
    })
  })

  it('accepts legacy actions and empty interpolation params', () => {
    expect(actionResultSchema.parse({ type: 'LogHabit', status: 'Success' }).messageKey).toBeUndefined()
    expect(toolResultMessageParamsSchema.parse({})).toEqual({})
  })

  it.each(['count', 'totalCount', 'skippedCount', 'weekStartDay', 'hours'])('rejects strings and fractional values for %s', (key) => {
    expect(toolResultMessageParamsSchema.safeParse({ [key]: '1' }).success).toBe(false)
    expect(toolResultMessageParamsSchema.safeParse({ [key]: 1.5 }).success).toBe(false)
    expect(toolResultMessageParamsSchema.safeParse({ [key]: 1 }).success).toBe(true)
  })
})

describe.each([{ locale: 'en', catalog: en }, { locale: 'pt-BR', catalog: ptBR }])('API tool result registry in $locale', ({ locale, catalog }) => {
  it.each(apiToolResultKeys)('has a renderable translation for %s', (suffix) => {
    const template = leaf(catalog.chat.toolResult, suffix)
    expect(template).toBeTypeOf('string')
    for (const count of [0, 1, 185]) {
      const message = new IntlMessageFormat(String(template), locale).format({
        entityName: "Ler d'água {#}", count, totalCount: count, skippedCount: count,
        partial: 'false', weekStartDay: 0, hours: 24, toolName: 'log_habit', bulkTool: 'bulk_log_habits',
        policyReason: 'policy', timeZone: 'America/Sao_Paulo', language: 'pt-BR', referralCode: 'MY-CODE',
        fieldName: 'title', actionName: 'action', entityId: 'entity-1',
      })
      expect(message).not.toBe('')
      expect(message).not.toContain('chat.toolResult.')
      expect(message).not.toContain('{count')
    }
  })
})

describe.each([{ locale: 'en', catalog: en }, { locale: 'pt-BR', catalog: ptBR }])('shared result text resolution in $locale', ({ locale, catalog }) => {
  const translations = {
    has: (key: string) => typeof leaf(catalog, key) === 'string',
    translate: (key: string, params?: Record<string, string | number>) =>
      String(new IntlMessageFormat(String(leaf(catalog, key)), locale).format(params)),
  }

  function textFor(payload: unknown) {
    const row = buildActionChipsModel([actionResultSchema.parse(payload)], false).rows[0]!
    return resolveActionChipText(row, translations)
  }

  it('uses numeric metadata instead of an English summary', () => {
    expect(textFor(makeEmojiToolResult(185))?.label).toContain(locale === 'en' ? '185 matching habits' : '185 hábitos encontrados')
  })

  it('keeps optional entity names optional', () => {
    expect(textFor({ type: 'CreateHabit', status: 'Success', messageKey: 'chat.toolResult.createdHabit', params: {} })?.label)
      .toBe(locale === 'en' ? 'Habit created' : 'Hábito criado')
  })

  it('falls back to a named legacy action for an unknown key', () => {
    expect(textFor({ type: 'CreateHabit', status: 'Success', entityName: 'Caminhada', messageKey: 'chat.toolResult.futureKey' })?.label)
      .toBe(locale === 'en' ? 'Created Caminhada' : 'Criou Caminhada')
  })

  it('keeps a safe generic failure for a nameless legacy error', () => {
    expect(textFor({ type: 'LogHabit', status: 'Failed', error: 'database unavailable' })?.label)
      .toBe(catalog.chat.action.failed)
  })

  it('omits a result without keyed or legacy content', () => {
    expect(textFor({ type: 'LogHabit', status: 'Success' })).toBeUndefined()
  })
})
