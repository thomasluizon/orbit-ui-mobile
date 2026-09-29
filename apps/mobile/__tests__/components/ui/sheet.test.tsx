import React from 'react'
import { StyleSheet, Text } from 'react-native'
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
import { useUIStore } from '@/stores/ui-store'
import { useAppToastStore } from '@/stores/app-toast-store'
import { Toast } from '@/components/ui/app-toast'
import { habitFormSchema } from '@orbit/shared/validation'
import { CreateHabitModal } from '@/components/habits/create-habit-modal'
import { PillButton } from '@/components/ui/pill-button'

vi.unmock('@/components/ui/sheet')

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 24, left: 0 }),
}))

const habitMocks = vi.hoisted(() => ({ validateAll: vi.fn(), createHabit: vi.fn() }))

vi.mock('react-hook-form', () => ({
  useWatch: ({ name }: { name: string }) => name === 'title' ? 'Test Habit' : name === 'scheduledReminders' ? [] : undefined,
}))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/use-habits', () => ({
  useCreateHabit: () => ({ mutateAsync: habitMocks.createHabit, isPending: false }),
  useCreateSubHabit: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/hooks/use-habit-form', () => ({ useHabitForm: () => ({
  form: { control: {}, reset: vi.fn(), setValue: vi.fn(), getValues: vi.fn(), formState: { isDirty: false } },
  validateAll: habitMocks.validateAll,
  setGeneral: vi.fn(),
}) }))
vi.mock('@/hooks/use-tag-selection', () => ({ useTagSelection: () => ({ selectedTagIds: [], resetTags: vi.fn() }) }))
vi.mock('@/hooks/use-habit-suggestion', () => ({ useHabitSuggestion: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('@/hooks/use-config', () => ({ useConfig: () => ({ config: { features: { 'habits.subHabits': { enabled: true, planRequirement: 'Pro' } } } }) }))
vi.mock('@/hooks/use-profile', () => ({ useHasProAccess: () => true }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))
vi.mock('@/hooks/use-dismiss-guard', () => ({ useDismissGuard: () => ({ canDismiss: true, requestDismiss: vi.fn(), showDiscardDialog: false }) }))
vi.mock('@/components/ui/discard-changes-sheet', () => ({ DiscardChangesSheet: () => null }))
vi.mock('@/components/habits/habit-form-fields', () => ({ HabitFormFields: () => <Text>Habit fields</Text> }))
vi.mock('@/components/habits/create-habit-modal/sub-habit-editor', () => ({ SubHabitEditor: () => null }))

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
    footer?: React.ReactNode
    onDidDismiss?: () => void
  }> {
    present = present
    dismiss = dismiss
    componentDidMount() {
      didDismiss.register(this.props.onDidDismiss)
    }
    render() {
      return <>{this.props.children}{this.props.footer}</>
    }
  },
}))

const TestRenderer = require('react-test-renderer')

