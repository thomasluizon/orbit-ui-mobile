import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { IconButton } from '@/components/ui/icon-button'
import { PillButton } from '@/components/ui/pill-button'
import { Copy } from '@/components/ui/icons'
import { createTokensV2 } from '@/lib/theme'

const motionOverride = vi.hoisted(() => ({ press: 173, enter: [0.11, 0.22, 0.33, 0.44] as const }))
const motionState = vi.hoisted(() => ({ reduced: false }))

vi.mock('@orbit/shared/theme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@orbit/shared/theme')>()
  return {
    ...actual,
    motionDurations: { ...actual.motionDurations, press: motionOverride.press },
    motionEasings: { ...actual.motionEasings, enter: motionOverride.enter },
  }
})
vi.mock('@/lib/motion', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/motion')>()), usePrefersReducedMotion: () => motionState.reduced }))

const pressTransition = 'transform 173ms cubic-bezier(0.11,0.22,0.33,0.44)'
let tree: ReactTestRenderer

async function render(element: React.ReactElement) {
  await act(() => { tree = create(element) })
}

function host(): ReactTestInstance {
  const hosts = tree.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole === 'button')
  expect(hosts).toHaveLength(1)
  return hosts[0]!
}

function paint(): ViewStyle {
  const style = host().props.style as StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>)
  return StyleSheet.flatten(typeof style === 'function' ? style({ pressed: true }) : style)
}

async function pressIn() {
  await act(() => { (host().props.onPressIn as (() => void) | undefined)?.() })
}

async function pressOut() {
  await act(() => { (host().props.onPressOut as (() => void) | undefined)?.() })
}

afterEach(async () => {
  motionState.reduced = false
  await act(() => { tree.unmount() })
})

describe('PillButton press motion', () => {
  it('eases the 0.96 press scale on the shared press duration and enter curve, and returns through the same transition', async () => {
    await render(<PillButton onClick={vi.fn()}>Continue</PillButton>)
    expect(paint()).toMatchObject({ transform: [{ scale: 1 }], transition: pressTransition })
    await pressIn()
    expect(paint()).toMatchObject({ backgroundColor: createTokensV2('purple', 'dark').primaryPressed, transform: [{ scale: 0.96 }], transition: pressTransition })
    await pressOut()
    expect(paint()).toMatchObject({ transform: [{ scale: 1 }], transition: pressTransition })
  })

  it('keeps the press fill and drops the animated scale under reduced motion', async () => {
    motionState.reduced = true
    await render(<PillButton variant="ghost" onClick={vi.fn()}>Cancel</PillButton>)
    await pressIn()
    expect(paint()).toMatchObject({ backgroundColor: createTokensV2('purple', 'dark').bgHover, transform: [{ scale: 1 }], transition: 'none' })
  })

  it.each([
    ['disabled', <PillButton key="disabled" disabled onClick={vi.fn()}>Continue</PillButton>],
    ['loading', <PillButton key="loading" loading onClick={vi.fn()}>Saving</PillButton>],
    ['loading and focusable', <PillButton key="focusable" loading focusableWhenLoading onClick={vi.fn()}>Saving</PillButton>],
  ])('does not scale while %s', async (_state, element) => {
    await render(element)
    await pressIn()
    expect(paint()).toMatchObject({ transform: [{ scale: 1 }] })
  })

  it('gives the icon action the same eased press', async () => {
    await render(<IconButton label="Copy" onClick={vi.fn()}><Copy size={20} /></IconButton>)
    await pressIn()
    expect(paint()).toMatchObject({ transform: [{ scale: 0.96 }], transition: pressTransition })
  })
})
