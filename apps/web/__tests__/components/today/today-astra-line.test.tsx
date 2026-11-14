import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TodayAstraLine } from '@/components/today/today-astra-line'

describe('Hoje Orbit line', () => {
  it('draws Orbit at 48 at the start edge, still inside its press target, with the foreground planet', () => {
    const onPress = vi.fn()
    render(<TodayAstraLine text="Sua rotina mudou. Vamos conversar?" destination="Abre a conversa" onPress={onPress} />)
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
    const { container } = render(<TodayAstraLine text="summary.loading" destination="Abre a conversa" disabled loading />)
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
  })
})
