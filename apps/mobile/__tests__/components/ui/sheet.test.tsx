import { PersonalText } from '@/components/ui/personal-text'
import { expectPressFill } from '../../support/press-feedback'
import { createTokensV2 } from '@/lib/theme'
import React from 'react'
import { StyleSheet, Text } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TrueSheet } from '@lodev09/react-native-true-sheet'
import {
  __emitKeyboardEvent,
  __setWindowDimensions,
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
import { KeyboardAwareSheetScrollView } from '@/components/ui/keyboard-aware-scroll-view'
import { HabitRow } from '@/components/habits/habit-row'
import { createMockHabit, createMockProfile } from '@orbit/shared/__tests__/factories'
import { apiKeySchema } from '@orbit/shared/types/api-key'
import { ProfileApiKeys } from '@/components/profile/profile-api-keys'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { measureProfileRow } from '../../support/profile-row-geometry'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { DescriptionViewer } from '@/components/habits/description-viewer'

vi.unmock('@/components/ui/sheet')
vi.mock('@react-native-clipboard/clipboard', () => ({ default: { setString: vi.fn() } }))
vi.mock('@/components/ui/markdown', () => ({ Markdown: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }))

const safeArea = vi.hoisted(() => ({ bottom: 24 }))
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: safeArea.bottom, left: 0 }),
}))

const habitMocks = vi.hoisted(() => ({ validateAll: vi.fn(), createHabit: vi.fn() }))

