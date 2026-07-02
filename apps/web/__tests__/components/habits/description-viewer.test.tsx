import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

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

vi.mock('@/components/ui/app-overlay', () => ({
  AppOverlay: ({
    open,
    title,
    children,
  }: {
    open: boolean
    title?: string
    children?: ReactNode
  }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    ) : null,
}))

import { DescriptionViewer } from '@/components/habits/description-viewer'

const writeText = vi.fn()

describe('DescriptionViewer', () => {
  beforeEach(() => {
    writeText.mockReset().mockResolvedValue(undefined)
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
  })

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
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('My Habit')).toBeInTheDocument()
    expect(screen.getByText('Some description')).toBeInTheDocument()
  })

  it('copies the description when the copy button is clicked', async () => {
    render(
      <DescriptionViewer
        open={true}
        onOpenChange={vi.fn()}
        title="My Habit"
        description="Copy me"
      />,
    )
    fireEvent.click(screen.getByLabelText('habits.detail.copyDescription'))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Copy me'))
  })

  it('keeps the copy button usable when clipboard access is denied', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    render(
      <DescriptionViewer
        open={true}
        onOpenChange={vi.fn()}
        title="My Habit"
        description="Copy me"
      />,
    )
    fireEvent.click(screen.getByLabelText('habits.detail.copyDescription'))
    await waitFor(() => expect(writeText).toHaveBeenCalled())
    expect(screen.getByLabelText('habits.detail.copyDescription')).toBeInTheDocument()
  })
})
