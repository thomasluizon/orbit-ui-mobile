import React from 'react'
import { Text } from 'react-native'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  getOnboardingReminderPreviewTime,
  ONBOARDING_STARTERS,
} from '@orbit/shared/utils'
import { OnboardingCreateHabit } from '@/components/onboarding/onboarding-create-habit'
import { i18n } from '@/lib/i18n'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({ t: i18n.t.bind(i18n), i18n }),
}))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }) }))
vi.mock('@/components/ui/time-field', () => ({ TimeField: () => React.createElement('TimeField') }))

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')

function prop<T>(node: ReturnType<typeof TestRenderer.create>['root'], key: string): T {
  return Reflect.get(node.props, key) as T
}

function flattenText(node: unknown): string {
  if (node == null) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flattenText).join('')
  if (typeof node === 'object' && 'props' in node) return flattenText((node as { props: { children?: unknown } }).props.children)
  if (typeof node === 'object' && 'children' in node) return flattenText((node as { children?: unknown }).children)
  return ''
}

const schedule = { frequencyUnit: 'Week' as const, frequencyQuantity: 3, intervalWeeks: 2, days: [], isGeneral: false, isFlexible: true, dueTime: '' }
const base = { title: 'Walk outside', emoji: '🚶', days: [], dueTime: '', schedule, proposed: true, correcting: false, atLimit: false, allowance: 5, onCorrect: vi.fn(), onToggleDay: vi.fn(), onTimeChange: vi.fn(), onModeChange: vi.fn(), onFrequencyUnitChange: vi.fn(), onQuantityChange: vi.fn(), onIntervalWeeksChange: vi.fn() }

describe('OnboardingCreateHabit data', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en')
  })

  it('exposes the four sentence starters', () => {
    expect(ONBOARDING_STARTERS).toEqual(['water', 'walk', 'read', 'tidy'])
  })

  it('previews reminders fifteen minutes early', () => {
    expect(getOnboardingReminderPreviewTime('18:00')).toBe('17:45')
  })

  it('shows and corrects a flexible cadence without weekdays', async () => {
    const onModeChange = vi.fn()
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<OnboardingCreateHabit {...base} onModeChange={onModeChange} />)
    })

    const renderedText = tree.root.findAll((node) => (node.type as unknown) === Text).map((node) => flattenText(node.props.children)).join('')
    expect(renderedText).toContain('3 times a week, any day')
    expect(renderedText).toContain('Walk outside')
    expect(renderedText).toContain('Leave empty for any time of day')
    const proposal = tree.root.findAll((node) => node.props.accessibilityLabel === 'Correct schedule' && typeof node.props.onPress === 'function').at(0)
    expect(proposal).toBeDefined()
    expect(prop<string>(proposal!, 'accessibilityHint')).toContain('Walk outside. 3 times a week, any day. Time: Any time')
    await TestRenderer.act(() => prop<() => void>(proposal!, 'onPress')())
    await TestRenderer.act(() => tree.update(<OnboardingCreateHabit {...base} correcting onModeChange={onModeChange} />))
    const fixed = tree.root.findAll((node) => node.props.testID === 'segment-fixed-unselected-enabled').at(0)
    expect(fixed).toBeDefined()
    await TestRenderer.act(() => prop<() => void>(fixed!, 'onPress')())

    expect(onModeChange).toHaveBeenCalledWith('fixed')
    expect(tree.root.findAll((node) => node.props.accessibilityLabel === 'More times' && typeof node.props.onPress === 'function').length).toBeGreaterThan(0)
  })

  it.each([
    [{ ...schedule, frequencyUnit: null, frequencyQuantity: null, intervalWeeks: 1, isFlexible: false }, 'once'],
    [{ ...schedule, frequencyUnit: 'Week' as const, frequencyQuantity: 2, intervalWeeks: 1, isFlexible: false }, 'every 2 weeks'],
    [{ ...schedule, frequencyUnit: 'Year' as const, frequencyQuantity: 3, intervalWeeks: 1, isFlexible: false }, 'every 3 years'],
  ])('shows the saved cadence as %s', async (savedSchedule, sentence) => {
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<OnboardingCreateHabit {...base} schedule={savedSchedule} correcting={false} />)
    })
    const renderedText = tree.root.findAll((node) => (node.type as unknown) === Text).map((node) => flattenText(node.props.children)).join('')
    expect(renderedText).toContain(sentence)
  })

  it('gives every weekday chip its full localized name', async () => {
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<OnboardingCreateHabit {...base} proposed={false} correcting schedule={{ ...schedule, frequencyUnit: 'Day', frequencyQuantity: 1, intervalWeeks: 1, days: ['Monday'], isFlexible: false }} />)
    })
    const labels = new Set(
      tree.root
        .findAll((node) => prop<{ selected?: boolean } | undefined>(node, 'accessibilityState')?.selected !== undefined)
        .map((node) => node.props.accessibilityLabel),
    )
    expect(labels).toContain('Sunday')
    expect(labels).toContain('Saturday')
    expect(labels).not.toContain('S')
  })

  it('lets a recurring proposal change its unit and quantity', async () => {
    const onFrequencyUnitChange = vi.fn()
    const onQuantityChange = vi.fn()
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => {
      tree = TestRenderer.create(
        <OnboardingCreateHabit
          {...base}
          correcting
          schedule={{ ...schedule, frequencyUnit: 'Week', frequencyQuantity: 2, isFlexible: false }}
          onFrequencyUnitChange={onFrequencyUnitChange}
          onQuantityChange={onQuantityChange}
        />,
      )
    })

    const months = tree.root.findAll((node) => node.props.testID === 'segment-Month-unselected-enabled').at(0)
    const more = tree.root.findAll((node) => node.props.accessibilityLabel === 'Repeat later' && typeof node.props.onPress === 'function').at(0)
    expect(months).toBeDefined()
    expect(more).toBeDefined()
    await TestRenderer.act(() => prop<() => void>(months!, 'onPress')())
    await TestRenderer.act(() => prop<() => void>(more!, 'onPress')())
    expect(onFrequencyUnitChange).toHaveBeenCalledWith('Month')
    expect(onQuantityChange).toHaveBeenCalledWith(3)
  })

  it('shows a one-time proposal as the selected correction mode', async () => {
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => {
      tree = TestRenderer.create(
        <OnboardingCreateHabit
          {...base}
          correcting
          schedule={{ ...schedule, frequencyUnit: null, frequencyQuantity: null, isFlexible: false }}
        />,
      )
    })
    expect(tree.root.findAll((node) => node.props.testID === 'segment-oneTime-selected-enabled')).not.toHaveLength(0)
  })
})
