import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { FollowUpChips } from '@/components/chat/follow-up-chips'
import { Button } from '@/components/ui/pill-button'

const TestRenderer = require('react-test-renderer')
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key === 'nav.astra' ? 'Astra' : 'Next questions' }) }))
type TestNode = { type: unknown; props: Record<string, unknown>; findAll: (predicate: (node: TestNode) => boolean) => TestNode[] }
type TestTree = { root: TestNode; unmount: () => void; toJSON: () => unknown }
const trees: TestTree[] = []
function renderChips(followUps: string[], onSelect = vi.fn()) {
  let tree!: TestTree
  TestRenderer.act(() => { tree = TestRenderer.create(<FollowUpChips followUps={followUps} onSelect={onSelect} />) })
  trees.push(tree)
  return tree
}
afterEach(() => { TestRenderer.act(() => { trees.splice(0).forEach(tree => tree.unmount()) }) })

it('accepts a single follow-up and caps optional chips at two without a visible heading', () => {
  expect(renderChips([]).toJSON()).toBeNull()
  expect(renderChips(['Review']).root.findAll(node => node.type === Button)).toHaveLength(1)
  const tree = renderChips(['Review', 'Plan', 'Compare'])
  expect(tree.root.findAll(node => node.type === Button)).toHaveLength(2)
  expect(tree.root.findAll(node => node.type === 'Text' && node.props.children === 'Next questions')).toHaveLength(0)
})

it('uses the existing small pills and sends the full contextual question once', () => {
  const onSelect = vi.fn()
  const question = 'Compare Walk between 2026-10-01 and 2026-10-07 with the previous period.'
  let tree!: TestTree
  TestRenderer.act(() => { tree = TestRenderer.create(<FollowUpChips followUps={[question]} followUpContext={[
    { label: 'Compare', question, context: 'query_habits', target: 'habits', queryId: '11111111-1111-4111-8111-111111111111' },
  ]} onSelect={onSelect} />) })
  trees.push(tree)
  const chip = tree.root.findAll(node => node.type === Button)[0]!
  expect(chip.props).toMatchObject({ size: 'sm', variant: 'ghost', children: 'Compare Astra', accessibleName: 'Compare, Astra' })
  const select = chip.props.onClick as () => void
  TestRenderer.act(() => { select(); select() })
  expect(onSelect).toHaveBeenCalledExactlyOnceWith(question)
})
