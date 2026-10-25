import React, { useEffect, useState } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { AccessibilityInfo, Text, TextInput, View } from 'react-native'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TrueSheet } from '@lodev09/react-native-true-sheet'
import { NativeDialog } from '@/components/ui/native-dialog'
import { OverlayHost } from '@/components/ui/overlay-host'
import { Sheet } from '@/components/ui/sheet'
import { useUIStore } from '@/stores/ui-store'
import { focusHost, withFocusProvenance } from '@/__tests__/support/focus-provenance'

const sheetCalls = vi.hoisted(() => ({ present: vi.fn(), dismiss: vi.fn() }))

vi.unmock('@/components/ui/sheet')
vi.mock('@lodev09/react-native-true-sheet', () => ({
  TrueSheet: class extends React.Component<{
    children: React.ReactNode; header?: React.ReactNode; footer?: React.ReactNode
    onDidDismiss?: () => void
  }, { presented: boolean }> {
    state = { presented: false }
    present = vi.fn(() => { sheetCalls.present(); this.setState({ presented: true }); return Promise.resolve() })
    dismiss = vi.fn(() => {
      sheetCalls.dismiss()
      this.setState({ presented: false })
      this.props.onDidDismiss?.()
      return Promise.resolve()
    })
    render() { return this.state.presented ? <>{this.props.header}{this.props.children}{this.props.footer}</> : null }
  },
}))

let tree: ReactTestRenderer
beforeEach(() => {
  useUIStore.setState({ openOverlayIds: [] })
  vi.clearAllMocks()
  vi.useFakeTimers()
})
afterEach(async () => {
  await act(() => tree.update(<></>))
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function windowNode() {
  return tree.root.findAll((node) => String(node.type) === 'Modal')[0]!
}

it('routes Back only to the topmost dialog and uses its current close callback', async () => {
  const first = vi.fn()
  const second = vi.fn()
  const revised = vi.fn()
  const render = (topOpen: boolean, close = second) => <OverlayHost>
    <NativeDialog open title="First" onOpenChange={first}><Text>First content</Text></NativeDialog>
    <NativeDialog open={topOpen} title="Second" onOpenChange={close}><Text>Second content</Text></NativeDialog>
  </OverlayHost>
  await act(() => { tree = create(render(true)) })
  await act(() => tree.update(render(true, revised)))
  await act(() => (windowNode().props.onRequestClose as () => void)())
  expect(revised).toHaveBeenCalledWith(false)
  expect(second).not.toHaveBeenCalled()
  expect(first).not.toHaveBeenCalled()
  const lower = tree.root.findAll((node) => String(node.type) === 'Pressable' && node.props.importantForAccessibility === 'no-hide-descendants')
  expect(lower).toHaveLength(1)
  expect(lower[0]!.props.pointerEvents).toBe('none')
  await act(() => tree.update(render(false)))
  await act(() => (windowNode().props.onRequestClose as () => void)())
  expect(first).toHaveBeenCalledWith(false)
})

function Draft({ unmounted }: Readonly<{ unmounted: () => void }>) {
  const [value, setValue] = useState('Saved draft')
  useEffect(() => unmounted, [unmounted])
  return <TextInput accessibilityLabel="Draft" value={value} onChangeText={setValue} />
}

it('keeps a presented TrueSheet and its edited subtree mounted through a dialog opening and closing', async () => {
  const unmounted = vi.fn()
  const sheetRef = React.createRef<import('@/components/ui/sheet').SheetHandle>()
  const render = (open: boolean) => <OverlayHost>
    <Sheet ref={sheetRef} title="Editor" onClose={vi.fn()}><Draft unmounted={unmounted} /></Sheet>
    <NativeDialog open={open} title="Interruption" onOpenChange={vi.fn()}><Text>Blocking content</Text></NativeDialog>
  </OverlayHost>
  await act(() => { tree = create(render(false)) })
  const nativeSheet = tree.root.findAll((node) => node.type === TrueSheet)[0]!
  await act(() => (tree.root.findAll((node) => node.type === TextInput)[0]!.props.onChangeText as (value: string) => void)('Edited draft'))
  for (const open of [true, false]) {
    await act(() => tree.update(render(open)))
    expect(windowNode().props.visible).toBe(open)
    expect(tree.root.findAll((node) => node.type === TrueSheet)[0]!).toBe(nativeSheet)
    expect(tree.root.findAll((node) => node.type === TextInput)[0]!.props.value).toBe('Edited draft')
    expect(unmounted).not.toHaveBeenCalled()
  }
  expect(sheetCalls.present).toHaveBeenCalledOnce()
  expect(sheetCalls.dismiss).not.toHaveBeenCalled()
  await act(() => { sheetRef.current!.requestClose() })
  expect(tree.root.findAll((node) => node.type === TextInput)).toHaveLength(0)
  expect(unmounted).toHaveBeenCalledOnce()
})

it('isolates background touch and accessibility, focuses on presentation and restores the trigger after closing', async () => {
  const focus = vi.spyOn(AccessibilityInfo, 'setAccessibilityFocus')
  const render = (open: boolean) => withFocusProvenance(<OverlayHost>
    <View testID="trigger" />
    <NativeDialog open={open} title="Blocking content" onOpenChange={vi.fn()}><Text>Content</Text></NativeDialog>
  </OverlayHost>)
  await act(() => { tree = create(render(false)) })
  const trigger = tree.root.findAll((node) => String(node.type) === 'View' && node.props.testID === 'trigger')[0]!
  await act(() => focusHost(tree, trigger))
  await act(() => tree.update(render(true)))
  const dialog = tree.root.findAll((node) => String(node.type) === 'View' && node.props.role === 'dialog')[0]!
  expect(dialog.props.accessibilityLabel).toBe('Blocking content')
  const background = tree.root.findAll((node) => String(node.type) === 'View' && node.props.pointerEvents === 'none'
    && node.findAll((child) => String(child.type) === 'View' && child.props.testID === 'trigger').length > 0)[0]!
  expect(background.props).toMatchObject({ pointerEvents: 'none', importantForAccessibility: 'no-hide-descendants', accessibilityElementsHidden: true })
  await act(() => (windowNode().props.onShow as () => void)())
  expect(focus).toHaveBeenLastCalledWith(dialog.props.__nativeTag)
  await act(async () => { await vi.advanceTimersByTimeAsync(50) })
  await act(() => tree.update(render(false)))
  expect(background.props).toMatchObject({ pointerEvents: 'auto', importantForAccessibility: 'auto', accessibilityElementsHidden: false })
  await act(async () => { await vi.advanceTimersByTimeAsync(50) })
  expect(focus).toHaveBeenLastCalledWith(trigger.props.__nativeTag)
})
