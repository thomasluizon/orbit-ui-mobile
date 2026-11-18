import type { ReactElement } from 'react'
import React from 'react'
import { AccessibilityInfo, StyleSheet } from 'react-native'
import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query'
import { setOrbitMotionEnabled } from '@orbit/shared/utils'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { HabitEmojiSelector } from '@/components/habits/habit-form-fields/habit-emoji-selector'
import { createStyles } from '@/components/habits/habit-form-fields/styles'
import { PillButton } from '@/components/ui/pill-button'
import { OrbitMascot } from '@/components/ui/orbit-mascot'
import { ProactiveAction } from '@/components/chat/proactive-action'
import { createMockProactiveItem } from '@orbit/shared/__tests__/factories'
import { createTokensV2 } from '@/lib/theme'
import { getPrefersReducedMotion, usePrefersReducedMotion } from '@/lib/motion'

vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }) }))
vi.mock('@/hooks/use-proactive-action', () => ({ useProactiveAction: () => ({ reason: null, waiting: true, allowance: 10, act: vi.fn(), aiMessagesPeriod: 'day' }) }))
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

  it.each([
    ['under reduced motion', () => setReducedMotion(true)],
    ['when Orbit em movimento is off', () => setOrbitMotionEnabled(false)],
  ])('keeps the face still and shows the still skeleton face with the busy state %s', async (_condition, stopMotion) => {
    stopMotion()
    const tree = mountEmojiRead()
    await press(tree)
    TestRenderer.act(() => { vi.advanceTimersByTime(400) })
    expect(action(tree).props.accessibilityState).toMatchObject({ busy: true })
    expect(skeletonIn(tree).length).toBeGreaterThan(0)
    expect(faceOf(tree)).toEqual({ loop: 'still', moon: null, eyes: null })
    await settled(() => settle.resolve('🏃'))
    expect(skeletonIn(tree)).toHaveLength(0)
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

describe('a pill whose Orbit cannot move on Android', () => {
  it.each([
    ['under reduced motion', () => setReducedMotion(true)],
    ['when Orbit em movimento is off', () => setOrbitMotionEnabled(false)],
  ])('keeps the still skeleton face for loadingFace icon %s', (_condition, stopMotion) => {
    stopMotion()
    const tree = render(<PillButton variant="ghost" size="sm" loading loadingFace="icon" accessibleName="Plan" leadingIcon={<OrbitMascot size={16} reading />}>Plan</PillButton>)
    expect(tree.root.findAll((node) => node.props.testID === 'skeleton-face').length).toBeGreaterThan(0)
    const mascot = tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'orbit-mascot')[0]!
    expect(mascot.props['data-orbit-loop']).toBe('still')
  })
})

describe('the waiting proactive action on Android', () => {
  function proactive() {
    const tree = render(<ProactiveAction item={createMockProactiveItem()} acted={false} isOnline onSend={vi.fn()} />)
    const button = tree.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole === 'button')[0]!
    const style = StyleSheet.flatten(typeof button.props.style === 'function' ? (button.props.style as (state: { pressed: boolean }) => unknown)({ pressed: false }) : button.props.style) as { backgroundColor?: string }
    const mascot = button.findAll((node) => typeof node.type === 'string' && node.props.testID === 'orbit-mascot')[0]!
    return { button, style, loop: mascot.props['data-orbit-loop'], skeletons: button.findAll((node) => node.props.testID === 'skeleton-face') }
  }

  it('moves its Orbit and draws no skeleton face while the Orbit may move', () => {
    const { style, loop, skeletons } = proactive()
    expect(skeletons).toHaveLength(0)
    expect(style.backgroundColor).toBe(tokens.bgWell)
    expect(loop).toBe('running')
  })

  it.each([
    ['under reduced motion', () => setReducedMotion(true)],
    ['when Orbit em movimento is off', () => setOrbitMotionEnabled(false)],
  ])('keeps the still skeleton face on a clear face %s', (_condition, stopMotion) => {
    stopMotion()
    const { button, style, loop, skeletons } = proactive()
    expect(button.props.accessibilityState).toMatchObject({ busy: true })
    expect(skeletons.length).toBeGreaterThan(0)
    expect(style.backgroundColor).toBe('transparent')
    expect(loop).toBe('still')
  })
})
