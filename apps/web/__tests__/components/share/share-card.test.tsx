import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMockRecap } from '@orbit/shared/__tests__/factories'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
}))

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,AAAA') },
}))

import { ShareCard } from '@/components/share/share-card'

describe('ShareCard', () => {
  it('renders the branded capture target from a recap', () => {
    render(<ShareCard recap={createMockRecap()} />)
    expect(screen.getByTestId('share-card')).toBeInTheDocument()
  })

  it('renders the streak hero, formatted stats, top habits, and the scannable link', () => {
    render(<ShareCard recap={createMockRecap()} />)

    expect(screen.getByTestId('share-card-streak')).toHaveTextContent('shareCard.streak')
    expect(screen.getByText('82%')).toBeInTheDocument()
    expect(screen.getByText('Morning run')).toBeInTheDocument()
    expect(screen.getByText('shareCard.scanToJoin')).toBeInTheDocument()
    expect(screen.getByText('app.useorbit.org/r/ABC123?recap=week')).toBeInTheDocument()
  })

  it('hides the scannable link footer when the recap has no deep link', () => {
    render(<ShareCard recap={createMockRecap({ shareDeepLink: '' })} />)
    expect(screen.queryByText('shareCard.scanToJoin')).not.toBeInTheDocument()
  })
})
