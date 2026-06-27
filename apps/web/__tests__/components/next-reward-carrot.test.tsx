import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`
    return key
  },
}))

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [k: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

import { NextRewardCarrot } from '@/app/(app)/profile/_components/next-reward-carrot'

describe('NextRewardCarrot', () => {
  it('renders nothing when carrot is null', () => {
    const { container } = render(<NextRewardCarrot carrot={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the next free level and XP-to-go with the Pro teaser and upgrade CTA', () => {
    render(
      <NextRewardCarrot
        carrot={{ nextLevel: 4, nextLevelTitle: 'Navigator', xpToNextLevel: 300, showProTeaser: true }}
      />,
    )

    expect(screen.getByText('gamification.carrot.title')).toBeInTheDocument()
    expect(
      screen.getByText('gamification.carrot.toNextLevel:{"xp":300,"level":4}'),
    ).toBeInTheDocument()
    expect(screen.getByText('gamification.carrot.proTeaser.title')).toBeInTheDocument()
    expect(screen.getByText('gamification.carrot.proTeaser.achievements')).toBeInTheDocument()
    expect(screen.getByText('common.upgrade').closest('a')).toHaveAttribute('href', '/upgrade')
  })

  it('omits the Pro teaser when showProTeaser is false', () => {
    render(
      <NextRewardCarrot
        carrot={{ nextLevel: 4, nextLevelTitle: 'Navigator', xpToNextLevel: 300, showProTeaser: false }}
      />,
    )

    expect(screen.getByText('gamification.carrot.toNextLevel:{"xp":300,"level":4}')).toBeInTheDocument()
    expect(screen.queryByText('gamification.carrot.proTeaser.title')).not.toBeInTheDocument()
    expect(screen.queryByText('common.upgrade')).not.toBeInTheDocument()
  })
})
