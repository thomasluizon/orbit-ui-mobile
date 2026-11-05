import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { IntlMessageFormat } from 'intl-messageformat'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createTokensV2 } from '@/lib/theme'
import { SlipAlertSection } from '@/components/habits/habit-form-fields/slip-alert-section'
import { TagPickerField } from '@/components/habits/habit-form-fields/tag-picker-field'
import { __resetTestHostConfig, __setWindowDimensions } from '@/test-mocks/react-native'
import { measureInteractionFills } from '../../support/interaction-fill-geometry'
const TestRenderer = require('react-test-renderer')
const context = vi.hoisted(() => ({ locale: 'en', theme: 'dark' }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: context.theme }) }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: context.locale }, t: (key: string, values?: Record<string, string | number>) => {
  const messages = context.locale === 'en' ? en : ptBR
  const template = key.split('.').reduce<unknown>((current, part) => (current as Record<string, unknown>)[part], messages)
  return typeof template === 'string' ? new IntlMessageFormat(template, context.locale).format(values) as string : key
} }) }))
afterEach(() => __resetTestHostConfig())

const cases = [320, 412].flatMap(width => [1, 2].flatMap(scale => (['en', 'pt-BR'] as const).flatMap(locale => (['dark', 'light'] as const).map(mode => ({ width, scale, locale, mode })))))

function expectFieldFill(tree: ReturnType<typeof TestRenderer.create>, width: number, scale: number, label: string) {
  const bounds = measureInteractionFills(tree.toJSON(), width, true, scale)
  const control = bounds.find(part => 'accessibilityRole' in part.host.props && (part.host.props.accessibilityRole === 'switch' || part.host.props.accessibilityRole === 'button') && (part.host.props.accessibilityLabel == null || String(part.host.props.accessibilityLabel).startsWith(label)))
  expect(control).toBeDefined()
  expect(control!.left).toBe(0)
  expect(control!.right).toBe(width)
  const fill = bounds.find(part => part.host.props['data-slot'] === 'list-row-body')!
  expect(fill.left).toBe(0)
  expect(fill.right).toBe(width)
}

it.each(cases)('keeps the More details slip alert fill on the field edge at $width and $scale in $locale/$mode', ({ width, scale, locale, mode }) => {
  context.locale = locale
  context.theme = mode
  __setWindowDimensions({ width: width + 32, height: 915, scale: 1, fontScale: scale })
  const messages = locale === 'en' ? en : ptBR
  let tree: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(<SlipAlertSection inline tokens={createTokensV2('orange', mode)} hasProAccess slipAlertEnabled={false} onToggle={vi.fn()} onUpgrade={vi.fn()} />) })
  expectFieldFill(tree, width, scale, messages.habits.form.slipAlert)
  TestRenderer.act(() => tree!.unmount())
})

it.each(cases)('keeps the More details tag row fill on the field edge at $width and $scale in $locale/$mode', ({ width, scale, locale, mode }) => {
  context.locale = locale
  context.theme = mode
  __setWindowDimensions({ width: width + 32, height: 915, scale: 1, fontScale: scale })
  const messages = locale === 'en' ? en : ptBR
  let tree: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(<TagPickerField tags={[]} selectedIds={[]} atLimit={false} onToggle={vi.fn()} onCreate={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} editLabel="edit" deleteLabel="delete" />) })
  expectFieldFill(tree, width, scale, messages.habits.form.tags)
  TestRenderer.act(() => tree!.unmount())
})
