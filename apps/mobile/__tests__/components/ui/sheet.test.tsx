import React from 'react'
import { Text } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TrueSheet } from '@lodev09/react-native-true-sheet'
import {
  __emitKeyboardEvent,
  __resetTestHostConfig,
  __setMeasureInWindowImpl,
  __setScrollToImpl,
} from '../../../test-mocks/react-native'
import { BottomSheetAppTextInput } from '@/components/ui/bottom-sheet-app-text-input'
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
      reset() {
        handlers.current = null
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
    present.mockReset()
    present.mockResolvedValue(undefined)
    dismiss.mockReset()
    dismiss.mockResolvedValue(undefined)
    didDismiss.reset()
    __resetTestHostConfig()
  })

  afterEach(() => {
    __resetTestHostConfig()
    vi.useRealTimers()
  })

  it('presents on mount and gives the body exactly one scroll container', async () => {
    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<Sheet open><Text>Body</Text></Sheet>)
      await Promise.resolve()
    })

    expect(present).toHaveBeenCalledTimes(1)
    expect(tree.root.findAllByType('ScrollView')).toHaveLength(1)
    const bodyScroller = tree.root
      .findAllByProps({ testID: 'sheet-body-scroll' })
      .find((node: { props: { nestedScrollEnabled?: boolean } }) => node.props.nestedScrollEnabled)
    expect(bodyScroller).toBeDefined()
    const nativeSheet = tree.root.findByType(TrueSheet)
    expect(nativeSheet.props.scrollable).toBe(true)
    expect(nativeSheet.props.maxContentHeight).toBe(892 * 0.85 - 24)
  })

  it('lets a virtualized child own the body scroll container', async () => {
    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<Sheet open virtualizedBody><Text>Virtual list</Text></Sheet>)
      await Promise.resolve()
    })

    expect(tree.root.findAllByType('ScrollView')).toHaveLength(0)
    expect(tree.root.findByProps({ testID: 'sheet-virtualized-body' })).toBeDefined()
    expect(tree.root.findByType(TrueSheet).props.scrollable).toBe(true)
  })

  it('reveals a focused lower input through the sheet body scroller', async () => {
    vi.useFakeTimers()
    const scrollTo = vi.fn()
    __setMeasureInWindowImpl((callback) => callback(0, 620, 100, 54))
    __setScrollToImpl(scrollTo)
    let tree: ReturnType<typeof TestRenderer.create>

    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <Sheet open>
          <BottomSheetAppTextInput testID="lower-input" value="Lower field" />
        </Sheet>,
      )
      await Promise.resolve()
    })

    TestRenderer.act(() => {
      const lowerInput = tree!.root
        .findAllByProps({ testID: 'lower-input' })
        .find((node: { props: { onFocus?: (event: unknown) => void } }) =>
          typeof node.props.onFocus === 'function',
        )
      lowerInput!.props.onFocus({})
      __emitKeyboardEvent('keyboardDidShow', { endCoordinates: { screenY: 400 } })
      vi.advanceTimersByTime(60)
    })

    expect(scrollTo).toHaveBeenCalledWith({ y: 298, animated: true })
  })

  it('routes a dirty Back attempt to its guard and consumes the navigation event', async () => {
    const onAttemptDismiss = vi.fn()
    let tree: ReturnType<typeof TestRenderer.create>

    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <Sheet open onAttemptDismiss={onAttemptDismiss}>
          <Text>Dirty form</Text>
        </Sheet>,
      )
      await Promise.resolve()
    })

    const nativeSheet = tree!.root.findByType(TrueSheet)
    expect(nativeSheet.props.dismissible).toBe(false)
    expect(nativeSheet.props.onBackPress()).toBe(true)
    expect(onAttemptDismiss).toHaveBeenCalledTimes(1)
    expect(dismiss).not.toHaveBeenCalled()
  })

  it.each(['pending operation', 'one-time key reveal'])(
    'consumes Back during a blocked %s without closing or reaching navigation',
    async (body) => {
      let tree: ReturnType<typeof TestRenderer.create>

      await TestRenderer.act(async () => {
        tree = TestRenderer.create(
          <Sheet open>
            <Text>{body}</Text>
          </Sheet>,
        )
        await Promise.resolve()
      })

      const nativeSheet = tree!.root.findByType(TrueSheet)
      expect(nativeSheet.props.onBackPress()).toBe(true)
      expect(dismiss).not.toHaveBeenCalled()
    },
  )

  it('completes the host close path when native presentation rejects', async () => {
    present.mockRejectedValueOnce(new Error('present failed'))
    const onClose = vi.fn()

    await TestRenderer.act(async () => {
      TestRenderer.create(
        <Sheet open onClose={onClose}>
          <Text>Body</Text>
        </Sheet>,
      )
      await Promise.resolve()
    })

    expect(onClose).toHaveBeenCalledTimes(1)
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
    present.mockReset()
    present.mockResolvedValue(undefined)
    dismiss.mockReset()
    dismiss.mockResolvedValue(undefined)
    didDismiss.reset()
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

  it('keeps the host mounted and clears a pending exit action when dismissal rejects', async () => {
    dismiss.mockRejectedValueOnce(new Error('dismiss failed'))
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

    expect(onClose).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()

    await TestRenderer.act(async () => {
      handle!.requestClose()
      await Promise.resolve()
      didDismiss.complete()
    })

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(navigate).not.toHaveBeenCalled()
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
    const closeControl = nativeSheet.props.header.props.children.at(-1)

    await TestRenderer.act(async () => {
      closeControl.props.onPress()
      await Promise.resolve()
    })

    expect(dismiss).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })
})
