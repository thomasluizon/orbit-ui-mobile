import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import { InlineLoadError } from '@/components/ui/inline-load-error'

function mount(onRetry = vi.fn()) {
  render(<NextIntlClientProvider locale="en" messages={en}><InlineLoadError message="Could not load habits." onRetry={onRetry} /></NextIntlClientProvider>)
  return onRetry
}

describe('InlineLoadError', () => {
  it('announces the message as an alert in the bad status text colour and the sans font', () => {
    mount()

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Could not load habits.')
    expect(alert).toHaveClass('text-sm', 'text-[var(--status-bad-text)]')
    expect(alert.style.fontFamily).toBe('var(--font-sans)')
  })

  it('keeps the retry outside the alert and calls the retry once', () => {
    const onRetry = mount()

    const retry = screen.getByRole('button', { name: en.common.retry })
    expect(screen.getByRole('alert')).not.toContainElement(retry)
    fireEvent.click(retry)
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
