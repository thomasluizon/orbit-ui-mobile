import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

// Mock the PushPrompt without the service worker complexity
// Since it uses useEffect to check SW/PushManager, we test the rendering paths

vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lucide-react')>()
  return {
    ...actual,
    BellRing: (props: Record<string, unknown>) => <svg data-testid="bell-ring" {...props} />,
    X: (props: Record<string, unknown>) => <svg data-testid="x-icon" {...props} />,
  }
})

import { PushPrompt } from '@/components/ui/push-prompt'

describe('PushPrompt', () => {
  beforeEach(() => {
    // Default: no service worker support => component renders null
    Object.defineProperty(navigator, 'serviceWorker', {
      value: undefined,
      writable: true,
      configurable: true,
    })
  })

  it('renders nothing initially (no SW support)', () => {
    const { container } = render(<PushPrompt />)
    // Without service worker, it returns null after the effect
    expect(container.firstChild).toBeNull()
  })
})
