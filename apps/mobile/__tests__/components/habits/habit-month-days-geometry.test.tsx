import React from 'react'
import type { ReactTestRenderer } from 'react-test-renderer'
import { Text, View } from 'react-native'
import { __setWindowDimensions } from '@/test-mocks/react-native'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HabitMonthDaysField } from '@/components/habits/habit-form-fields/habit-month-days-field'
import { i18n } from '@/lib/i18n'
import { measureProfileRow } from '@/__tests__/support/profile-row-geometry'

interface RenderedTree extends ReactTestRenderer { toJSON: () => Parameters<typeof measureProfileRow>[0]; unmount: () => void }
const renderer = require('react-test-renderer') as { create: (element: React.ReactElement) => RenderedTree; act: typeof import('react-test-renderer')['act'] }
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('react-i18next', () => ({ initReactI18next: { type: '3rdParty', init: () => undefined }, useTranslation: () => ({ t: i18n.t.bind(i18n), i18n }) }))

const cases = [320, 360].flatMap(width => (['en', 'pt-BR'] as const).map(locale => ({ width, locale })))

function newStrings(): string[] {
  const days = i18n.t('listFormatting.pair', { first: [1, 8].map(day => i18n.t('habits.frequency.monthDay', { day })).join(', '), last: i18n.t('habits.frequency.monthDay', { day: 15 }) })
  return [
    i18n.t('habits.frequency.onMonthDays', { days }),
    i18n.t('habits.frequency.everyNMonthsOnDays', { days, n: 2, count: 3 }),
    i18n.t('habits.form.understoodMonthDaysAt', { schedule: i18n.t('habits.frequency.onMonthDays', { days }), time: '09:00' }),
    i18n.t('habits.form.monthDaysQuestion'),
    i18n.t('habits.form.monthDaysShortMonth'),
    i18n.t('habits.form.monthDaysInvalid'),
    i18n.t('habits.form.monthDaysOnlyForMonthly'),
    i18n.t('chat.operation.field.month_days'),
  ]
}

afterEach(async () => {
  __setWindowDimensions({ width: 412, height: 892, scale: 1, fontScale: 1 })
  await i18n.changeLanguage('en')
})

describe('native month-day question geometry', () => {
  it.each(cases)('keeps the question, summary, hint and 31 days inside $width in $locale', async ({ width, locale }) => {
    __setWindowDimensions({ width, height: 1400, scale: 1, fontScale: 1 })
    await i18n.changeLanguage(locale)
    const strings = newStrings()
    let tree!: ReturnType<typeof renderer.create>
    await renderer.act(() => {
      tree = renderer.create(<View style={{ padding: 16 }}><View style={{ paddingHorizontal: 16 }}>
        <HabitMonthDaysField visible monthDays={[1, 8, 15, 31]} anchorDay={8} quantity={1} onToggle={vi.fn()} />
        {strings.map(text => <Text key={text} style={{ fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 20 }}>{text}</Text>)}
      </View></View>)
    })
    try {
      const measured = measureProfileRow(tree.toJSON(), width, 1)
      const summary = i18n.t('habits.frequency.onMonthDays', { days: i18n.t('listFormatting.pair', { first: [1, 8, 15].map(day => i18n.t('habits.frequency.monthDay', { day })).join(', '), last: i18n.t('habits.frequency.monthDay', { day: 31 }) }) })
      for (const label of [...strings, summary]) {
        const text = measured.texts.find(candidate => candidate.label === label)
        expect(text, label).toBeDefined()
        expect(text!.lines, label).toBe(1)
        expect(text!.left + text!.width, label).toBeLessThanOrEqual(width - 16 + 0.01)
      }
      const days = measured.controls.filter(control => /^\d+$/.test(control.accessibilityLabel ?? ''))
      expect(days).toHaveLength(31)
      days.forEach((control, index) => {
        expect(control.width).toBeGreaterThanOrEqual(24)
        expect(control.height).toBeGreaterThanOrEqual(48)
        expect(control.right).toBeLessThanOrEqual(width - 32 + 0.01)
        if (index % 7) expect(control.left + 0.01).toBeGreaterThanOrEqual(days[index - 1]!.right)
      })
      expect(new Set(days.map(control => Math.round(control.top))).size).toBe(5)
    } finally { await renderer.act(() => tree.unmount()) }
  })
})
