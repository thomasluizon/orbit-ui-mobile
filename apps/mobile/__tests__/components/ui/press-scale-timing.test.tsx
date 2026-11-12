import type { ReactElement } from 'react'
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { RadioGroup } from '@/components/ui/radio-group'
import { RadioRow } from '@/components/ui/select-check'
import { PickerRow } from '@/components/ui/picker-row'
import { DateField } from '@/components/ui/date-field'
import { YearPicker } from '@/components/ui/year-picker'
import { createTokensV2 } from '@/lib/theme'

const motionOverride = vi.hoisted(() => ({ pressDuration: 151, enter: [0.11, 0.22, 0.33, 0.44] as const, pressScale: 0.91, reducedMotion: false }))

vi.mock('@orbit/shared/theme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@orbit/shared/theme')>()
  return {
    ...actual,
    motionDurations: { ...actual.motionDurations, press: motionOverride.pressDuration },
    motionEasings: { ...actual.motionEasings, enter: motionOverride.enter },
    orbitalMotion: { ...actual.orbitalMotion, press: { ...actual.orbitalMotion.press, scale: motionOverride.pressScale } },
  }
})
vi.mock('@/lib/motion', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/motion')>(), usePrefersReducedMotion: () => motionOverride.reducedMotion }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { weekStartDay: 0 } }) }))
vi.unmock('@/components/ui/date-field')

const EASED = 'transform 151ms cubic-bezier(0.11,0.22,0.33,0.44)'

async function mount(element: ReactElement) {
  let tree!: ReactTestRenderer
  await act(() => { tree = create(element) })
  return tree
}

function pressTarget(tree: ReactTestRenderer, role: string, label?: string) {
  return tree.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole === role && (label === undefined || node.props.accessibilityLabel === label))[0]!
}

async function openDatePicker(tree: ReactTestRenderer) {
  await act(() => (pressTarget(tree, 'button', 'common.selectedDate').props.onPress as () => void)())
}

function scaleLayer(target: ReactTestInstance) {
  let node: ReactTestInstance | null = target.parent
  while (node && node.props['data-slot'] !== 'press-scale') node = node.parent
  if (!node) throw new Error('no press scale layer wraps the press target')
  return StyleSheet.flatten(node.props.style as StyleProp<ViewStyle>)
}

async function pressIn(target: ReactTestInstance) {
  await act(() => (target.props.onPressIn as () => void)())
}

async function pressOut(target: ReactTestInstance) {
  await act(() => (target.props.onPressOut as () => void)())
}

const tokens = createTokensV2('orange', 'dark')

const pressTargets = [
  { name: 'RadioRow', render: (busy: boolean) => <RadioGroup accessibilityLabel="Frequency">{busy ? <RadioRow label="Daily" busy reason="Saving" onSelect={vi.fn()} /> : <RadioRow label="Daily" onSelect={vi.fn()} />}</RadioGroup>, find: (tree: ReactTestRenderer) => Promise.resolve(pressTarget(tree, 'radio')) },
  { name: 'PickerRow', render: (disabled: boolean) => <PickerRow name="Health" selected={false} disabled={disabled} onToggle={vi.fn()} value="" valueStyle={{}} />, find: (tree: ReactTestRenderer) => Promise.resolve(pressTarget(tree, 'button', 'Health')) },
  { name: 'DateField trigger', render: (disabled: boolean) => <DateField value="2025-06-15" disabled={disabled} onChange={vi.fn()} />, find: (tree: ReactTestRenderer) => Promise.resolve(pressTarget(tree, 'button', 'common.selectedDate')) },
  { name: 'DateField day', render: () => <DateField value="2025-06-15" onChange={vi.fn()} />, find: async (tree: ReactTestRenderer) => { await openDatePicker(tree); return pressTarget(tree, 'button', 'June 14, 2025') } },
  { name: 'YearPicker year', render: () => <YearPicker selectedYear={2025} onSelectYear={vi.fn()} tokens={tokens} />, find: (tree: ReactTestRenderer) => Promise.resolve(pressTarget(tree, 'button', '2024')) },
] as const

describe.each(pressTargets)('$name press timing', ({ render, find }) => {
  afterEach(() => { motionOverride.reducedMotion = false })

  it('eases the whole target to the press scale token over the press duration on the enter curve and back', async () => {
    const tree = await mount(render(false))
    try {
      const target = await find(tree)
      expect(scaleLayer(target)).toMatchObject({ transform: [{ scale: 1 }], transition: EASED })
      await pressIn(target)
      expect(scaleLayer(target)).toMatchObject({ transform: [{ scale: 0.91 }], transition: EASED })
      await pressOut(target)
      expect(scaleLayer(target)).toMatchObject({ transform: [{ scale: 1 }], transition: EASED })
    } finally { await act(() => tree.unmount()) }
  })

  it('keeps unit scale and no transition under reduced motion', async () => {
    motionOverride.reducedMotion = true
    const tree = await mount(render(false))
    try {
      const target = await find(tree)
      await pressIn(target)
      expect(scaleLayer(target)).toMatchObject({ transform: [{ scale: 1 }], transition: 'none' })
    } finally { await act(() => tree.unmount()) }
  })

})

const blockableTargets = pressTargets.filter((target) => ['RadioRow', 'PickerRow', 'DateField trigger'].includes(target.name))

describe.each(blockableTargets)('$name blocked press', ({ render, find }) => {
  it('keeps a busy or disabled target at unit scale', async () => {
    const tree = await mount(render(true))
    try {
      const target = await find(tree)
      await pressIn(target)
      expect(scaleLayer(target).transform).toEqual([{ scale: 1 }])
    } finally { await act(() => tree.unmount()) }
  })
})
