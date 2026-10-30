import React from 'react'
import type { ReactTestRenderer } from 'react-test-renderer'
import { renderedText } from '@/__tests__/support/react-test-renderer'
import { StyleSheet, View, type ViewStyle } from 'react-native'
import { __setWindowDimensions } from '@/test-mocks/react-native'
import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { makeCreateHabitsPreview } from '@orbit/shared/test-support/pending-operation-preview-fixtures'
import { buildHabitUnderstandingLabels } from '@orbit/shared/utils'
import { OnboardingCreateHabit } from '@/components/onboarding/onboarding-create-habit'
import { PendingOperationCard } from '@/components/chat/pending-operation-card'
import { HabitUnderstanding } from '@/components/habits/habit-form-fields/habit-understanding'
import { i18n } from '@/lib/i18n'
import { measureProfileRow } from '@/__tests__/support/profile-row-geometry'

interface RenderedTree extends ReactTestRenderer { toJSON: () => Parameters<typeof measureProfileRow>[0]; unmount: () => void }
const renderer = require('react-test-renderer') as { create: (element: React.ReactElement) => RenderedTree; act: typeof import('react-test-renderer')['act'] }
vi.mock('react-i18next', () => ({ initReactI18next: { type: '3rdParty', init: () => undefined }, useTranslation: () => ({ t: i18n.t.bind(i18n), i18n }) }))
vi.mock('@/components/ui/time-field', () => ({ TimeField: () => null }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { timeZone: 'Pacific/Honolulu' } }) }))
vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayTime: (value: string) => value }) }))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
vi.mock('@/components/habits/habit-form-fields/habit-emoji-selector', () => ({ HabitEmojiSelector: () => null }))

const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const onboarding = {
  title: 'Read', emoji: '', schedule: { days: weekdays, frequencyUnit: 'Day' as const, frequencyQuantity: 1, intervalWeeks: 1, isGeneral: false, isFlexible: false, dueTime: '' },
  proposed: false, correcting: true, canSaveRepeatWeeks: true, atLimit: false, allowance: 5,
  onCorrect: vi.fn(), onToggleDay: vi.fn(), onTimeChange: vi.fn(), onModeChange: vi.fn(), onFrequencyUnitChange: vi.fn(), onQuantityChange: vi.fn(), onIntervalWeeksChange: vi.fn(),
}
const cases = [320, 360, 393, 412].flatMap(width => (['en', 'pt-BR'] as const).flatMap(locale => [1, 2].flatMap(scale =>
  (['form', 'onboarding', 'proposal', 'astra'] as const).map(surface => ({ width, locale, scale, surface })),
)))

afterEach(async () => {
  __setWindowDimensions({ width: 412, height: 892, scale: 1, fontScale: 1 })
  await i18n.changeLanguage('en')
})

describe('native weekday surface geometry', () => {
  it.each(cases)('keeps $surface in one line at $width in $locale with text scale $scale', async ({ width, locale, scale, surface }) => {
    __setWindowDimensions({ width, height: 1200, scale: 1, fontScale: scale })
    await i18n.changeLanguage(locale)
    const messages = locale === 'en' ? en : ptBR
    const operation = makeCreateHabitsPreview(1)
    const item = operation.items![0]!
    operation.items = [{ ...item, fields: [{ ...item.fields[0]!, field: 'days', newValue: 'Monday', proposedValue: ['Monday'] }] }]
    const dayOptions = Object.entries(messages.dates.daysShort).map(([day, label]) => ({ value: day.charAt(0).toUpperCase() + day.slice(1), label, accessibleLabel: i18n.t(`dates.daysLong.${day}`) }))
    let tree!: ReturnType<typeof renderer.create>
    await renderer.act(() => {
      tree = renderer.create(<View style={{ padding: 16 }}>{surface === 'astra'
        ? <PendingOperationCard pendingOperation={operation} onRevise={vi.fn()} onConfirmExecute={vi.fn()} onPrepareStepUp={vi.fn()} onVerifyStepUp={vi.fn()} />
        : surface === 'form' ? <HabitUnderstanding value="Read" emoji="" days={[]} daily dayOptions={dayOptions} quantity={1} mode="fixed" sentence={i18n.t('onboarding.flow.when.cadence.daily')} consumed={[]} labels={buildHabitUnderstandingLabels(i18n.t.bind(i18n))} onValueChange={vi.fn()} onEmojiSelect={vi.fn()} onToggleDay={vi.fn()} onQuantityChange={vi.fn()} />
          : <OnboardingCreateHabit {...onboarding} proposed={surface === 'proposal'} correcting={surface !== 'proposal'} />}</View>)
    })
    try {
      if (surface === 'astra') await renderer.act(tree.root.findAll(node => String(node.type) === 'Pressable' && node.props.accessibilityLabel === i18n.t('chat.operation.edit'))[0]!.props.onPress as () => void)
      const measured = measureProfileRow(tree.toJSON(), width, scale)
      const names = Object.values(surface === 'onboarding' ? messages.onboarding.flow.when.daysLong : messages.dates.daysLong)
      const controls = measured.controls.filter(control => names.includes(control.accessibilityLabel ?? '') || control.labels.some(label => names.includes(label)))
      if (surface === 'proposal') {
        const labels = Object.values(messages.onboarding.flow.when.days)
        const texts = measured.texts.filter(text => labels.includes(text.label))
        expect(texts).toHaveLength(7)
        const boxes = measured.boxes.filter(box => box.testID.startsWith('weekday-preview-'))
        expect(boxes).toHaveLength(7)
        for (const box of boxes) expect(box.top).toBeCloseTo(boxes[0]!.top, 1)
        for (const text of texts) expect(text.clipped).toBe(false)
      } else {
        expect(controls).toHaveLength(7)
        controls.forEach((control, index) => {
          expect(control.top).toBeCloseTo(controls[0]!.top, 1)
          expect(control.width).toBeGreaterThanOrEqual(24)
          expect(control.height).toBeGreaterThanOrEqual(48)
          expect(control.right).toBeLessThanOrEqual(width - 16 + 0.01)
          if (index) expect(control.left + 0.01).toBeGreaterThanOrEqual(controls[index - 1]!.right)
          const text = measured.texts.find(text => control.labels.includes(text.label)
            && Math.abs(text.left + text.width / 2 - control.left - control.width / 2) < 0.01
            && text.top >= control.top - 0.01 && text.bottom <= control.bottom + 0.01)
          expect(text).toBeDefined()
          expect(text!.width).toBeLessThanOrEqual(control.width + 0.01)
        })
        const row = tree.root.findAll(node => String(node.type) === 'View' && node.props.accessibilityLabel === (surface === 'form' ? i18n.t('habits.form.activeDays') : surface === 'astra' ? i18n.t('chat.operation.field.days') : i18n.t('onboarding.flow.when.daysLabel')))[0]
        expect(row).toBeDefined()
        expect((StyleSheet.flatten(row!.props.style) as ViewStyle).flexWrap).toBe('nowrap')
        const initials = dayOptions.map(day => day.label.charAt(0))
        measured.texts.filter(text => initials.includes(text.label)).forEach(text => expect(text.clipped).toBe(false))
      }
    } finally { await renderer.act(() => tree.unmount()) }
  })
})
