import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StyleSheet, type ViewStyle } from 'react-native'
import { selectMessageOperationBlocks } from '@orbit/shared/chat'
import { breakdownSubHabits, goalListCardFixture, makeAgentOperationResult, makeBulkCreateResponse, makeHeldHabitMessage } from '@orbit/shared/test-support/chat-fixtures'
import { makeBulkCreateExecutionResponse, makeCreateHabitsPreview } from '@orbit/shared/test-support/pending-operation-preview-fixtures'
import { PendingOperationCard } from '@/components/chat/pending-operation-card'
import { BreakdownSuggestion } from '@/components/chat/breakdown-suggestion'
import { OperationOutcomes } from '@/components/chat/operation-outcomes'
import { GoalListCard } from '@/components/chat/goal-list-card'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { Button } from '@/components/ui/pill-button'
import { i18n } from '@/lib/i18n'
import { __focusHost, __getFocusedNativeTag, __resetTestHostConfig, __setTouchMode, __setWindowDimensions } from '@/test-mocks/react-native'
import { measureProfileRow } from '../../support/profile-row-geometry'

vi.unmock('react-i18next')
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
const bulkCreate = vi.fn()
vi.mock('@/hooks/use-habits', () => ({ useBulkCreateHabits: () => ({ mutateAsync: bulkCreate, isPending: false }) }))
vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayTime: (value: string) => value }) }))
afterEach(__resetTestHostConfig)

type Host = Parameters<typeof measureProfileRow>[0]

function itemRows(host: Host | Host[]): Host[] {
  if (Array.isArray(host)) return host.flatMap(itemRows)
  if (host.props.testID?.startsWith('block-frame-item-')) return [host]
  return (host.children ?? []).flatMap(child => typeof child === 'string' ? [] : itemRows(child))
}

type Tree = ReactTestRenderer & { toJSON: () => Host | Host[] }

function expectEdges(tree: Tree, width: number) {
  const rows = itemRows(tree.toJSON())
  expect(rows.length).toBeGreaterThan(0)
  for (const row of rows) {
    const geometry = measureProfileRow(row, Math.min(width - 32, 740) - 50, 1)
    const control = geometry.controls.find(control => control.accessibilityLabel && geometry.texts.some(text => text.label === control.accessibilityLabel))!
    expect(control).toBeDefined()
    const name = geometry.texts.find(text => text.label === control.accessibilityLabel)!
    const words = row.children![0] as Host
    const meta = words.children?.find(child => typeof child !== 'string' && child.type === 'Text') as Host | undefined
    const metadata = meta ? geometry.texts.find(text => text.label === meta.children?.filter(child => typeof child === 'string').join('')) : undefined
    const rowPadding = Number(StyleSheet.flatten(typeof row.props.style === 'function' ? row.props.style({ pressed: false }) : row.props.style).padding)
    expect(name.left).toBeCloseTo(metadata?.left ?? rowPadding, 1)
    expect(name.left - control.left).toBe(8)
    expect(control.height).toBeGreaterThanOrEqual(48)
    expect(control.left).toBeGreaterThanOrEqual(0)
    const neighbor = geometry.controls.find(candidate => candidate !== control)
    expect(control.right).toBeLessThanOrEqual(neighbor?.left ?? Math.min(width - 32, 740) - 50)
  }
}

describe('Astra name and metadata start edges on Android', () => {
  it.each([412, 1352].flatMap(width => ['en', 'pt-BR'].flatMap(locale => ['preview', 'done', 'failed', 'outcome', 'breakdown', 'breakdown-failed', 'goal', 'goal-disclosure'].map(state => ({ width, locale, state })))))('aligns $state at $width in $locale', async ({ width, locale, state }) => {
    __setWindowDimensions({ width, height: 915, scale: 1, fontScale: 1 })
    await i18n.changeLanguage(locale)
    const preview = makeCreateHabitsPreview(2)
    const outcomes = selectMessageOperationBlocks(makeHeldHabitMessage({ pendingOperations: [], operations: [makeAgentOperationResult('Failed', 1)] })).outcomes
    bulkCreate.mockResolvedValue(makeBulkCreateResponse(['Success', 'Failed']))
    let tree!: Tree
    await act(() => { tree = create(state.startsWith('goal') ? <GoalListCard goalList={goalListCardFixture} onOpenGoal={state === 'goal' ? vi.fn() : undefined} /> : state.startsWith('breakdown') ? <BreakdownSuggestion parentName="House routine" subHabits={breakdownSubHabits} onConfirmed={vi.fn()} onCancelled={vi.fn()} /> : state === 'outcome' ? <OperationOutcomes outcomes={outcomes} /> : <PendingOperationCard pendingOperation={preview} onConfirmExecute={vi.fn().mockResolvedValue({ ok: true, response: makeBulkCreateExecutionResponse(state === 'failed' ? ['Failed', 'Failed'] : ['Success', 'Success']) })} onRevise={vi.fn()} onOpenTarget={vi.fn()} onPrepareStepUp={vi.fn()} onVerifyStepUp={vi.fn()} />) as Tree })
    try {
      if (state === 'done' || state === 'failed' || state === 'breakdown-failed') {
        await act(async () => { (tree.root.findAll(node => node.type === Button).find(button => button.props.variant !== 'ghost')!.props.onClick as () => void)(); await Promise.resolve() })
        if (state === 'breakdown-failed') await act(async () => { (tree.root.findAll(node => node.type === ConfirmSheet)[0]!.props.onConfirm as () => void)(); await Promise.resolve() })
      }
      expectEdges(tree, width)
      const control = tree.root.findAll(node => String(node.type) === 'Pressable' && (state === 'goal' ? node.props.accessibilityLabel === goalListCardFixture.items[0]!.title : typeof node.props.accessibilityState === 'object' && node.props.accessibilityState !== null && 'expanded' in node.props.accessibilityState))[0]!
      const style = () => StyleSheet.flatten((control.props.style as (state: { pressed: boolean }) => ViewStyle)({ pressed: false }))
      for (const handler of ['onHoverIn', 'onPressIn'] as const) {
        await act(() => { (control.props[handler] as () => void)() })
        expectEdges(tree, width)
        expect(StyleSheet.flatten((control.props.style as (state: { pressed: boolean }) => ViewStyle)({ pressed: handler === 'onPressIn' })).backgroundColor).not.toBe('transparent')
        await act(() => { (control.props[handler === 'onHoverIn' ? 'onHoverOut' : 'onPressOut'] as () => void)() })
      }
      __setTouchMode(false)
      await act(() => { __focusHost(control.props.__nativeTag as number) })
      expect(__getFocusedNativeTag()).toBe(control.props.__nativeTag)
      expect(style().backgroundColor).not.toBe('transparent')
      expectEdges(tree, width)
    } finally { await act(() => tree.update(<></>)) }
  })
})
