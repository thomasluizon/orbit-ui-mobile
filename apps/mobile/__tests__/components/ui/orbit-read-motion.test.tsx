import type { ReactElement } from 'react'
import React from 'react'
import { AccessibilityInfo } from 'react-native'
import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query'
import { setOrbitMotionEnabled } from '@orbit/shared/utils'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { HabitEmojiSelector } from '@/components/habits/habit-form-fields/habit-emoji-selector'
import { createStyles } from '@/components/habits/habit-form-fields/styles'
import { PillButton } from '@/components/ui/pill-button'
import { OrbitMascot } from '@/components/ui/orbit-mascot'
import { createTokensV2 } from '@/lib/theme'
import { getPrefersReducedMotion, usePrefersReducedMotion } from '@/lib/motion'

vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/components/ui/sheet', () => ({
  Sheet: (props: Record<string, unknown>) => React.createElement('Sheet', props, props.children as React.ReactNode),
  useSheetHost: () => ({ sheetRef: { current: null }, closeSheet: vi.fn() }),
}))
vi.mock('@/components/ui/bottom-sheet-app-text-input', () => ({
  BottomSheetAppTextInput: (props: Record<string, unknown>) => React.createElement('TextInput', props),
}))

const TestRenderer = require('react-test-renderer')

interface TestNode {
  readonly type: unknown
  readonly props: Readonly<Record<string, unknown>>
  findAll(predicate: (node: TestNode) => boolean): TestNode[]
}

interface TestTree {
  readonly root: TestNode
  unmount(): void
}

const tokens = createTokensV2('orange', 'dark')
const styles = createStyles(tokens)
const reduceMotionListeners = new Set<(enabled: boolean) => void>()
const mounted: TestTree[] = []
let settle: { resolve: (emoji: string) => void; reject: (error: Error) => void }

function ReducedMotionProbe() {
  usePrefersReducedMotion()
  return null
}

function render(element: ReactElement): TestTree {
  let tree: TestTree | undefined
  TestRenderer.act(() => { tree = TestRenderer.create(element) })
  mounted.push(tree!)
  return tree!
}

function setReducedMotion(enabled: boolean) {
  TestRenderer.act(() => { for (const listener of [...reduceMotionListeners]) listener(enabled) })
}

async function settled(change: () => void) {
  await TestRenderer.act(async () => {
    change()
    await vi.advanceTimersByTimeAsync(0)
  })
}

function EmojiRead() {
  const suggestion = useMutation({ mutationFn: () => new Promise<string>((resolve, reject) => { settle = { resolve, reject } }) })
  return <HabitEmojiSelector selectedEmoji="" tokens={tokens} styles={styles} onSelect={() => {}} canSuggest onSuggest={() => suggestion.mutate()} isSuggesting={suggestion.isPending} />
}

function mountEmojiRead() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><EmojiRead /></QueryClientProvider>)
}

function action(tree: TestTree) {
  return tree.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === 'habits.form.suggestEmoji')[0]!
}

function press(tree: TestTree) {
  return settled(() => { (action(tree).props.onPress as () => void)() })
}

function faceOf(tree: TestTree) {
  const svg = action(tree).findAll((node) => typeof node.type === 'string' && node.props.testID === 'orbit-mascot')[0]!
  const part = (name: string) => svg.findAll((node) => typeof node.type === 'string' && node.props['data-part'] === name)[0]!.props.transform ?? null
  return { loop: svg.props['data-orbit-loop'], moon: part('moon'), eyes: part('eye') }
}

function skeletonIn(tree: TestTree) {
  return action(tree).findAll((node) => node.props.testID === 'skeleton-face')
}

beforeAll(async () => {
  await getPrefersReducedMotion()
})

beforeEach(() => {
  reduceMotionListeners.clear()
  vi.useFakeTimers()
  const listen = (event: string, listener: unknown) => {
    const reduce = listener as (enabled: boolean) => void
    if (event === 'reduceMotionChanged') reduceMotionListeners.add(reduce)
    return { remove: () => { reduceMotionListeners.delete(reduce) } }
  }
  vi.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(listen as unknown as typeof AccessibilityInfo.addEventListener)
  render(<ReducedMotionProbe />)
})

