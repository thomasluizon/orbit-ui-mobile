import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { makeActionResult } from '@orbit/shared/test-support/chat-fixtures'
import { ActionChips } from '@/components/chat/action-chips'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    const translations: Record<string, string> = {
      'chat.action.created': 'Criou {name}',
      'chat.action.failed': 'Não foi possível concluir a ação',
      'chat.action.createFailed': 'Não foi possível criar {name}',
      'chat.action.updateFailed': 'Não foi possível atualizar {name}',
      'chat.action.deleteFailed': 'Não foi possível apagar {name}',
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
}))

describe('ActionChips', () => {
  it('renders legacy results as one block and omits suggestions', () => {
    render(<ActionChips actions={[makeActionResult(), makeActionResult({ status: 'Suggestion' })]} />)

    expect(screen.getByRole('heading', { name: 'chat.action.changes' })).toBeInTheDocument()
    expect(screen.getAllByText('status.done')).toHaveLength(1)
  })

  it('uses the frame failed state without exposing a server error', () => {
    const { container } = render(<ActionChips actions={[makeActionResult({ status: 'Failed', error: 'database unavailable' })]} />)

    expect(container.querySelector('[data-state="partiallyFailed"]')).toBeInTheDocument()
    expect(screen.getByText('chat.operation.status.Failed')).toBeInTheDocument()
    expect(screen.queryByText('database unavailable')).not.toBeInTheDocument()
  })

  it('does not describe a nameless failed create as created or unknown', () => {
    const { container } = render(<ActionChips actions={[makeActionResult({
      type: 'create_habit',
      status: 'Failed',
      entityId: null,
      entityName: null,
    })]} />)

    expect(container).not.toHaveTextContent('Criou')
    expect(container).not.toHaveTextContent('Desconhecido')
  })

  it('names the attempted entity in a failed create', () => {
    render(<ActionChips actions={[makeActionResult({
      type: 'create_habit',
      status: 'Failed',
      entityId: null,
      entityName: 'Perspirex Strong - Semana 2 (Manutenção)',
    })]} />)

    expect(screen.getByRole('button', { name: 'Não foi possível criar Perspirex Strong - Semana 2 (Manutenção)' })).toBeInTheDocument()
  })

  it('renders three failed attempts as distinguishable rows', () => {
    render(<ActionChips actions={[
      makeActionResult({ type: 'create_habit', status: 'Failed', entityName: 'Morning walk' }),
      makeActionResult({ type: 'update_habit', status: 'Failed', entityName: 'Read ten pages' }),
      makeActionResult({ type: 'delete_habit', status: 'Failed', entityName: 'Drink water' }),
    ]} />)

    expect(screen.getByRole('button', { name: 'Não foi possível criar Morning walk' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Não foi possível atualizar Read ten pages' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Não foi possível apagar Drink water' })).toBeInTheDocument()
  })

  it('keeps the successful create label unchanged', () => {
    render(<ActionChips actions={[makeActionResult({ type: 'create_habit' })]} />)

    expect(screen.getByRole('button', { name: 'Criou Meditate' })).toBeInTheDocument()
  })

  it('opens a successful navigable result', () => {
    const onChipClick = vi.fn()
    render(<ActionChips actions={[makeActionResult()]} onChipClick={onChipClick} />)

    fireEvent.click(screen.getByRole('button', { name: 'chat.action.open' }))
    expect(onChipClick).toHaveBeenCalledWith('habit-1', 'LogHabit')
  })

  it('does not add a control for a destructive result', () => {
    render(<ActionChips actions={[makeActionResult({ type: 'DeleteHabit' })]} onChipClick={vi.fn()} />)

    expect(screen.queryByRole('button', { name: 'chat.action.open' })).not.toBeInTheDocument()
  })

  it('localizes unknown operation symbols instead of rendering them', () => {
    render(<ActionChips actions={[makeActionResult({ type: 'UnexpectedServerSymbol' })]} />)

    expect(screen.getByText('chat.action.completed')).toBeInTheDocument()
    expect(screen.queryByText(/UnexpectedServerSymbol/)).not.toBeInTheDocument()
  })
  it.each(['UnbrokenToken'.repeat(24), 'Read extraordinarilyLongWord daily before breakfast with the people in my neighborhood'])('discloses the full attempted entity %s', (name) => {
    const label = `Não foi possível criar ${name}`
    const onChipClick = vi.fn()
    const { container } = render(<ActionChips actions={[makeActionResult({ type: 'create_habit', status: 'Failed', entityName: name, entityId: null })]} onChipClick={onChipClick} />)
    const disclosure = screen.getByRole('button', { name: label, expanded: false })
    expect(container.querySelector('[data-personal-text]')).toHaveAttribute('aria-label', label)
    fireEvent.click(disclosure)
    expect(screen.getByRole('button', { name: label, expanded: true })).toBeInTheDocument()
    expect(onChipClick).not.toHaveBeenCalled()
  })

})
