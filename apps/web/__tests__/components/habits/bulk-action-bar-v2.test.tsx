import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { BulkActionBarV2 } from '@/components/habits/bulk-action-bar-v2'

function renderBar(overrides: Partial<Parameters<typeof BulkActionBarV2>[0]> = {}) {
  const props = {
    selectedCount: 2,
    allSelected: false,
    onSelectAll: vi.fn(),
    onDeselectAll: vi.fn(),
    onBulkLog: vi.fn(),
    onBulkSkip: vi.fn(),
    onBulkDelete: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  }
  render(<BulkActionBarV2 {...props} />)
  return props
}

describe('BulkActionBarV2', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('labels the action buttons with the selection-scoped accessible names', () => {
    renderBar()

    expect(screen.getByRole('button', { name: 'habits.bulkBar.log' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'habits.bulkBar.skip' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'habits.bulkBar.delete' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'common.cancel' })).toBeInTheDocument()
  })

  it('fires the bulk handlers when actions are clicked with a selection', () => {
    const props = renderBar({ selectedCount: 3 })

    fireEvent.click(screen.getByRole('button', { name: 'habits.bulkBar.log' }))
    fireEvent.click(screen.getByRole('button', { name: 'habits.bulkBar.skip' }))
    fireEvent.click(screen.getByRole('button', { name: 'habits.bulkBar.delete' }))

    expect(props.onBulkLog).toHaveBeenCalled()
    expect(props.onBulkSkip).toHaveBeenCalled()
    expect(props.onBulkDelete).toHaveBeenCalled()
  })

  it('disables log, skip, and delete when nothing is selected but keeps close active', () => {
    const props = renderBar({ selectedCount: 0 })

    const logButton = screen.getByRole('button', { name: 'habits.bulkBar.log' })
    const skipButton = screen.getByRole('button', { name: 'habits.bulkBar.skip' })
    const deleteButton = screen.getByRole('button', { name: 'habits.bulkBar.delete' })
    const closeButton = screen.getByRole('button', { name: 'common.cancel' })

    expect(logButton).toBeDisabled()
    expect(skipButton).toBeDisabled()
    expect(deleteButton).toBeDisabled()
    expect(closeButton).toBeEnabled()

    fireEvent.click(logButton)
    fireEvent.click(skipButton)
    fireEvent.click(deleteButton)

    expect(props.onBulkLog).not.toHaveBeenCalled()
    expect(props.onBulkSkip).not.toHaveBeenCalled()
    expect(props.onBulkDelete).not.toHaveBeenCalled()
  })

  it('toggles between select-all and deselect-all', () => {
    const props = renderBar({ allSelected: false })

    fireEvent.click(screen.getByRole('button', { name: 'common.selectAll' }))
    expect(props.onSelectAll).toHaveBeenCalled()
  })

  it('offers deselect-all when everything is selected', () => {
    const props = renderBar({ allSelected: true })

    fireEvent.click(screen.getByRole('button', { name: 'common.deselectAll' }))
    expect(props.onDeselectAll).toHaveBeenCalled()
  })

  it('renders the selected count beside the digit-free suffix', () => {
    renderBar({ selectedCount: 7 })

    const bar = screen.getByTestId('bulk-action-bar')
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(bar.textContent).toContain('common.selectedSuffix')
  })
})
