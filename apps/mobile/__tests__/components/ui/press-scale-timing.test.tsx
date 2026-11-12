import type { ReactElement } from 'react'
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { RadioGroup } from '@/components/ui/radio-group'
import { RadioRow } from '@/components/ui/select-check'
import { PickerRow } from '@/components/ui/picker-row'

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
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

const EASED = 'transform 151ms cubic-bezier(0.11,0.22,0.33,0.44)'

async function mount(element: ReactElement) {
  let tree!: ReactTestRenderer
  await act(() => { tree = create(element) })
  return tree
}

function pressTarget(tree: ReactTestRenderer, role: string) {
  return tree.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole === role)[0]!
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

const rows = [
  { name: 'RadioRow', role: 'radio', render: (busy = false) => <RadioGroup accessibilityLabel="Frequency">{busy ? <RadioRow label="Daily" busy reason="Saving" onSelect={vi.fn()} /> : <RadioRow label="Daily" onSelect={vi.fn()} />}</RadioGroup> },
  { name: 'PickerRow', role: 'button', render: (disabled = false) => <PickerRow name="Health" selected={false} disabled={disabled} onToggle={vi.fn()} value="" valueStyle={{}} /> },
] as const

describe.each(rows)('$name press timing', ({ role, render }) => {
  afterEach(() => { motionOverride.reducedMotion = false })

  it('eases the whole row to the press scale token over the press duration on the enter curve and back', async () => {
    const tree = await mount(render())
    try {
      const target = pressTarget(tree, role)
      expect(scaleLayer(target)).toMatchObject({ transform: [{ scale: 1 }], transition: EASED })
      await pressIn(target)
      expect(scaleLayer(target)).toMatchObject({ transform: [{ scale: 0.91 }], transition: EASED })
      await pressOut(target)
      expect(scaleLayer(target)).toMatchObject({ transform: [{ scale: 1 }], transition: EASED })
    } finally { await act(() => tree.unmount()) }
  })

  it('keeps unit scale and no transition under reduced motion', async () => {
    motionOverride.reducedMotion = true
    const tree = await mount(render())
    try {
      const target = pressTarget(tree, role)
      await pressIn(target)
      expect(scaleLayer(target)).toMatchObject({ transform: [{ scale: 1 }], transition: 'none' })
    } finally { await act(() => tree.unmount()) }
  })

  it('keeps a blocked row at unit scale', async () => {
    const tree = await mount(render(true))
    try {
      const target = pressTarget(tree, role)
      await pressIn(target)
      expect(scaleLayer(target).transform).toEqual([{ scale: 1 }])
    } finally { await act(() => tree.unmount()) }
  })
})
