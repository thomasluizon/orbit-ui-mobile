import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { NewPairFlow } from '@/app/social/_components/new-pair-flow'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
    i18n: { language: 'en' },
  }),
}))

vi.mock('@/components/bottom-sheet-modal', () => ({
  BottomSheetModal: ({ open, children }: { open: boolean; children?: React.ReactNode }) =>
    open ? <>{children}</> : null,
}))

vi.mock('@/hooks/use-friends', () => ({
  useFriends: () => ({
    data: { friends: [{ userId: 'friend-1', displayName: 'Ana Lima', handle: 'ana' }] },
  }),
}))

vi.mock('@/hooks/use-accountability', () => ({
  useInviteAccountabilityBuddy: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showError: vi.fn(), showSuccess: vi.fn() }),
}))

vi.mock('@/hooks/use-habits', () => ({
  EMPTY_CHILDREN_BY_PARENT: new Map(),
  EMPTY_HABITS_BY_ID: new Map(),
  EMPTY_NORMALIZED_HABITS: [],
  useHabits: () => ({ data: undefined }),
}))

interface TestNode {
  type: unknown
  props: Record<string, unknown>
  findAll(predicate: (node: TestNode) => boolean): TestNode[]
  findAllByType(type: unknown): TestNode[]
}

interface TestTree {
  root: TestNode
}

interface TestRendererApi {
  create(element: React.ReactNode): TestTree
  act(callback: () => Promise<void> | void): Promise<void>
}

const TestRenderer: TestRendererApi = require('react-test-renderer')

async function renderFlow(onClose: () => void) {
  let tree!: TestTree
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(<NewPairFlow open onClose={onClose} />)
  })
  return tree
}

function pressableWithText(tree: TestTree, text: string): TestNode {
  const matches = tree.root.findAll(
    (node) =>
      node.type === 'Pressable' &&
      node.findAll((child) => child.type === 'Text' && child.props.children === text).length > 0,
  )
  const match = matches.at(-1)
  if (!match) throw new Error(`No pressable containing "${text}"`)
  return match
}

function isSelected(node: TestNode): boolean {
  return (node.props.accessibilityState as { selected: boolean }).selected
}

async function press(tree: TestTree, text: string) {
  const target = pressableWithText(tree, text)
  await TestRenderer.act(async () => {
    ;(target.props as { onPress: () => void }).onPress()
  })
}

describe('NewPairFlow', () => {
  it('keeps the draft selections while the sheet stays open', async () => {
    const tree = await renderFlow(vi.fn())

    expect(isSelected(pressableWithText(tree, 'social.buddies.cadence.Weekly'))).toBe(false)

    await press(tree, 'social.buddies.cadence.Weekly')

    expect(isSelected(pressableWithText(tree, 'social.buddies.cadence.Weekly'))).toBe(true)
  })

  it('resets the draft when the sheet closes without submitting', async () => {
    const onClose = vi.fn()
    const tree = await renderFlow(onClose)

    await press(tree, 'social.buddies.cadence.Weekly')
    await press(tree, 'Ana Lima')
    expect(isSelected(pressableWithText(tree, 'Ana Lima'))).toBe(true)

    const sheet = tree.root.findAllByType(BottomSheetModal).at(0)
    if (!sheet) throw new Error('BottomSheetModal not rendered')
    await TestRenderer.act(async () => {
      ;(sheet.props as { onClose: () => void }).onClose()
    })

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(isSelected(pressableWithText(tree, 'social.buddies.cadence.Weekly'))).toBe(false)
    expect(isSelected(pressableWithText(tree, 'social.buddies.cadence.Daily'))).toBe(true)
    expect(isSelected(pressableWithText(tree, 'Ana Lima'))).toBe(false)
  })
})