vi.mock('react-hook-form', () => ({
  useWatch: ({ name }: { name: string }) => name === 'title' ? 'Test Habit' : name === 'scheduledReminders' ? [] : undefined,
}))
vi.mock('expo-router', () => ({ useIsFocused: () => true, useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/use-habits', () => ({
  useCreateHabit: () => ({ mutateAsync: habitMocks.createHabit, isPending: false }),
  useCreateSubHabit: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/hooks/use-habit-form', () => ({ useHabitForm: () => ({
  form: { control: {}, reset: vi.fn(), setValue: vi.fn(), getValues: vi.fn(), trigger: vi.fn().mockResolvedValue(true), formState: { isDirty: false } },
  validateAll: habitMocks.validateAll,
  clearBackendErrors: vi.fn(),
  setGeneral: vi.fn(),
}) }))
vi.mock('@/hooks/use-tag-selection', () => ({ useTagSelection: () => ({ selectedTagIds: [], resetTags: vi.fn() }) }))
vi.mock('@/hooks/use-habit-suggestion', () => ({ useHabitSuggestion: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('@/hooks/use-config', () => ({ useConfig: () => ({ config: { features: { 'habits.subHabits': { enabled: true, planRequirement: 'Pro' } } } }) }))
vi.mock('@/hooks/use-profile', () => ({ useHasProAccess: () => true, useProfile: () => ({ profile: null }) }))
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

const namedKey = apiKeySchema.parse({
  id: 'long-key', name: 'Personal integration '.repeat(10).slice(0, 200), keyPrefix: 'orbit_sk_prefix',
  scopes: [], isReadOnly: false, expiresAtUtc: null, createdAtUtc: '2026-10-01T00:00:00Z',
  lastUsedAtUtc: null, isRevoked: false,
})
const keyActions = vi.hoisted(() => ({ revoke: vi.fn() }))
vi.mock('@/app/advanced-api-keys', () => ({
  useApiKeyManagement: () => {
    const [revokingKeyId, setRevokingKeyId] = React.useState<string | null>(null)
    return {
      apiKeysQuery: { isLoading: false, error: null, refetch: vi.fn() }, apiKeys: [namedKey],
      canCreateKey: true, createGrantAvailable: true, createKeyError: null,
      clearCreateKeyError: vi.fn(), clearRevokeKeyError: vi.fn(), revokingKeyId, setRevokingKeyId,
      revokeKeyMutation: { mutate: keyActions.revoke, isPending: false }, handleCreateKey: vi.fn(),
    }
  },
}))

describe('Sheet (mobile)', () => {
  it('routes hardware Back while a controlled sheet is closing without completing its exit', async () => {
    const onClose = vi.fn()
    const onBackPress = vi.fn()
    const sheetRef = React.createRef<SheetHandle>()
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<Sheet ref={sheetRef} title="Discard changes" onClose={onClose} onBackPress={onBackPress} />)
    })
    await TestRenderer.act(async () => { sheetRef.current!.requestClose(); await Promise.resolve() })
    expect(dismiss).toHaveBeenCalledOnce()
    const nativeSheet = tree.root.findByType(TrueSheet)
    expect(nativeSheet.props.dismissible).toBe(false)
    TestRenderer.act(() => { expect(nativeSheet.props.onBackPress()).toBe(true) })
    expect(onBackPress).toHaveBeenCalledOnce()
    expect(onClose).not.toHaveBeenCalled()
    TestRenderer.act(() => didDismiss.complete())
    expect(onClose).toHaveBeenCalledOnce()
    TestRenderer.act(() => tree.unmount())
  })

  it.each([1, 2])('pads the typed title press fill at font scale %i', async (fontScale) => {
    __setWindowDimensions({ width: 320, height: 900, scale: 1, fontScale })
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<Sheet title="Leitura" titleMode="typed" onClose={vi.fn()} />)
    })
    const heading = tree.root.findByType(TrueSheet).props.header.props.children[0]
    for (const pressed of [false, true]) {
      const style = StyleSheet.flatten(heading.props.style({ pressed }))
      expect(style.paddingVertical).toBeGreaterThanOrEqual(8)
      expect(style.paddingHorizontal).toBeGreaterThanOrEqual(8)
      expect(style.minHeight).toBe(48)
    }
    expect(heading.props.children.type.name).toBe('PersonalText')
    await TestRenderer.act(() => tree.unmount())
  })

  it.each(['typed', 'label'] as const)('wraps label titles and opens limited %s text with one press', async (titleMode) => {
    __setWindowDimensions({ width: 320, height: 900, scale: 1, fontScale: 2 })
    const title = 'Ler um capítulo inteiro do livro de história antes de dormir e anotar as ideias para conversar com meus amigos amanhã cedo.'
    function Draft() {
      const [value, setValue] = React.useState('Keep this')
      return <Text onPress={() => setValue('Edited draft')}>{value}</Text>
    }
    const onClose = vi.fn()
    const scrollTo = vi.fn()
    __setScrollToImpl(scrollTo)
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<Sheet title={title} titleMode={titleMode} onClose={onClose}><Draft /></Sheet>)
    })
    await TestRenderer.act(() => tree.root.findByType(Draft).findByType(Text).props.onPress())
    const header = tree.root.findByType(TrueSheet).props.header
    const heading = header.props.children[0]
    const titleText = heading.type === Text ? heading : heading.props.children
    expect(titleText.props.numberOfLines).toBeUndefined()
    if (titleMode === 'label') {
      expect(heading.props.accessibilityRole).toBe('header')
      expect(StyleSheet.flatten(heading.props.style)).toMatchObject({ minHeight: 48, textAlignVertical: 'center' })
      expect(StyleSheet.flatten(header.props.style).alignItems).toBe('flex-start')
    }
    if (titleMode === 'typed') {
      expect(titleText.type.name).toBe('PersonalText')
      expect(StyleSheet.flatten(heading.props.style({ pressed: false })).minHeight).toBe(48)
      expect(heading.props.accessibilityRole).toBe('button')
      const scroller = tree.root.findAllByProps({ testID: 'sheet-body-scroll' }).find((node: { type: unknown }) => String(node.type) === 'ScrollView')
      await TestRenderer.act(() => scroller.props.onScroll({ nativeEvent: { contentOffset: { y: 120 } } }))
      await TestRenderer.act(() => heading.props.onPress())
      expect(scrollTo).toHaveBeenLastCalledWith({ y: 0, animated: false })
      const sheets = tree.root.findAllByType(TrueSheet)
      expect(sheets).toHaveLength(1)
      const fullTitle = sheets[0].findAllByType(Text).find((node: { props: { children?: string; importantForAccessibility?: string } }) => node.props.children === title && node.props.importantForAccessibility !== 'no-hide-descendants')
      expect(fullTitle.props.numberOfLines).toBe(1)
      expect(sheets[0].findAllByType(PersonalText).some((node: { props: { expanded?: boolean } }) => node.props.expanded)).toBe(true)
      expect(fullTitle.props.selectable).toBe(true)
      expect(tree.root.findByType(TrueSheet).props.header.props.children[0].props.accessibilityState.expanded).toBe(true)
      await TestRenderer.act(() => tree.root.findByType(TrueSheet).props.header.props.children[0].props.onPress())
      expect(tree.root.findAllByType(Text).filter((node: { props: { children?: string } }) => node.props.children === title)).toHaveLength(0)
      expect(scrollTo).toHaveBeenLastCalledWith({ y: 120, animated: false })
      expect(tree.root.findByType(Draft).findByType(Text).props.children).toBe('Edited draft')
      expect(onClose).not.toHaveBeenCalled()
    }
    await TestRenderer.act(() => tree.unmount())
  })

  it('discloses a long personal API key name in the real revoke confirmation', async () => {
    keyActions.revoke.mockClear()
    const queryClient = new QueryClient()
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => { tree = TestRenderer.create(<QueryClientProvider client={queryClient}><ProfileApiKeys profile={createMockProfile({ hasProAccess: true })} unlocked /></QueryClientProvider>) })
    try {
      const revoke = tree.root.findAllByType('Pressable').find(
        (node: { props: { accessibilityLabel?: string } }) => node.props.accessibilityLabel?.startsWith('profile.apiKeys.revokeNamed'),
      )
      await TestRenderer.act(() => revoke.props.onPress())
      const title = tree.root.findByType(ConfirmSheet).props.title
      expect(title).toContain(namedKey.name)
      const heading = tree.root.findByType(TrueSheet).props.header.props.children[0]
      expect(heading.props.accessibilityRole).toBe('button')
      expect(heading.props.children.type.name).toBe('PersonalText')
      await TestRenderer.act(() => heading.props.onPress())
      expect(tree.root.findAllByType('Text').some(
        (node: { props: { children?: string; selectable?: boolean } }) => node.props.selectable && node.props.children === title,
      )).toBe(true)
      const confirm = tree.root.findAllByType(PillButton).find(
        (node: { props: { children?: string } }) => node.props.children === 'orbitMcp.revoke',
      )
      await TestRenderer.act(() => confirm.props.onClick())
      expect(keyActions.revoke).not.toHaveBeenCalled()
      await TestRenderer.act(() => didDismiss.complete())
      expect(keyActions.revoke).toHaveBeenCalledExactlyOnceWith(namedKey.id)
    } finally { await TestRenderer.act(() => tree.unmount()); queryClient.clear() }
  })

  it('keeps every long habit menu action reachable at 320 by 915 and 200% text', async () => {
    __setWindowDimensions({ width: 320, height: 915, scale: 1, fontScale: 2 })
    const title = 'Read a chapter before bed '.repeat(8).slice(0, 200)
    expect(title).toHaveLength(200)
    const actions = { onAddSubHabit: vi.fn(), onMoveParent: vi.fn(), onSkip: vi.fn(),
      onReschedule: vi.fn(), onEdit: vi.fn(), onDuplicate: vi.fn(),
      onEnterSelectMode: vi.fn(), onDrillInto: vi.fn(), onDelete: vi.fn() }
    const labels = ['habits.actions.addSubHabit', 'habits.actions.moveUnder', 'habits.actions.skip',
      'habits.actions.reschedule', 'common.edit', 'habits.actions.duplicate',
      'common.select', 'habits.actions.openSubHabits', 'habits.actions.delete']
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitRow habit={createMockHabit({ title, isOverdue: true, hasSubHabits: true })}
        hasChildren hasProAccess actions={actions} />)
    })
    try {
      for (const [index, label] of labels.entries()) {
        await TestRenderer.act(() => tree.root.findAllByType('Pressable').find(
          (node: { props: { accessibilityLabel?: string } }) => node.props.accessibilityLabel === 'habits.actions.more',
        ).props.onPress())
        const nativeSheet = tree.root.findByType(TrueSheet)
        const header = nativeSheet.props.header
        let headerTree!: ReturnType<typeof TestRenderer.create>
        await TestRenderer.act(() => { headerTree = TestRenderer.create(header) })
        const measured = measureProfileRow(headerTree.toJSON(), 320, 2)
        const headerStyle = StyleSheet.flatten(header.props.style)
        await TestRenderer.act(() => {
          header.props.onLayout({ nativeEvent: { layout: {
            height: measured.height + headerStyle.paddingTop + headerStyle.paddingBottom,
          } } })
          headerTree.unmount()
        })
        const body = tree.root.findAllByType('ScrollView').find(
          (node: { props: { testID?: string } }) => node.props.testID === 'sheet-body-scroll',
        )
        expect(StyleSheet.flatten(body.props.style).maxHeight).toBeGreaterThan(0)
        const heading = tree.root.findByType(TrueSheet).props.header.props.children[0]
        expect(heading.props.children.type.name).toBe('PersonalText')
        expect(heading.props.children.type.name).toBe('PersonalText')
        const items = body.findAllByType('Pressable').filter(
          (node: { props: { accessibilityRole?: string } }) => node.props.accessibilityRole === 'menuitem',
        )
        expect(items.map((item: { findAllByType: (type: string) => { props: { children?: string } }[] }) =>
          item.findAllByType('Text')[0]!.props.children)).toEqual(labels)
        expect(items.every((item: { props: { disabled?: boolean } }) => !item.props.disabled)).toBe(true)
        await TestRenderer.act(() => items[index].props.onPress())
        expect(Object.values(actions)[index]).not.toHaveBeenCalled()
        await TestRenderer.act(() => didDismiss.complete())
        expect(Object.values(actions)[index], label).toHaveBeenCalledOnce()
      }
    } finally {
      await TestRenderer.act(() => tree.unmount())
    }
  })

  it.each([412, 840])('aligns the native sheet to the phone column at %ipx', async (width) => {
    __setWindowDimensions({ width, height: 900, scale: 1, fontScale: 1 })
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<Sheet open title="Title" onClose={vi.fn()}><Text>Content</Text></Sheet>)
      await Promise.resolve()
    })
    expect(tree.root.findByType(TrueSheet).props).toMatchObject({ maxContentWidth: 740, anchor: 'center' })
    await TestRenderer.act(() => tree.unmount())
  })

  it('gives a short description one body inset without a second caller inset', async () => {
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<DescriptionViewer open title="Description" description="One short line." onClose={vi.fn()} />)
      await Promise.resolve()
    })
    const scroller = tree!.root.findByProps({ testID: 'sheet-body-scroll' })
    const content = scroller.props.children[1]
    const callerStyle = StyleSheet.flatten(content.props.style) ?? {}
    expect(callerStyle.paddingBottom ?? callerStyle.paddingVertical ?? callerStyle.padding ?? 0).toBe(0)
    expect(callerStyle.paddingHorizontal ?? callerStyle.padding ?? 0).toBe(0)
    expect(StyleSheet.flatten(scroller.props.contentContainerStyle)).toMatchObject({ paddingHorizontal: 24, paddingBottom: 24 })
    TestRenderer.act(() => tree!.unmount())
  })
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
    safeArea.bottom = 24
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
    expect(nativeSheet.props.maxContentWidth).toBe(740)
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

  it.each([0, 76])('reveals a focused lower input above a %i-high footer through the sheet body scroller', async (footerHeight) => {
    vi.useFakeTimers()
    const scrollTo = vi.fn()
    __setMeasureInWindowImpl((callback) => callback(0, 620, 100, 54))
    __setScrollToImpl(scrollTo)
    let tree: ReturnType<typeof TestRenderer.create>

    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <Sheet open actions={footerHeight ? <PillButton onClick={vi.fn()}>Save</PillButton> : undefined}>
          <BottomSheetAppTextInput testID="lower-input" value="Lower field" />
        </Sheet>,
      )
      await Promise.resolve()
    })

    if (footerHeight) {
      TestRenderer.act(() => {
        tree!.root.findByType(TrueSheet).props.footer.props.onLayout({ nativeEvent: { layout: { height: footerHeight } } })
      })
    }

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

    expect(scrollTo).toHaveBeenCalledWith({ y: 298 + footerHeight, animated: true })
  })

  it.each([0, 24])('reserves the measured footer above a %i bottom inset and uses its full height for the keyboard', async (bottomInset) => {
    safeArea.bottom = bottomInset
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<Sheet open title="T" actions={<PillButton onClick={vi.fn()}>Save</PillButton>}><Text>Body</Text></Sheet>)
      await Promise.resolve()
    })
    const footer = tree!.root.findByType(TrueSheet).props.footer
    TestRenderer.act(() => footer.props.onLayout({ nativeEvent: { layout: { height: 76 } } }))
    const scroller = tree!.root.findByType(KeyboardAwareSheetScrollView)
    expect(scroller.findByProps({ testID: 'sheet-footer-space' }).props.style.height).toBe(76 - bottomInset)
    expect(scroller.props.children.at(-1).props.testID).toBe('sheet-footer-space')
    expect(scroller.props.keyboardVerticalOffset).toBe(76)
    TestRenderer.act(() => footer.props.onLayout({ nativeEvent: { layout: { height: 112 } } }))
    expect(tree!.root.findByType(KeyboardAwareSheetScrollView).props.keyboardVerticalOffset).toBe(112)
    expect(tree!.root.findByProps({ testID: 'sheet-footer-space' }).props.style.height).toBe(112 - bottomInset)
    TestRenderer.act(() => tree!.unmount())
  })

  it('paints the measured native footer with the sheet surface', async () => {
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<Sheet open actions={<PillButton onClick={vi.fn()}>Save</PillButton>}><Text>Body</Text></Sheet>)
      await Promise.resolve()
    })
    expect(StyleSheet.flatten(tree!.root.findByType(TrueSheet).props.footer.props.style)).toMatchObject({ backgroundColor: createTokensV2().bgSheet })
    TestRenderer.act(() => tree!.unmount())
  })

  it('clears the footer reserve and keyboard offset when actions leave the sheet', async () => {
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<Sheet open actions={<Text>Save</Text>}><Text>Body</Text></Sheet>)
      await Promise.resolve()
    })
    TestRenderer.act(() => tree!.root.findByType(TrueSheet).props.footer.props.onLayout({ nativeEvent: { layout: { height: 76 } } }))
    TestRenderer.act(() => tree!.update(<Sheet open><Text>Body</Text></Sheet>))
    expect(tree!.root.findByType(TrueSheet).props.footer).toBeUndefined()
    expect(tree!.root.findByProps({ testID: 'sheet-footer-space' }).props.style.height).toBe(0)
    expect(tree!.root.findByType(KeyboardAwareSheetScrollView).props.keyboardVerticalOffset).toBeUndefined()
    TestRenderer.act(() => tree!.unmount())
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
    expect(nativeSheet.props.header).toBeDefined()
    const close = nativeSheet.props.header.props.children.flat().find((child: { props?: { accessibilityLabel?: string } } | null) => child?.props?.accessibilityLabel === 'common.close')
    expect(close).toBeDefined()
    TestRenderer.act(() => close.props.onPress())
    expect(onAttemptDismiss).toHaveBeenCalledTimes(2)
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
    expect(StyleSheet.flatten(actions.props.style)).toMatchObject({ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24 })
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

  it.each([false, true])('separates footer actions with space only with virtualizedBody=%s', async (virtualizedBody) => {
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <Sheet open virtualizedBody={virtualizedBody} actions={<Text>Save</Text>}>
          <Text>Body</Text>
        </Sheet>,
      )
      await Promise.resolve()
    })
    try {
      const footer = tree!.root.findByType(TrueSheet).props.footer
      const actions = footer.props.children[1]
      const footerStyle = StyleSheet.flatten(footer.props.style)
      const actionStyle = StyleSheet.flatten(actions.props.style)
      const body = tree!.root.findByProps({ testID: virtualizedBody ? 'sheet-virtualized-body' : 'sheet-body-scroll' })
      const bodyStyle = StyleSheet.flatten(virtualizedBody ? body.props.style : body.props.contentContainerStyle)
      expect(bodyStyle.paddingBottom).toBe(virtualizedBody ? 0 : 24)
      expect(actionStyle.paddingTop).toBe(16)
      expect(actionStyle.borderTopWidth ?? actionStyle.borderWidth ?? 0).toBe(0)
      expect(footerStyle.borderTopWidth ?? footerStyle.borderWidth ?? 0).toBe(0)
    } finally {
      TestRenderer.act(() => tree!.unmount())
    }
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

