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
    factCount: 7,
    selectMode: false,
    selectedCount: 0,
    allSelected: false,
    bulkDeletePending: false,
    onToggleSelectAll: vi.fn(),
    onBulkDelete: vi.fn(),
    onToggleSelectMode: vi.fn(),
  }
}

describe('FactsSelectBar', () => {
  it('shows the fact count and a select action when idle', () => {
    const props = baseProps()
    render(<FactsSelectBar {...props} />)
    expect(screen.getByText('7')).toBeInTheDocument()
    fireEvent.click(screen.getByText('profile.facts.select'))
    expect(props.onToggleSelectMode).toHaveBeenCalled()
  })

  it('shows the selected count and a cancel action in select mode', () => {
    const props = { ...baseProps(), selectMode: true, selectedCount: 2 }
    render(<FactsSelectBar {...props} />)
    expect(
      screen.getByText('2 profile.facts.select'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByText('profile.facts.cancel'))
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
    fireEvent.click(screen.getByText('profile.facts.deleteSelected:{"n":3}'))
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
    expect(
      screen.getByText('profile.facts.deleteSelected:{"n":3}'),
    ).toBeDisabled()
  })

  it('hides the bulk-delete action when nothing is selected', () => {
    const props = { ...baseProps(), selectMode: true, selectedCount: 0 }
    render(<FactsSelectBar {...props} />)
    expect(
      screen.queryByText('profile.facts.deleteSelected:{"n":0}'),
    ).not.toBeInTheDocument()
  })
})
