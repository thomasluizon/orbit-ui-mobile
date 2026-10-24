import { describe, expect, it } from 'vitest'
import { IntlMessageFormat } from 'intl-messageformat'
import { parse, isArgumentElement, isNumberElement, isPluralElement, isSelectElement, type MessageFormatElement } from '@formatjs/icu-messageformat-parser'
import { buildActionChipsModel, resolveActionChipText } from '../chat/action-chips'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'
import { actionResultSchema, toolResultMessageParamsSchema } from '../types/chat'
import { apiToolResultKeys, makeEmojiToolResult, toolResultRegressionCases } from '../test-support/tool-result-fixtures'

function placeholders(elements: MessageFormatElement[]): string[] {
  return elements.flatMap((element) => {
    if (isSelectElement(element) || isPluralElement(element)) {
      return [element.value, ...Object.values(element.options).flatMap((option) => placeholders(option.value))]
    }
    return isArgumentElement(element) || isNumberElement(element) ? [element.value] : []
  })
}

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

  it.each(Object.keys(toolResultMessageParamsSchema.shape))('drops an invalid %s without losing valid parameters', (key) => {
    const validKey = key === 'referralCode' ? 'entityName' : 'referralCode'
    expect(toolResultMessageParamsSchema.parse({ [key]: [], [validKey]: 'KEEP' }))
      .toMatchObject({ [key]: undefined, [validKey]: 'KEEP' })
  })

  it.each([null, 'invalid', 1, []])('keeps an action with an invalid params envelope %j', (params) => {
    expect(actionResultSchema.parse({ type: 'LogHabit', status: 'Success', entityName: 'Legacy summary', params }).params).toBeUndefined()
  })

  it('accepts legacy actions and empty interpolation params', () => {
    expect(actionResultSchema.parse({ type: 'LogHabit', status: 'Success' }).messageKey).toBeUndefined()
    expect(toolResultMessageParamsSchema.parse({})).toEqual({})
  })

  it.each(['count', 'totalCount', 'skippedCount', 'weekStartDay', 'hours'])('drops strings and fractional values for %s', (key) => {
    expect(toolResultMessageParamsSchema.parse({ [key]: '1' })[key as 'count']).toBeUndefined()
    expect(toolResultMessageParamsSchema.parse({ [key]: 1.5 })[key as 'count']).toBeUndefined()
    expect(toolResultMessageParamsSchema.safeParse({ [key]: 1 }).success).toBe(true)
  })
})

describe.each([{ locale: 'en', catalog: en }, { locale: 'pt-BR', catalog: ptBR }])('API tool result registry in $locale', ({ locale, catalog }) => {
  it.each(apiToolResultKeys)('has a renderable translation for %s', (suffix) => {
    const template = leaf(catalog.chat.toolResult, suffix)
    expect(template).toBeTypeOf('string')
    expect(placeholders(parse(String(template))).filter((key) => key !== 'hasEntityName' && !Object.hasOwn(toolResultMessageParamsSchema.shape, key))).toEqual([])
    for (const count of [0, 1, 185]) {
      const message = new IntlMessageFormat(String(template), locale).format({
        entityName: "Ler d'água {#}", hasEntityName: 'yes', count, totalCount: count, skippedCount: count,
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

  it.each(['frequency_quantity', 'frequencyQuantity', 'private_engine_property'])('keeps named validation failures distinct for %s', (field) => {
    const names = ['Morning walk', 'Read ten pages']
    const actions = names.map(entityName => actionResultSchema.parse({ type: 'CreateHabit', status: 'Failed', entityName, field }))
    const model = buildActionChipsModel(actions, true)
    const guidance = field === 'private_engine_property'
      ? catalog.chat.toolResult.invalidDetails
      : locale === 'en'
        ? 'Check the Frequency count field and try again.'
        : 'Confira o campo Número da frequência e tente de novo.'
    const resolved = model.rows.map(row => resolveActionChipText(row, translations))

    expect(resolved).toEqual(names.map(name => ({
      label: `${catalog.chat.action.createFailed.replace('{name}', name)}. ${guidance}`,
      personal: true,
      wrapLabel: true,
    })))
    expect(model.rows.map(row => row.navigation)).toEqual([{ navigable: false }, { navigable: false }])
    expect(JSON.stringify(resolved)).not.toContain(field)
  })

  it.each(['frequency_quantity', 'private_engine_property'])('keeps nameless validation guidance for %s', (field) => {
    expect(textFor({ type: 'CreateHabit', status: 'Failed', field })).toEqual({
      label: field === 'private_engine_property'
        ? catalog.chat.toolResult.invalidDetails
        : locale === 'en'
          ? 'Check the Frequency count field and try again.'
          : 'Confira o campo Número da frequência e tente de novo.',
      personal: false,
      wrapLabel: true,
    })
  })

  it('gives keyed failures precedence over legacy field guidance', () => {
    expect(textFor({ type: 'CreateHabit', status: 'Failed', entityName: 'Legacy name', field: 'frequency_quantity', messageKey: 'chat.toolResult.toolFailure', params: {} }))
      .toEqual({ label: catalog.chat.toolResult.toolFailure, personal: false, wrapLabel: true })
  })

  it('does not turn a successful result with a field into validation guidance', () => {
    expect(textFor({ type: 'CreateHabit', status: 'Success', entityName: 'Morning walk', field: 'frequency_quantity' }))
      .toEqual({ label: catalog.chat.action.created.replace('{name}', 'Morning walk'), personal: true, wrapLabel: true })
  })

  it.each(apiToolResultKeys)('uses legacy text when any required parameter for %s is missing', (suffix) => {
    const required = new Set(placeholders(parse(String(leaf(catalog.chat.toolResult, suffix)))))
    const parameters = { entityName: 'Habit', count: 1, totalCount: 2, skippedCount: 1, hours: 24, weekStartDay: 0, fieldName: 'title', language: 'en', timeZone: 'America/Sao_Paulo', referralCode: 'CODE' }
    for (const key of required) {
      if (key === 'entityName' || key === 'hasEntityName') continue
      const incomplete = { ...parameters }
      Reflect.deleteProperty(incomplete, key)
      expect(textFor({ type: 'unmapped_tool', status: 'Success', entityName: 'Legacy summary', messageKey: `chat.toolResult.${suffix}`, params: incomplete })?.label).toBe('Legacy summary')
    }
  })

  it.each(toolResultRegressionCases)('handles $name', (scenario) => {
    expect(textFor(scenario.payload)?.label).toBe(locale === 'en' ? scenario.en : scenario.ptBR)
  })

  it('uses numeric metadata instead of an English summary', () => {
    expect(textFor(makeEmojiToolResult(185))?.label).toContain(locale === 'en' ? '185 habits' : '185 hábitos')
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
