import React from 'react'
import { createInstance } from 'i18next'
import ICUCommonJs from 'i18next-icu/cjs'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { actionResultSchema } from '@orbit/shared/types/chat'
import { makeEmojiToolResult, toolResultRegressionCases } from '../../../../../packages/shared/src/test-support/tool-result-fixtures'
import { renderedText } from '@/__tests__/support/react-test-renderer'
import { ActionChips } from '@/components/chat/action-chips'

vi.unmock('react-i18next')
const ICU = typeof ICUCommonJs === 'function' ? ICUCommonJs : ICUCommonJs.default

describe.each([
  { locale: 'en', zero: '0 habits', singular: '1 habit', plural: '185 habits' },
  { locale: 'pt-BR', zero: '0 hábitos', singular: '1 hábito', plural: '185 hábitos' },
])('ActionChips result messages in $locale on Android', ({ locale, zero, singular, plural }) => {
  async function renderAction(payload: unknown) {
    const i18n = createInstance()
    await i18n.use(ICU).use(initReactI18next).init({
      lng: locale,
      resources: { en: { translation: en }, 'pt-BR': { translation: ptBR } },
    })
    let tree!: ReactTestRenderer
    await act(() => { tree = create(<I18nextProvider i18n={i18n}>
      <ActionChips actions={[actionResultSchema.parse(payload)]} />
    </I18nextProvider>) })
    return tree
  }


  it.each(toolResultRegressionCases)('handles $name through the real translator', async (scenario) => {
    const tree = await renderAction(scenario.payload)
    const output = renderedText(tree.root)
    expect(output).toContain(locale === 'en' ? scenario.en : scenario.ptBR)
    expect(output).not.toContain('chat.toolResult.')
    expect(output).not.toContain('{count}')
  })

  it.each([0, 1, 185])('renders the producer emoji result with %i habits', async (count) => {
    const tree = await renderAction(makeEmojiToolResult(count))
    const output = renderedText(tree.root)
    expect(output).toContain(count === 0 ? zero : count === 1 ? singular : plural)
    expect(output).not.toContain('habit(s)')
    expect(output).not.toContain('chat.toolResult.')
  })

  it.each([undefined, 'chat.toolResult.futureKey'])('keeps legacy content for key %s', async (messageKey) => {
    const tree = await renderAction({ type: 'bulk_update_habit_emojis', status: 'Success', entityName: 'Legacy summary', messageKey })
    expect(renderedText(tree.root)).toContain('Legacy summary')
  })

  it.each([undefined, 'chat.toolResult.futureKey'])('omits an empty card for key %s', async (messageKey) => {
    const tree = await renderAction({ type: 'LogHabit', status: 'Success', messageKey })
    expect(tree.root.findAll((node) => String(node.type) === 'View')).toHaveLength(0)
  })

  it('renders a keyed failure with empty params and keeps failure semantics', async () => {
    const tree = await renderAction({ type: 'LogHabit', status: 'Failed', error: 'database unavailable', messageKey: 'chat.toolResult.toolFailure', params: {} })
    const output = renderedText(tree.root)
    expect(output).toContain(locale === 'en' ? 'I could not complete that. Try again.' : 'Não consegui concluir. Tente de novo.')
    expect(output).toContain(locale === 'en' ? en.chat.operation.status.Failed : ptBR.chat.operation.status.Failed)
    expect(output).not.toContain('database unavailable')
  })

  it('preserves user authored names and referral values', async () => {
    const named = await renderAction({ type: 'CreateHabit', status: 'Success', messageKey: 'chat.toolResult.createdHabit', params: { entityName: "Ler d'água {#} <livro>" } })
    expect(renderedText(named.root)).toContain("Ler d'água {#} <livro>")
    const referral = await renderAction({ type: 'get_referral_code', status: 'Success', messageKey: 'chat.toolResult.referralCode', params: { referralCode: 'MY-CODE-{#}' } })
    expect(renderedText(referral.root)).toContain('MY-CODE-{#}')
  })
})