describe('Sheet (mobile)', () => {
  it('labels an untitled header for accessibility', async () => {
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<Sheet open accessibleTitle="Reschedule with AI" />)
      await Promise.resolve()
    })
    const header = tree!.root.findByType(TrueSheet).props.header
    expect(header.props.accessibilityLabel).toBe('Reschedule with AI')
    expect(header.props.children[0].props.accessible).toBe(true)
    expect(header.props.children[0].props.accessibilityLabel).toBe('Reschedule with AI')
  })
  beforeEach(() => {
    useUIStore.setState({ openOverlayIds: [] })
    useAppToastStore.setState({ currentToast: null, queue: [] })
    present.mockReset()
    present.mockResolvedValue(undefined)
    dismiss.mockReset()
    dismiss.mockResolvedValue(undefined)
    didDismiss.reset()
    __resetTestHostConfig()
  })

  it('registers its overlay slot until native dismissal completes', async () => {
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<Sheet open><Text>Body</Text></Sheet>)
      await Promise.resolve()
    })
    expect(useUIStore.getState().openOverlayIds).toHaveLength(1)
    TestRenderer.act(() => didDismiss.complete())
    expect(useUIStore.getState().openOverlayIds).toHaveLength(0)
    TestRenderer.act(() => tree!.unmount())
  })

  it('keeps create-habit validation feedback in its real native sheet', async () => {
    const invalidTitle = habitFormSchema.safeParse({ title: '' })
    if (invalidTitle.success) throw new Error('Expected an invalid habit title')
    const issue = invalidTitle.error.issues[0]
    if (!issue) throw new Error('Expected a title validation issue')
    habitMocks.validateAll.mockReturnValue(issue.message)
    const onClose = vi.fn()
    let tree: ReturnType<typeof TestRenderer.create>

    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<CreateHabitModal open onClose={onClose} />)
      await Promise.resolve()
    })

    const createButton = tree!.root.findAllByType(PillButton).at(-1)
    if (!createButton) throw new Error('Expected the create action')
    await TestRenderer.act(async () => {
      createButton.props.onClick()
      await Promise.resolve()
    })

    expect(habitMocks.validateAll).toHaveBeenCalledOnce()
    expect(useAppToastStore.getState().currentToast?.toast.message).toBe(issue.message)
    expect(tree!.root.findByType(TrueSheet).props.footer).toBeDefined()
    expect(tree!.root.findAllByType(Toast)).toHaveLength(1)
    expect(habitMocks.createHabit).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    TestRenderer.act(() => tree!.unmount())
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
    expect(nativeSheet.props.scrollable).toBe(false)
    expect(nativeSheet.props.maxContentHeight).toBeCloseTo(892 * 0.85 - 24)
    expect(nativeSheet.props.maxContentWidth).toBe(640)
    expect(nativeSheet.props.insetAdjustment).toBe('automatic')
  })

  it('lets a virtualized child own the body scroll container', async () => {
    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<Sheet open virtualizedBody><Text>Virtual list</Text></Sheet>)
      await Promise.resolve()
    })

    expect(tree.root.findAllByType('ScrollView')).toHaveLength(0)
    expect(tree.root.findByProps({ testID: 'sheet-virtualized-body' })).toBeDefined()
    expect(tree.root.findByType(TrueSheet).props.scrollable).toBe(false)
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
        <Sheet open title="Title" actions={<Text>Save</Text>}><Text>Body</Text></Sheet>,
      )
      await Promise.resolve()
    })
    const nativeSheet = tree.root.findByType(TrueSheet)
    expect(nativeSheet.props.footer).toBeDefined()
    const bodyScroller = tree.root.findAllByType('ScrollView')[0]
    const bodyStyle = (StyleSheet.flatten(bodyScroller.props.style) ?? {}) as { flex?: number; flexGrow?: number }
    const contentStyle = StyleSheet.flatten(bodyScroller.props.contentContainerStyle) as { flex?: number; flexGrow?: number }
    expect(bodyStyle.flex).toBeUndefined()
    expect(bodyStyle.flexGrow).toBeUndefined()
    expect(contentStyle.flex).toBeUndefined()
    expect(contentStyle.flexGrow).toBeUndefined()
    const actions = nativeSheet.props.footer.props.children[1]
    expect(StyleSheet.flatten(nativeSheet.props.footer.props.style)).toMatchObject({ paddingBottom: 24 })
    expect(StyleSheet.flatten(actions.props.style)).toMatchObject({ padding: 16 })
    expect(nativeSheet.props.footer.props.onLayout).toBeTypeOf('function')
    await TestRenderer.act(() => {
      nativeSheet.props.footer.props.onLayout({ nativeEvent: { layout: { height: 112 } } })
    })
    expect(tree.root.findByProps({ testID: 'sheet-footer-space' }).props.style.height).toBe(112 - 24)
    await TestRenderer.act(() => {
      nativeSheet.props.header.props.onLayout({ nativeEvent: { layout: { height: 56 } } })
    })
    const measuredScroller = tree.root.findAllByType('ScrollView')[0]
    expect(measuredScroller.props.style.maxHeight).toBeCloseTo(892 * 0.85 - 24 - 56 - 24)
  })

  it('clears the bottom inset for a sheet toast that has no actions', async () => {
    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<Sheet open title="Title"><Text>Body</Text></Sheet>)
      await Promise.resolve()
    })
    await TestRenderer.act(async () => {
      useAppToastStore.getState().showError('Could not save')
      await Promise.resolve()
    })

    const footer = tree.root.findByType(TrueSheet).props.footer
    expect(footer).toBeDefined()
    expect(StyleSheet.flatten(footer.props.style)).toMatchObject({ paddingBottom: 24 })
    TestRenderer.act(() => tree.unmount())
  })

  it('keeps a short sheet at its content height with no stretched body', async () => {
    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <Sheet open title="Update title" actions={<Text>Open the store</Text>}>
          <Text>Two short lines of update copy.</Text>
        </Sheet>,
      )
      await Promise.resolve()
    })

    const bodyScroller = tree.root.findAllByType('ScrollView')[0]
    const bodyStyle = (StyleSheet.flatten(bodyScroller.props.style) ?? {}) as { flex?: number; flexGrow?: number; height?: number }
    const contentStyle = StyleSheet.flatten(bodyScroller.props.contentContainerStyle) as { flex?: number; flexGrow?: number; height?: number }
    expect(bodyStyle.flex).toBeUndefined()
    expect(bodyStyle.flexGrow).toBeUndefined()
    expect(bodyStyle.height).toBeUndefined()
    expect(contentStyle.flex).toBeUndefined()
    expect(contentStyle.flexGrow).toBeUndefined()
    expect(contentStyle.height).toBeUndefined()
    expect(tree.root.findByProps({ testID: 'sheet-footer-space' }).props.style.height).toBe(0)
    expect(tree.root.findByType(TrueSheet).props.detents).toEqual(['auto'])
  })
})

/**
 * Keep a presented sheet mounted until native dismissal completes so
 * `onDidDismiss` fires. Sheet owns the close path: `onClose` or a scheduled
 * action runs after dismissal, and the host does not flip open state directly.
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

  it('runs the rejection handler instead of the exit action when dismissal rejects', async () => {
    dismiss.mockRejectedValueOnce(new Error('VIEW_NOT_FOUND'))
    const navigate = vi.fn()
    const onRejected = vi.fn()
    let closeSheet: ((exitAction?: () => void, onRejected?: () => void) => void) | null = null

    function Host() {
      const host = useSheetHost()
      closeSheet = host.closeSheet
      return (
        <Sheet ref={host.sheetRef} open onClose={vi.fn()}>
          <Text>Body</Text>
        </Sheet>
      )
    }

    await TestRenderer.act(async () => {
      TestRenderer.create(<Host />)
      await Promise.resolve()
    })

    await TestRenderer.act(async () => {
      closeSheet!(navigate, onRejected)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(onRejected).toHaveBeenCalledTimes(1)
    expect(navigate).not.toHaveBeenCalled()
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
