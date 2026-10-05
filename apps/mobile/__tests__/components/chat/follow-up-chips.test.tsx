import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FollowUpChips } from '@/components/chat/follow-up-chips'
import { createTokensV2 } from '@/lib/theme'

const TestRenderer = require('react-test-renderer')

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: () => 'Próximas perguntas' }),
}))

type TestNode = {
  type: unknown
  props: Record<string, unknown>
  findAll: (predicate: (node: TestNode) => boolean) => TestNode[]
}
type TestTree = { root: TestNode; unmount: () => void; toJSON: () => unknown }
const trees: TestTree[] = []
const questions = [
  'Quer revisar os seus hábitos e planejar a rotina pra amanhã?',
  'Quer revisar os seus hábitos e planejar a rotina pra depois?',
]

function renderQuestions(followUps = questions, onSelect = vi.fn()) {
  let tree!: TestTree
  TestRenderer.act(() => { tree = TestRenderer.create(<FollowUpChips followUps={followUps} onSelect={onSelect} />) })
  trees.push(tree)
  return tree
}

afterEach(() => { TestRenderer.act(() => { trees.splice(0).forEach(tree => tree.unmount()) }) })

describe('Follow-up question rows', () => {
  it('shows each whole sentence without a line cap or ellipsis', () => {
    const tree = renderQuestions()
    for (const question of questions) {
      expect(question).toHaveLength(60)
      const text = tree.root.findAll(node => node.type === 'Text' && node.props.children === question)[0]!
      expect.soft(text.props).not.toHaveProperty('numberOfLines')
      expect.soft(text.props).not.toHaveProperty('ellipsizeMode')
    }
  })

  it('stacks full-width rows with growing height and padded press fills', () => {
    const tree = renderQuestions()
    const groups = tree.root.findAll(node => node.type === 'View')
    expect.soft(groups[0]!.props.style).not.toHaveProperty('paddingHorizontal')
    expect.soft(groups[0]!.props.style).toMatchObject({ gap: 8 })
    expect.soft(groups[1]!.props.style).toMatchObject({ gap: 8 })
    expect.soft(groups[1]!.props.style).not.toHaveProperty('flexDirection', 'row')
    const tokens = createTokensV2('orange', 'dark')
    for (const row of tree.root.findAll(node => node.type === 'Pressable')) {
      const style = row.props.style as (state: { pressed: boolean }) => Record<string, unknown>
      expect.soft(style({ pressed: false })).toMatchObject({
        minHeight: 48, borderRadius: 12, width: '100%', paddingVertical: 12, paddingHorizontal: 16,
        backgroundColor: tokens.bgWell, borderColor: tokens.hairline,
      })
      expect(style({ pressed: true })).toMatchObject({ backgroundColor: tokens.bgHover, borderRadius: 12 })
      expect(style({ pressed: false })).not.toHaveProperty('height')
    }
  })

  it('keeps the visible sentence as the accessible name and selected value', () => {
    const onSelect = vi.fn()
    const tree = renderQuestions(questions, onSelect)
    const rows = tree.root.findAll(node => node.type === 'Pressable')
    expect(rows).toHaveLength(2)
    rows.forEach((row, index) => {
      expect(row.props.accessibilityLabel).toBe(questions[index])
      TestRenderer.act(() => { (row.props.onPress as () => void)() })
      expect(onSelect).toHaveBeenLastCalledWith(questions[index])
    })
  })

  it('omits fewer than two questions and limits the group to three', () => {
    expect(renderQuestions([]).toJSON()).toBeNull()
    expect(renderQuestions([questions[0]!]).toJSON()).toBeNull()
    const tree = renderQuestions([...questions, 'Uma terceira pergunta?', 'Uma quarta pergunta?'])
    expect(tree.root.findAll(node => node.type === 'Pressable')).toHaveLength(3)
  })
})
