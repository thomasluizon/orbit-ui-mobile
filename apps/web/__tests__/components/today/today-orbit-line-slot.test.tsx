import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TodayOrbitLine } from '@/components/today/today-orbit-line'

describe('Hoje Orbit line', () => {
  it('draws the live Orbit at 48 at the start edge inside its press target, with the foreground planet, still while no conversation entry runs with it', () => {
    const onPress = vi.fn()
    render(<TodayOrbitLine text="Sua rotina mudou. Vamos conversar?" destination="Abre a conversa" onPress={onPress} />)
    const line = screen.getByRole('button', { name: 'Sua rotina mudou. Vamos conversar?' })
    const face = line.querySelector('[data-asset="orbit-mascot"]')!
    expect(face).toHaveAttribute('width', '48')
    expect(face).toHaveAttribute('data-orbit-face', 'rig')
    expect(face).toHaveAttribute('data-orbit-loop', 'still')
    expect(face).toHaveAttribute('color', 'var(--fg-1)')
    expect(face).toHaveAttribute('aria-hidden', 'true')
    expect(line.firstElementChild).toContainElement(face as HTMLElement)
    line.click()
    expect(onPress).toHaveBeenCalledOnce()
  })

  it('draws the summary wait from the shared Skeleton fill blocks on the bare line, never from static bars', () => {
    const { container } = render(<TodayOrbitLine text="summary.loading" destination="Abre a conversa" disabled loading />)
    const line = screen.getByRole('button', { name: 'summary.loading' })
    expect(line).toHaveStyle({ background: 'transparent' })
    const placeholder = container.querySelector('[data-summary-skeleton]')!
    const blocks = [...placeholder.querySelectorAll('[data-variant="fill"]')]
    expect(blocks).toHaveLength(2)
    for (const block of blocks) {
      expect(block).toHaveAttribute('aria-hidden', 'true')
      expect(block.firstElementChild).toHaveClass('skeleton-pulse', 'bg-[var(--bg-well)]', 'rounded-[var(--r-well)]')
    }
    expect(placeholder.innerHTML).not.toContain('--hairline-strong')
    expect(placeholder.querySelectorAll(':scope > span')).toHaveLength(2)
    expect(placeholder).toHaveClass('min-h-[2lh]')
  })

  it('draws one skeleton bar and a one-line minimum height when the wait asks for one line', () => {
    const { container } = render(<TodayOrbitLine text="summary.loading" destination="Abre a conversa" disabled loading loadingLines={1} />)
    const placeholder = container.querySelector('[data-summary-skeleton]')!
    expect(placeholder.querySelectorAll(':scope > span')).toHaveLength(1)
    expect(placeholder.querySelectorAll('[data-variant="fill"]')).toHaveLength(1)
    expect(placeholder).toHaveClass('min-h-[1lh]')
    expect(placeholder).not.toHaveClass('min-h-[2lh]')
  })
})
