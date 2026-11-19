import { describe, expect, it } from 'vitest'
import { buildTagLineItems, type TagLineHabit } from '../utils/tag-flow-line'

const more = (count: number) => `${count} more`
const habit = (title: string, ...tagIds: string[]): TagLineHabit => ({ title, tags: tagIds.map((id) => ({ id })) })

describe('tag flow line', () => {
  it('lists the titles of the items that carry the tag', () => {
    const habits = [habit('Run', 'health'), habit('Read', 'mind'), habit('Stretch', 'health')]
    expect(buildTagLineItems('health', habits, 'en', more)).toEqual({ kind: 'items', items: 'Run and Stretch' })
  })

  it('names three items and counts the rest in one plural phrase', () => {
    const habits = ['Run', 'Swim', 'Stretch', 'Walk', 'Lift'].map((title) => habit(title, 'health'))
    expect(buildTagLineItems('health', habits, 'en', more)).toEqual({ kind: 'items', items: 'Run, Swim, Stretch, and 2 more' })
  })

  it('joins the list in the pt-BR form', () => {
    const habits = [habit('Correr', 'saude'), habit('Nadar', 'saude'), habit('Alongar', 'saude')]
    expect(buildTagLineItems('saude', habits, 'pt-BR', more)).toEqual({ kind: 'items', items: 'Correr, Nadar e Alongar' })
  })

  it('reports an empty tag so the caller uses its own sentence', () => {
    expect(buildTagLineItems('unused', [habit('Run', 'health')], 'en', more)).toEqual({ kind: 'empty' })
    expect(buildTagLineItems('unused', [], 'en', more)).toEqual({ kind: 'empty' })
  })

  it('returns null with no cache, so no line is guessed', () => {
    expect(buildTagLineItems('health', undefined, 'en', more)).toBeNull()
  })
})
