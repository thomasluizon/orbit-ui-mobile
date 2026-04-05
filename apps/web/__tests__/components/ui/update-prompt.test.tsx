import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { UpdatePrompt } from '@/components/ui/update-prompt'

describe('UpdatePrompt', () => {
  it('renders nothing when show is false', () => {
    const { container } = render(
      <UpdatePrompt show={false} onUpdate={vi.fn()} onDismiss={vi.fn()} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders title and description when shown', () => {
    render(<UpdatePrompt show={true} onUpdate={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.getByText('updatePrompt.title')).toBeInTheDocument()
    expect(screen.getByText('updatePrompt.description')).toBeInTheDocument()
  })

  it('calls onUpdate when update button clicked', () => {
    const onUpdate = vi.fn()
    render(<UpdatePrompt show={true} onUpdate={onUpdate} onDismiss={vi.fn()} />)
    fireEvent.click(screen.getByText('updatePrompt.update'))
    expect(onUpdate).toHaveBeenCalled()
  })

  it('calls onDismiss when later button clicked', () => {
    const onDismiss = vi.fn()
    render(<UpdatePrompt show={true} onUpdate={vi.fn()} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByText('updatePrompt.later'))
    expect(onDismiss).toHaveBeenCalled()
  })

  it('hides when X button clicked', () => {
    const onDismiss = vi.fn()
    const { container } = render(
      <UpdatePrompt show={true} onUpdate={vi.fn()} onDismiss={onDismiss} />,
    )
    // X button is the last button (close)
    const buttons = container.querySelectorAll('button')
    const closeBtn = buttons[buttons.length - 1]
    fireEvent.click(closeBtn!)
    expect(onDismiss).toHaveBeenCalled()
  })
})
