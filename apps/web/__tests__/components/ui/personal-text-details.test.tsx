import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PersonalTextDetails } from '@/components/ui/personal-text-details'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

let clipped = false
beforeEach(() => {
  clipped = false
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => clipped ? 60 : 40)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(40)
})
afterEach(() => vi.restoreAllMocks())

describe('personal text font measurements', () => {
  it('adds and removes the disclosure when font loading changes overflow without resizing the box', async () => {
    const label = 'Read for 20 minutes'
    const { container } = render(<PersonalTextDetails>{label}</PersonalTextDetails>)
    await act(() => document.fonts.ready.then(() => undefined))
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    clipped = true
    await act(async () => { document.fonts.dispatchEvent(new Event('loadingdone')) })
    expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-expanded', 'false')
    expect(container.querySelector('svg')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: label }))
    expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-expanded', 'true')
    clipped = false
    await act(async () => { document.fonts.dispatchEvent(new Event('loadingdone')) })
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(container.querySelector('svg')).toBeNull()
    expect(container.querySelector('[data-personal-text-expanded]')).toBeNull()
  })

  it('remeasures when the initial font set becomes ready', async () => {
    let ready!: () => void
    const fonts = document.fonts
    const pendingFonts = new EventTarget()
    Object.defineProperty(document, 'fonts', { configurable: true, value: Object.assign(pendingFonts, { ready: new Promise<EventTarget>((resolve) => { ready = () => resolve(pendingFonts) }) }) })
    try {
      render(<PersonalTextDetails>Read for 20 minutes</PersonalTextDetails>)
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
      clipped = true
      await act(async () => { ready(); await Promise.resolve() })
      await waitFor(() => expect(screen.getByRole('button')).toBeInTheDocument())
    } finally { Object.defineProperty(document, 'fonts', { configurable: true, value: fonts }) }
  })
})
