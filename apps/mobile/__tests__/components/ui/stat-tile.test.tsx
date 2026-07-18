import { describe, expect, it } from 'vitest'

import { StatTile } from '@/components/ui/stat-tile'

const TestRenderer = require('react-test-renderer')

function renderTile(props: {
  emoji: string
  value: string | number
  label: string
  phraseValue?: boolean
}) {
  let tree: any
  TestRenderer.act(() => {
    tree = TestRenderer.create(<StatTile {...props} />)
  })
  return tree.root.findAllByType('Text')
}

describe('StatTile (mobile)', () => {
  it('renders emoji, value, and label', () => {
    const texts = renderTile({ emoji: '🔥', value: '7 dias', label: 'Sequência' })
    expect(texts.map((node: any) => node.props.children)).toEqual(
      expect.arrayContaining(['🔥', '7 dias', 'Sequência']),
    )
  })

  it('renders numeric values', () => {
    const texts = renderTile({ emoji: '⭐', value: 12, label: 'Total' })
    expect(texts.map((node: any) => node.props.children)).toContain(12)
  })

  it('clamps the label to two lines and a numeral value to one', () => {
    const texts = renderTile({
      emoji: '🥇',
      value: 1284937,
      label: 'Melhor sequência de hábitos concluídos',
    })
    const value = texts.find((node: any) => node.props.children === 1284937)
    const label = texts.find(
      (node: any) => node.props.children === 'Melhor sequência de hábitos concluídos',
    )
    expect(value.props.numberOfLines).toBe(1)
    expect(label.props.numberOfLines).toBe(2)
  })

  it('wraps a phrase value to two lines so a longer pt-BR string stays readable', () => {
    const phrase = '18 de julho de 2026'
    const texts = renderTile({
      emoji: '📅',
      value: phrase,
      label: 'Conclusão prevista',
      phraseValue: true,
    })
    const value = texts.find((node: any) => node.props.children === phrase)
    expect(value.props.numberOfLines).toBe(2)
  })

  it('reserves a two-line label box so tiles in a row share a baseline', () => {
    const texts = renderTile({ emoji: '🏆', value: 3, label: 'Maior' })
    const label = texts.find((node: any) => node.props.children === 'Maior')
    expect(label.props.style.flat(Infinity)).toEqual(
      expect.arrayContaining([expect.objectContaining({ minHeight: 40, lineHeight: 20 })]),
    )
  })
})