it('fills the real sheet header close target with the neutral interaction token', async () => {
  let tree: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(async () => { tree = TestRenderer.create(<Sheet open title="Options" onClose={vi.fn()} />); await Promise.resolve() })
  let headerTree: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { headerTree = TestRenderer.create(tree!.root.findByType(TrueSheet).props.header) })
  expectPressFill(headerTree, 'common.close', createTokensV2().bgHover, 999)
  const close = tree!.root.findByType(TrueSheet).props.header.props.children.at(-1)
  for (const pressed of [false, true]) {
    const shape = StyleSheet.flatten(close.props.style({ pressed }))
    expect(shape.width).toBeGreaterThanOrEqual(48)
    expect(shape.minHeight).toBeGreaterThanOrEqual(48)
    expect(shape.transform).toBeUndefined()
  }
})

it('keeps the sheet dismiss target at least 48 dp', async () => {
  let tree!: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(<Sheet open title="Options" onClose={vi.fn()}><Text>Content</Text></Sheet>)
    await Promise.resolve()
  })
  let headerTree!: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { headerTree = TestRenderer.create(tree.root.findByType(TrueSheet).props.header) })
  const close = headerTree.root.findAll((node: { type: unknown; props: Record<string, unknown> }) => typeof node.type === 'string' && node.props.accessibilityLabel === 'common.close')[0]
  const bounds = StyleSheet.flatten(typeof close.props.style === 'function' ? close.props.style({ pressed: false }) : close.props.style)
  expect(bounds.width).toBeGreaterThanOrEqual(48)
  expect(bounds.minHeight ?? bounds.height).toBeGreaterThanOrEqual(48)
  TestRenderer.act(() => { headerTree.unmount(); tree.unmount() })
})
