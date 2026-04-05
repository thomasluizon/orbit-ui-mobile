import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('marked', () => ({
  marked: {
    parse: (md: string) => `<p>${md}</p>`,
  },
}))

vi.mock('dompurify', () => ({
  default: { sanitize: (html: string) => html },
}))

import { DescriptionViewer } from '@/components/habits/description-viewer'

describe('DescriptionViewer', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <DescriptionViewer
        open={false}
        onOpenChange={vi.fn()}
        title="My Habit"
        description="Test desc"
      />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders title and description when open', () => {
    render(
      <DescriptionViewer
        open={true}
        onOpenChange={vi.fn()}
        title="My Habit"
        description="Some description"
      />,
    )
    expect(screen.getByText('My Habit')).toBeInTheDocument()
  })

  it('calls onOpenChange(false) when back button clicked', () => {
    const onOpenChange = vi.fn()
    render(
      <DescriptionViewer
        open={true}
        onOpenChange={onOpenChange}
        title="My Habit"
        description="Desc"
      />,
    )
    fireEvent.click(screen.getByLabelText('common.back'))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
