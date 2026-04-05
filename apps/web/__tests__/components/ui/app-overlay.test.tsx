import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('dompurify', () => ({
  default: { sanitize: (html: string) => html },
}))

import { AppOverlay } from '@/components/ui/app-overlay'

describe('AppOverlay', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <AppOverlay open={false} onOpenChange={vi.fn()}>
        <p>Content</p>
      </AppOverlay>,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders title when open', async () => {
    render(
      <AppOverlay open={true} onOpenChange={vi.fn()} title="Test Title">
        <p>Content</p>
      </AppOverlay>,
    )
    expect(screen.getByText('Test Title')).toBeInTheDocument()
  })

  it('renders titleContent instead of title', () => {
    render(
      <AppOverlay
        open={true}
        onOpenChange={vi.fn()}
        titleContent={<span data-testid="custom-title">Custom</span>}
      >
        <p>Body</p>
      </AppOverlay>,
    )
    expect(screen.getByTestId('custom-title')).toBeInTheDocument()
  })

  it('renders children content', () => {
    render(
      <AppOverlay open={true} onOpenChange={vi.fn()} title="T">
        <p>Body content here</p>
      </AppOverlay>,
    )
    expect(screen.getByText('Body content here')).toBeInTheDocument()
  })

  it('renders footer', () => {
    render(
      <AppOverlay open={true} onOpenChange={vi.fn()} title="T" footer={<button>Save</button>}>
        <p>Body</p>
      </AppOverlay>,
    )
    expect(screen.getByText('Save')).toBeInTheDocument()
  })

  it('renders close button when dismissible', () => {
    render(
      <AppOverlay open={true} onOpenChange={vi.fn()} title="T" dismissible={true}>
        <p>Body</p>
      </AppOverlay>,
    )
    expect(screen.getByLabelText('common.close')).toBeInTheDocument()
  })

  it('hides close button when not dismissible', () => {
    render(
      <AppOverlay open={true} onOpenChange={vi.fn()} title="T" dismissible={false}>
        <p>Body</p>
      </AppOverlay>,
    )
    expect(screen.queryByLabelText('common.close')).not.toBeInTheDocument()
  })

  it('calls onOpenChange(false) when close button clicked', () => {
    const onOpenChange = vi.fn()
    render(
      <AppOverlay open={true} onOpenChange={onOpenChange} title="T">
        <p>Body</p>
      </AppOverlay>,
    )
    fireEvent.click(screen.getByLabelText('common.close'))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('renders description text', () => {
    render(
      <AppOverlay open={true} onOpenChange={vi.fn()} title="T" description="Some description">
        <p>Body</p>
      </AppOverlay>,
    )
    expect(document.body.textContent).toContain('Some description')
  })

  it('renders expand button when expandable', () => {
    const onExpand = vi.fn()
    render(
      <AppOverlay
        open={true}
        onOpenChange={vi.fn()}
        title="T"
        description="Desc"
        expandable={true}
        onExpandDescription={onExpand}
      >
        <p>Body</p>
      </AppOverlay>,
    )
    const expandBtn = screen.getByLabelText('common.expandDescription')
    expect(expandBtn).toBeInTheDocument()
    fireEvent.click(expandBtn)
    expect(onExpand).toHaveBeenCalled()
  })

  it('has aria-modal and role on dialog', () => {
    render(
      <AppOverlay open={true} onOpenChange={vi.fn()} title="T">
        <p>Body</p>
      </AppOverlay>,
    )
    const dialog = document.querySelector('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('open')
  })
})
