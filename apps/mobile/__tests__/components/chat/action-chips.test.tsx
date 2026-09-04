import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { ActionResult } from '@orbit/shared/types/chat'
import { makeActionResult } from '@orbit/shared/test-support/chat-fixtures'
import { ActionChips } from '@/components/chat/action-chips'

const TestRenderer = require('react-test-renderer')

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        'chat.action.created': 'Criou {name}',
        'chat.action.failed': 'Não foi possível concluir a ação',
        'chat.action.createFailed': 'Não foi possível criar {name}',
        'chat.action.updateFailed': 'Não foi possível atualizar {name}',
        'chat.action.deleteFailed': 'Não foi possível excluir {name}',
        'chat.unknownEntity': 'Desconhecido',
      }
      const template = translations[key]
      const name = typeof params?.name === 'string' ? params.name : ''
      return template
        ? template.replace('{name}', name)
        : params
          ? `${key}:${JSON.stringify(params)}`
          : key
    },
    i18n: { language: 'pt-BR' },
  }),
}))

vi.mock('@/components/ui/block-frame', () => ({
  BlockFrame: (props: Record<string, any>) => React.createElement(
    'BlockFrame',
    props,
    ...props.items.map((item: Record<string, any>) => React.createElement('Item', item, item.label, item.meta, item.control)),
    props.actions,
  ),
}))

vi.mock('@/components/ui/pill-button', () => ({
  Button: ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) =>
    React.createElement('Button', { onPress: onClick }, children),
}))

vi.mock('@/components/chat/conflict-warning', () => ({
  ConflictWarning: () => React.createElement('ConflictWarning'),
}))

function renderActions(actions: ActionResult[], onChipClick?: (id: string, type: string) => void) {
  let tree: any
  TestRenderer.act(() => {
    tree = TestRenderer.create(<ActionChips actions={actions} onChipClick={onChipClick} />)
  })
  return tree
}

describe('ActionChips (mobile)', () => {
  it('renders legacy results as one block and omits suggestions', () => {
    const tree = renderActions([makeActionResult(), makeActionResult({ status: 'Suggestion' })])
    const frame = tree.root.findByType('BlockFrame')

    expect(frame.props.title).toBe('chat.action.changes')
    expect(frame.props.items).toHaveLength(1)
    expect(frame.props.items[0].status).toBe('done')
  })

  it('uses the frame failed state without exposing a server error', () => {
    const tree = renderActions([makeActionResult({ status: 'Failed', error: 'database unavailable' })])
    const frame = tree.root.findByType('BlockFrame')

    expect(frame.props.state).toBe('partiallyFailed')
    expect(frame.props.items[0].meta).toBe('chat.operation.status.Failed')
    expect(JSON.stringify(tree.toJSON())).not.toContain('database unavailable')
  })

  it('does not describe a nameless failed create as created or unknown', () => {
    const tree = renderActions([makeActionResult({
      type: 'create_habit',
      status: 'Failed',
      entityId: null,
      entityName: null,
    })])
    const output = JSON.stringify(tree.toJSON())

    expect(output).not.toContain('Criou')
    expect(output).not.toContain('Desconhecido')
  })

  it('names the attempted entity in a failed create', () => {
    const tree = renderActions([makeActionResult({
      type: 'create_habit',
      status: 'Failed',
      entityId: null,
      entityName: 'Perspirex Strong - Semana 2 (Manutenção)',
    })])
    const frame = tree.root.findByType('BlockFrame')

    expect(frame.props.items[0].label).toBe(
      'Não foi possível criar Perspirex Strong - Semana 2 (Manutenção)',
    )
  })

  it('renders three failed attempts as distinguishable rows', () => {
    const tree = renderActions([
      makeActionResult({ type: 'create_habit', status: 'Failed', entityName: 'Morning walk' }),
      makeActionResult({ type: 'update_habit', status: 'Failed', entityName: 'Read ten pages' }),
      makeActionResult({ type: 'delete_habit', status: 'Failed', entityName: 'Drink water' }),
    ])
    const frame = tree.root.findByType('BlockFrame')

    expect(frame.props.items.map((item: { label: string }) => item.label)).toEqual([
      'Não foi possível criar Morning walk',
      'Não foi possível atualizar Read ten pages',
      'Não foi possível excluir Drink water',
    ])
  })

  it('keeps the successful create label unchanged', () => {
    const tree = renderActions([makeActionResult({ type: 'create_habit' })])
    const frame = tree.root.findByType('BlockFrame')

    expect(frame.props.items[0].label).toBe('Criou Meditate')
  })

  it('opens a successful navigable result', () => {
    const onChipClick = vi.fn()
    const tree = renderActions([makeActionResult()], onChipClick)

    TestRenderer.act(() => tree.root.findByType('Button').props.onPress())
    expect(onChipClick).toHaveBeenCalledWith('habit-1', 'LogHabit')
  })

  it('does not add a control for a destructive result', () => {
    const tree = renderActions([makeActionResult({ type: 'DeleteHabit' })], vi.fn())

    expect(tree.root.findAllByType('Button')).toHaveLength(0)
  })

  it('localizes unknown operation symbols instead of rendering them', () => {
    const tree = renderActions([makeActionResult({ type: 'UnexpectedServerSymbol' })])
    const frame = tree.root.findByType('BlockFrame')

    expect(frame.props.items[0].label).toBe('chat.action.completed')
    expect(JSON.stringify(tree.toJSON())).not.toContain('UnexpectedServerSymbol')
  })
})
