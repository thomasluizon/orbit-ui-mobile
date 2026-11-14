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
})
