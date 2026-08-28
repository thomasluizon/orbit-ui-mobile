import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { BottomTabBar, type BottomTab } from '@/components/navigation/bottom-tab-bar'

const labels: Record<BottomTab, string> = {
  hoje: 'Hoje',
  calendario: 'Calendário',
  progresso: 'Progresso',
  perfil: 'Perfil',
}

describe('BottomTabBar', () => {
  it('renders exactly the four locked destinations', () => {
    render(
      <BottomTabBar
        active="hoje"
        labels={labels}
        navLabel="Navegação principal"
        onTab={() => {}}
      />,
    )

    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Hoje',
      'Calendário',
      'Progresso',
      'Perfil',
    ])
    expect(screen.queryByText('Astra')).not.toBeInTheDocument()
  })

  it('marks the active tab and reports the Portuguese destination id', () => {
    const onTab = vi.fn()
    render(
      <BottomTabBar
        active="perfil"
        labels={labels}
        navLabel="Navegação principal"
        onTab={onTab}
      />,
    )

    expect(screen.getByRole('button', { name: 'Perfil' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Hoje' })).not.toHaveAttribute('aria-current')
    fireEvent.click(screen.getByRole('button', { name: 'Calendário' }))
    expect(onTab).toHaveBeenCalledWith('calendario')
  })
})
