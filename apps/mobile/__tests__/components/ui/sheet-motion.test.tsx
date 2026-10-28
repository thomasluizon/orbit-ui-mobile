import React, { createRef } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { Text } from 'react-native'
import { beforeEach, expect, it, vi } from 'vitest'
import { Sheet, type SheetHandle } from '@/components/ui/sheet'
import * as Menu from '@/components/ui/dropdown-menu'
import { PortalHost } from '@rn-primitives/portal'
import * as Primitive from '@rn-primitives/dropdown-menu'
import { TrueSheet } from '@lodev09/react-native-true-sheet'
import { resolveMotionPreset, type MotionScenario } from '@orbit/shared/theme'
import { Keyframe } from '@/test-mocks/react-native-reanimated'

const native = vi.hoisted(() => ({ reduced: false, present: vi.fn(() => Promise.resolve()), dismiss: vi.fn(() => Promise.resolve()), didDismiss: undefined as (() => void) | undefined }))
vi.unmock('@/components/ui/sheet')
vi.mock('@/lib/motion', async (original) => ({
  ...await original<typeof import('@/lib/motion')>(),
  getPrefersReducedMotion: () => Promise.resolve(native.reduced),
  usePrefersReducedMotion: () => native.reduced,
  useResolvedMotionPreset: (scenario: MotionScenario) => resolveMotionPreset(scenario, native.reduced),
}))
vi.mock('@lodev09/react-native-true-sheet', () => ({
  TrueSheet: class extends React.Component<{ children?: React.ReactNode; header?: React.ReactNode; footer?: React.ReactNode; onDidDismiss?: () => void }> {
    present = native.present
    dismiss = native.dismiss
    componentDidMount() { native.didDismiss = this.props.onDidDismiss }
    render() { return <>{this.props.header}{this.props.children}{this.props.footer}</> }
  },
}))

beforeEach(() => { native.present.mockClear(); native.dismiss.mockClear() })

it.each([false, true])('uses native gesture motion with reduced motion set to %s and preserves dismissal ordering', async (reduced) => {
  native.reduced = reduced
  const sheet = createRef<SheetHandle>()
  const exit = vi.fn()
  const closed = vi.fn()
  let tree!: ReactTestRenderer
  await act(() => { tree = create(<Sheet ref={sheet} title="Options" onClose={closed}><Text>Body</Text></Sheet>) })
  expect(native.present).toHaveBeenCalledExactlyOnceWith(0, !reduced)
  await act(() => sheet.current?.requestClose(exit))
  expect(native.dismiss).toHaveBeenCalledExactlyOnceWith(!reduced)
  expect(exit).not.toHaveBeenCalled()
  await act(() => native.didDismiss?.())
  expect(exit).toHaveBeenCalledOnce()
  expect(closed).not.toHaveBeenCalled()
  await act(() => tree.update(<></>))
})

it.each([false, true])('opens the compact menu through the animated native sheet with reduced motion %s', async (reduced) => {
  native.reduced = reduced
  let tree!: ReactTestRenderer
  await act(() => {
    tree = create(<><PortalHost /><Menu.Root><Menu.Trigger accessibilityLabel="Actions" />
      <Menu.Content title="Actions" items={[{ id: 'edit', label: 'Edit' }]} />
    </Menu.Root></>)
  })
  try {
    expect(native.present).not.toHaveBeenCalled()
    const trigger = tree.root.findAll(node => String(node.type) === 'Pressable' && node.props.accessibilityLabel === 'Actions')[0]!
    await act(() => (trigger.props.onPress as () => void)())
    expect(native.present).toHaveBeenCalledExactlyOnceWith(0, !reduced)
    expect(tree.root.findAll(node => node.type === TrueSheet)[0]!.props.dimmed).toBe(true)
    expect(tree.root.findAll(node => String(node.type) === 'Pressable' && node.props.accessibilityRole === 'menuitem')).toHaveLength(1)
  } finally { await act(() => tree.update(<></>)) }
})

it.each([false, true])('uses shared anchored menu exit geometry with reduced motion %s', async (reduced) => {
  native.reduced = reduced
  let tree!: ReactTestRenderer
  await act(() => {
    tree = create(<><PortalHost /><Menu.Root open><Menu.Trigger accessibilityLabel="Actions" />
      <Menu.Content presentation="anchored" title="Actions" items={[{ id: 'edit', label: 'Edit' }]} />
    </Menu.Root></>)
  })
  try {
    const panel = tree.root.findAll(node => node.type === Primitive.Content)[0]!
    const exit = panel.props.exiting as Keyframe
    const preset = resolveMotionPreset('menu', reduced)
    expect(exit.durationMs).toBe(preset.exitDuration)
    expect(exit.definitions[0]).toMatchObject({ opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] })
    expect(exit.definitions[100]).toMatchObject({ opacity: 0, transform: [{ translateY: -preset.shift }, { scale: preset.scaleFrom }] })
    if (reduced) {
      for (const frame of Object.values(exit.definitions)) {
        expect(frame.transform).toEqual([{ translateY: expect.closeTo(0) }, { scale: 1 }])
      }
    } else expect(preset.scaleFrom).toBeLessThan(1)
  } finally { await act(() => tree.update(<></>)) }
})