afterEach(() => {
  setReducedMotion(false)
  TestRenderer.act(() => { for (const tree of mounted.splice(0)) tree.unmount() })
  setOrbitMotionEnabled(undefined)
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('the Orbit of the fill icon button on Android', () => {
  it('rests as the drawn small face before the press', () => {
    const tree = mountEmojiRead()
    expect(faceOf(tree)).toEqual({ loop: 'still', moon: null, eyes: null })
    expect(action(tree).props.accessibilityState).toMatchObject({ busy: false })
  })

  it.each([
    ['ends', () => settle.resolve('🏃')],
    ['fails', () => settle.reject(new Error('read failed'))],
  ])('moves from the press until the read %s, with no skeleton light and the busy state kept', async (_outcome, finish) => {
    const tree = mountEmojiRead()
    await press(tree)
    expect(action(tree).props.accessibilityState).toMatchObject({ busy: true })
    expect(action(tree).props.accessibilityHint).toBe('habits.form.emojiSuggesting')
    expect(skeletonIn(tree)).toHaveLength(0)
    expect(faceOf(tree).loop).toBe('running')
    TestRenderer.act(() => { vi.advanceTimersByTime(200) })
    const moving = faceOf(tree)
    expect(moving.moon).toMatch(/^matrix\(1 0 0 1 /)
    expect(moving.moon).not.toBe('matrix(1 0 0 1 0 0)')
    TestRenderer.act(() => { vi.advanceTimersByTime(200) })
    expect(faceOf(tree).moon).not.toBe(moving.moon)
    await settled(finish)
    expect(action(tree).props.accessibilityState).toMatchObject({ busy: false })
    expect(faceOf(tree)).toEqual({ loop: 'still', moon: null, eyes: null })
  })

  it('keeps the face still with the busy state under reduced motion', async () => {
    setReducedMotion(true)
    const tree = mountEmojiRead()
    await press(tree)
    TestRenderer.act(() => { vi.advanceTimersByTime(400) })
    expect(action(tree).props.accessibilityState).toMatchObject({ busy: true })
    expect(skeletonIn(tree)).toHaveLength(0)
    expect(faceOf(tree)).toEqual({ loop: 'still', moon: null, eyes: null })
  })

  it('keeps the face still when Orbit em movimento is off', async () => {
    setOrbitMotionEnabled(false)
    const tree = mountEmojiRead()
    await press(tree)
    TestRenderer.act(() => { vi.advanceTimersByTime(400) })
    expect(faceOf(tree)).toEqual({ loop: 'still', moon: null, eyes: null })
  })

  it('starts each read at the drawn face', async () => {
    const tree = mountEmojiRead()
    await press(tree)
    TestRenderer.act(() => { vi.advanceTimersByTime(400) })
    await settled(() => settle.resolve('🏃'))
    await press(tree)
    expect(faceOf(tree)).toEqual({ loop: 'running', moon: 'matrix(1 0 0 1 0 0)', eyes: 'matrix(1 0 0 1 0 0)' })
  })
})

describe('a pill that starts an Orbit read on Android', () => {
  it('draws the skeleton light by default and no light when its Orbit carries the busy motion', () => {
    const tree = render(<PillButton variant="ghost" size="sm" loading accessibleName="Plan" leadingIcon={<OrbitMascot size={16} />}>Plan</PillButton>)
    const skeletons = () => tree.root.findAll((node) => node.props.testID === 'skeleton-face')
    expect(skeletons().length).toBeGreaterThan(0)
    TestRenderer.act(() => { (tree as unknown as { update(element: ReactElement): void }).update(<PillButton variant="ghost" size="sm" loading loadingFace="icon" accessibleName="Plan" leadingIcon={<OrbitMascot size={16} reading />}>Plan</PillButton>) })
    expect(skeletons()).toHaveLength(0)
    const mascot = tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'orbit-mascot')[0]!
    expect(mascot.props['data-orbit-loop']).toBe('running')
  })
})
