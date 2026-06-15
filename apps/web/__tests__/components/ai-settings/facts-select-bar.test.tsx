import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`
    return key
  },
}))

import { FactsSelectBar } from '@/app/(app)/ai-settings/_components/facts-select-bar'

function baseProps() {
  return {
    selectMode: false,
    selectedCount: 0,
    allSelected: false,
    bulkDeletePending: false,
    showPagination: false,
    page: 1,
    totalPages: 1,
    onPreviousPage: vi.fn(),
    onNextPage: vi.fn(),
    onToggleSelectAll: vi.fn(),
    onBulkDelete: vi.fn(),
    onToggleSelectMode: vi.fn(),
  }
}

describe('FactsSelectBar', () => {
  it('shows an icon select toggle when idle', () => {
    const props = baseProps()
    render(<FactsSelectBar {...props} />)
    fireEvent.click(screen.getByLabelText('profile.facts.select'))
    expect(props.onToggleSelectMode).toHaveBeenCalled()
  })

  it('renders pagination only when requested', () => {
    const idle = baseProps()
    const { rerender } = render(<FactsSelectBar {...idle} />)
    expect(
      screen.queryByLabelText('common.previousPage'),
    ).not.toBeInTheDocument()
    rerender(
      <FactsSelectBar {...idle} showPagination page={2} totalPages={5} />,
    )
    expect(screen.getByText('profile.facts.count:{"n":2,"max":5}')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('common.nextPage'))
    expect(idle.onNextPage).toHaveBeenCalled()
  })

  it('shows a cancel action in select mode', () => {
    const props = { ...baseProps(), selectMode: true, selectedCount: 2 }
    render(<FactsSelectBar {...props} />)
    fireEvent.click(screen.getByLabelText('profile.facts.cancel'))
    expect(props.onToggleSelectMode).toHaveBeenCalled()
  })

  it('toggles select-all and shows the select-all label when none are selected', () => {
    const props = { ...baseProps(), selectMode: true, selectedCount: 0 }
    render(<FactsSelectBar {...props} />)
    fireEvent.click(screen.getByText('profile.facts.selectAll'))
    expect(props.onToggleSelectAll).toHaveBeenCalled()
  })

  it('shows the deselect-all label when everything is selected', () => {
    const props = {
      ...baseProps(),
      selectMode: true,
      selectedCount: 7,
      allSelected: true,
    }
    render(<FactsSelectBar {...props} />)
    expect(screen.getByText('profile.facts.deselectAll')).toBeInTheDocument()
  })

  it('fires bulk delete when there is a selection', () => {
    const props = { ...baseProps(), selectMode: true, selectedCount: 3 }
    render(<FactsSelectBar {...props} />)
    fireEvent.click(screen.getByText('3'))
    expect(props.onBulkDelete).toHaveBeenCalled()
  })

  it('disables bulk delete while a delete is pending', () => {
    const props = {
      ...baseProps(),
      selectMode: true,
      selectedCount: 3,
      bulkDeletePending: true,
    }
    render(<FactsSelectBar {...props} />)
    expect(screen.getByText('3').closest('button')).toBeDisabled()
  })

  it('hides the bulk-delete action when nothing is selected', () => {
    const props = { ...baseProps(), selectMode: true, selectedCount: 0 }
    render(<FactsSelectBar {...props} />)
    expect(props.onBulkDelete).not.toHaveBeenCalled()
    expect(screen.getByText('profile.facts.selectAll')).toBeInTheDocument()
  })
})
