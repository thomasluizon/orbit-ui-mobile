import React, { createRef } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { Text } from 'react-native'
import { beforeEach, expect, it, vi } from 'vitest'
import { Sheet, type SheetHandle } from '@/components/ui/sheet'

const native = vi.hoisted(() => ({ reduced: false, present: vi.fn(() => Promise.resolve()), dismiss: vi.fn(() => Promise.resolve()), didDismiss: undefined as (() => void) | undefined }))
vi.unmock('@/components/ui/sheet')
vi.mock('@/lib/motion', async (original) => ({
  ...await original<typeof import('@/lib/motion')>(),
  getPrefersReducedMotion: () => Promise.resolve(native.reduced),
  usePrefersReducedMotion: () => native.reduced,
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
