import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`
    return key
  },
}))

import { FactsPagination } from '@/app/(app)/ai-settings/_components/facts-pagination'

describe('FactsPagination', () => {
  it('renders the current page and total via i18n', () => {
    render(
      <FactsPagination page={2} totalPages={4} onPrevious={vi.fn()} onNext={vi.fn()} />,
    )
    expect(
      screen.getByText('profile.facts.count:{"n":2,"max":4}'),
    ).toBeInTheDocument()
  })

  it('navigates to the previous and next page on click', () => {
    const onPrevious = vi.fn()
    const onNext = vi.fn()
    render(
      <FactsPagination
        page={2}
        totalPages={4}
        onPrevious={onPrevious}
        onNext={onNext}
      />,
    )
    fireEvent.click(screen.getByLabelText('common.previousPage'))
    expect(onPrevious).toHaveBeenCalled()
    fireEvent.click(screen.getByLabelText('common.nextPage'))
    expect(onNext).toHaveBeenCalled()
  })

  it('disables previous on the first page', () => {
    render(
      <FactsPagination page={1} totalPages={4} onPrevious={vi.fn()} onNext={vi.fn()} />,
    )
    expect(screen.getByLabelText('common.previousPage')).toBeDisabled()
    expect(screen.getByLabelText('common.nextPage')).not.toBeDisabled()
  })

  it('disables next on the last page', () => {
    render(
      <FactsPagination page={4} totalPages={4} onPrevious={vi.fn()} onNext={vi.fn()} />,
    )
    expect(screen.getByLabelText('common.nextPage')).toBeDisabled()
    expect(screen.getByLabelText('common.previousPage')).not.toBeDisabled()
  })
})
