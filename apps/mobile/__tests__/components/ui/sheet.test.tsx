import React from 'react'
import { Text } from 'react-native'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TrueSheet } from '@lodev09/react-native-true-sheet'
import { Sheet, useSheetHost, type SheetHandle } from '@/components/ui/sheet'

vi.unmock('@/components/ui/sheet')

const { present, dismiss, didDismiss } = vi.hoisted(() => {
  const handlers: { current: (() => void) | null } = { current: null }
  return {
    present: vi.fn(() => Promise.resolve()),
    dismiss: vi.fn(() => Promise.resolve()),
    didDismiss: {
      register(handler: (() => void) | undefined) {
        handlers.current = handler ?? null
      },
      /** Stands in for the native dismissal completing. */
      complete() {
        handlers.current?.()
      },
    },
  }
})

vi.mock('@lodev09/react-native-true-sheet', () => ({
  TrueSheet: class TrueSheet extends React.Component<{
    children?: React.ReactNode
    onDidDismiss?: () => void
  }> {
    present = present
    dismiss = dismiss
    render() {
      didDismiss.register(this.props.onDidDismiss)
      return this.props.children ?? null
    }
  },
}))

const TestRenderer = require('react-test-renderer')

describe('Sheet (mobile)', () => {
  beforeEach(() => {
    present.mockClear()
    dismiss.mockClear()
  })

  it('presents on mount and gives the body exactly one scroll container', async () => {
    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<Sheet open><Text>Body</Text></Sheet>)
      await Promise.resolve()
    })

    expect(present).toHaveBeenCalledTimes(1)
    expect(tree.root.findAllByType('ScrollView')).toHaveLength(1)
    const nativeSheet = tree.root.findByType(TrueSheet)
    expect(nativeSheet.props.scrollable).toBeUndefined()
  })

  it('keeps actions in the native fixed footer', async () => {
    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <Sheet open actions={<Text>Save</Text>}><Text>Body</Text></Sheet>,
      )
      await Promise.resolve()
    })
    const nativeSheet = tree.root.findByType(TrueSheet)
    expect(nativeSheet.props.footer).toBeDefined()
  })
})

/**
 * Unmounting a presented TrueSheet wedges every later Android modal, so the
 * host may never flip its open state itself: `onClose` has to arrive from the
 * completed native dismissal, and a scheduled action has to run after it.
 */
describe('Sheet close path (mobile)', () => {
  beforeEach(() => {
    present.mockClear()
    dismiss.mockClear()
  })

  it('reports close only once the native dismissal completes', async () => {
    const onClose = vi.fn()
    let handle: SheetHandle | null = null

    function Host() {
      const { sheetRef, closeSheet } = useSheetHost()
      handle = { requestClose: closeSheet }
      return (
        <Sheet ref={sheetRef} open onClose={onClose}>
          <Text>Body</Text>
        </Sheet>
      )
    }

    await TestRenderer.act(async () => {
      TestRenderer.create(<Host />)
      await Promise.resolve()
    })

    await TestRenderer.act(async () => {
      handle!.requestClose()
      await Promise.resolve()
    })

    expect(dismiss).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()

    await TestRenderer.act(async () => {
      didDismiss.complete()
      await Promise.resolve()
    })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('runs a scheduled exit action after the dismissal, in place of onClose', async () => {
    const onClose = vi.fn()
    const navigate = vi.fn()
    let handle: SheetHandle | null = null

    function Host() {
      const { sheetRef, closeSheet } = useSheetHost()
      handle = { requestClose: closeSheet }
      return (
        <Sheet ref={sheetRef} open onClose={onClose}>
          <Text>Body</Text>
        </Sheet>
      )
    }

    await TestRenderer.act(async () => {
      TestRenderer.create(<Host />)
      await Promise.resolve()
    })

    await TestRenderer.act(async () => {
      handle!.requestClose(navigate)
      await Promise.resolve()
    })

    expect(dismiss).toHaveBeenCalledTimes(1)
    expect(navigate).not.toHaveBeenCalled()

    await TestRenderer.act(async () => {
      didDismiss.complete()
      await Promise.resolve()
    })

    expect(navigate).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('dismisses natively when the close control is pressed, never straight to onClose', async () => {
    const onClose = vi.fn()
    let tree: any

    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <Sheet open onClose={onClose}>
          <Text>Body</Text>
        </Sheet>,
      )
      await Promise.resolve()
    })

    const nativeSheet = tree.root.findByType(TrueSheet)
    const closeControl = nativeSheet.props.header.props.children[1]

    await TestRenderer.act(async () => {
      closeControl.props.onPress()
      await Promise.resolve()
    })

    expect(dismiss).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })
})
