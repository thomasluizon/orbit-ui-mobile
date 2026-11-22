import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { RECAP_SHARE_PERIODS } from '@orbit/shared/utils'
import ptBR from '@orbit/shared/i18n/pt-BR.json'

const coverCopyState = vi.hoisted(() => ({ localized: false }))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    if (coverCopyState.localized && key === 'wrapped.coverSubtitle') return ptBR.wrapped.coverSubtitle
    if (coverCopyState.localized && key === 'wrapped.empty') return ptBR.wrapped.empty
    return key
  },
}))


vi.mock('@/components/ui/orbit-mascot', () => ({ OrbitMascot: () => <span data-testid="orbit-mascot" /> }))
vi.mock('@/components/ui/icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}))
vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ variant, rows, label }: { variant: string; rows: number; label: string }) => (
    <div role="progressbar" data-variant={variant} data-rows={rows} aria-label={label} />
  ),
  SkeletonFace: () => <div role="progressbar" />,
}))
vi.mock('@/components/ui/error-state', () => ({
  ErrorState: ({ message, action }: { message: string; action: React.ReactNode }) => (
    <div role="alert"><span>{message}</span>{action}</div>
  ),
}))
vi.mock('@/app/(app)/wrapped/_components/wrapped-styles', () => ({
  coverEyebrowStyle: {},
  coverTitleStyle: {},
  coverSubtitleStyle: {},
}))

import { WrappedCover } from '@/app/(app)/wrapped/_components/wrapped-cover'

const baseProps = {
  period: RECAP_SHARE_PERIODS[0]!,
  onSelectPeriod: vi.fn(),
  state: 'ready' as const,
  onStart: vi.fn(),
  onRetry: vi.fn(),
}

describe('WrappedCover', () => {

  it('renders the failed treatment and retries without showing Start', () => {
    const onRetry = vi.fn()
    render(<WrappedCover {...baseProps} state="failed" onRetry={onRetry} />)

    expect(screen.getByRole('alert')).toHaveTextContent('wrapped.error')
    const retry = screen.getByRole('button', { name: 'wrapped.retry' })
    expect(retry).toHaveAttribute('data-size', 'sm')
    fireEvent.click(retry)
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'wrapped.start' })).not.toBeInTheDocument()
  })
})
