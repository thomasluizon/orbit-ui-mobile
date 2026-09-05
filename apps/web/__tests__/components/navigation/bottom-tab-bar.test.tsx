import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { BottomTabBar } from '@/components/navigation/bottom-tab-bar'

const labels: Record<string, string> = {
  hoje: 'Hoje',
  calendario: 'Calendário',
  progresso: 'Progresso',
  perfil: 'Perfil',
}

describe('BottomTabBar', () => {
  it('renders exactly the four locked destinations', () => {
    render(
      <BottomTabBar
        activeId="hoje"
        items={Object.entries(labels).map(([id, label]) => ({ id, label }))}
        label="Navegação principal"
        onSelect={() => {}}
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
        activeId="perfil"
        items={Object.entries(labels).map(([id, label]) => ({ id, label }))}
        label="Navegação principal"
        onSelect={onTab}
      />,
    )

    expect(screen.getByRole('button', { name: 'Perfil' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Hoje' })).not.toHaveAttribute('aria-current')
    fireEvent.click(screen.getByRole('button', { name: 'Calendário' }))
    expect(onTab).toHaveBeenCalledWith('calendario')
  })
})

it('keeps one current position when another or the current item is pressed', () => {
  const onSelect = vi.fn()
  const items = Object.entries(labels).map(([id, label]) => ({ id, label }))
  render(<BottomTabBar items={items} activeId="calendario" onSelect={onSelect} label="Navigation" />)
  const buttons = screen.getAllByRole('button')
  expect(buttons.filter((button) => button.hasAttribute('aria-current'))).toEqual([buttons[1]])
  fireEvent.click(buttons[2]!)
  expect(onSelect).toHaveBeenCalledExactlyOnceWith('progresso')
  onSelect.mockClear()
  fireEvent.click(buttons[1]!)
  expect(onSelect).toHaveBeenCalledExactlyOnceWith('calendario')
  expect(buttons.filter((button) => button.hasAttribute('aria-current'))).toEqual([buttons[1]])
})
