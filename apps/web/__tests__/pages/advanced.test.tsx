import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/hooks/use-go-back-or-fallback', () => ({
  useGoBackOrFallback: () => vi.fn(),
}))

vi.mock('@/components/advanced/advanced-sections', () => ({
  WidgetInfoOverlay: ({ open }: { open: boolean }) => open
    ? <div data-testid="widget-info" />
    : null,
}))

import AdvancedPage from '@/app/(app)/advanced/page'

describe('AdvancedPage', () => {
  it('keeps the widget help and removes the relocated API-key surface', () => {
    render(<AdvancedPage />)

    expect(screen.getByText('profile.widgetTitle')).toBeInTheDocument()
    expect(screen.queryByText('orbitMcp.title')).not.toBeInTheDocument()
    expect(screen.queryByText('orbitMcp.apiKeys')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /profile.widgetTitle/i }))
    expect(screen.getByTestId('widget-info')).toBeInTheDocument()
  })
})
