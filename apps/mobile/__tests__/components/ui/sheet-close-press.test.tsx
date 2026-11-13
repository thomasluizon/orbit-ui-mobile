import type { ReactElement, ReactNode } from 'react'
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TrueSheet } from '@lodev09/react-native-true-sheet'
import { motionDurations, motionEasings } from '@orbit/shared/theme'
import { createTokensV2 } from '@/lib/theme'
import { Sheet } from '@/components/ui/sheet'

const motion = vi.hoisted(() => ({ reducedMotion: false }))

vi.unmock('@/components/ui/sheet')
vi.mock('@/lib/motion', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/motion')>(), usePrefersReducedMotion: () => motion.reducedMotion }))
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
vi.mock('@lodev09/react-native-true-sheet', async () => {
  const { Component, Fragment, createElement } = await import('react')
  class TrueSheet extends Component<{ children?: ReactNode; footer?: ReactNode }> {
    present = () => Promise.resolve()
    dismiss = () => Promise.resolve()
    render() { return createElement(Fragment, null, this.props.children, this.props.footer) }
  }
  return { TrueSheet }
})

const EASED = `transform ${motionDurations.press}ms cubic-bezier(${motionEasings.enter.join(',')})`

async function renderSheetHeader() {
  let sheet!: ReactTestRenderer
  await act(async () => { sheet = create(<Sheet open title="Options" onClose={vi.fn()} />); await Promise.resolve() })
  let header!: ReactTestRenderer
  const [nativeSheet] = sheet.root.findAll((node) => node.type === TrueSheet)
  await act(() => { header = create(nativeSheet!.props.header as ReactElement) })
  return { sheet, header }
}

function closeControl(header: ReactTestRenderer): ReactTestInstance {
  const controls = header.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityLabel === 'common.close')
  expect(controls).toHaveLength(1)
  return controls[0]!
}

/** The resolved style of the close control itself: the box that owns its press fill and its 48dp target. */
function controlStyle(control: ReactTestInstance, pressed: boolean) {
  const style = control.props.style as StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>)
  return StyleSheet.flatten(typeof style === 'function' ? style({ pressed }) : style)
}

/** The press scale layer inside the close control, which holds only the glyph. */
function glyphLayer(control: ReactTestInstance) {
  const layers = control.findAll((node) => typeof node.type === 'string' && node.props['data-slot'] === 'press-scale')
  expect(layers, 'a press scale layer holds the close glyph inside the control').toHaveLength(1)
  return StyleSheet.flatten(layers[0]!.props.style as StyleProp<ViewStyle>)
}

describe('sheet close press scale', () => {
  afterEach(() => { motion.reducedMotion = false })

  it('scales the close glyph on press and never the close control that owns its fill and its 48dp target', async () => {
    const { sheet, header } = await renderSheetHeader()
    try {
      expect(glyphLayer(closeControl(header))).toMatchObject({ transform: [{ scale: 1 }], transition: EASED })
      await act(() => (closeControl(header).props.onPressIn as () => void)())
      expect(glyphLayer(closeControl(header))).toMatchObject({ transform: [{ scale: 0.96 }], transition: EASED })
      const pressed = controlStyle(closeControl(header), true)
      expect(pressed.transform).toBeUndefined()
      expect(pressed).toMatchObject({ backgroundColor: createTokensV2().bgHover, borderRadius: 999, overflow: 'hidden' })
      expect(Number(pressed.width)).toBeGreaterThanOrEqual(48)
      expect(Number(pressed.minHeight)).toBeGreaterThanOrEqual(48)
      await act(() => (closeControl(header).props.onPressOut as () => void)())
      expect(glyphLayer(closeControl(header))).toMatchObject({ transform: [{ scale: 1 }], transition: EASED })
    } finally { await act(() => { header.unmount(); sheet.unmount() }) }
  })

  it('keeps the close glyph at unit scale with no transition under reduced motion', async () => {
    motion.reducedMotion = true
    const { sheet, header } = await renderSheetHeader()
    try {
      await act(() => (closeControl(header).props.onPressIn as () => void)())
      expect(glyphLayer(closeControl(header))).toMatchObject({ transform: [{ scale: 1 }], transition: 'none' })
    } finally { await act(() => { header.unmount(); sheet.unmount() }) }
  })
})
