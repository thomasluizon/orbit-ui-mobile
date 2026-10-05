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
  it('centres navigation in the same capped column as the mobile tab bar', () => {
    render(<BottomTabBar activeId="hoje" items={Object.entries(labels).map(([id, label]) => ({ id, label }))} label="Navegação principal" onSelect={() => {}} />)
    expect(screen.getByRole('navigation')).toHaveClass('mx-auto', 'w-full', 'max-w-[740px]')
  })

  it('renders exactly the four locked destinations', () => {
    render(
      <BottomTabBar
        activeId="hoje"
        items={Object.entries(labels).map(([id, label]) => ({ id, label }))}
        label="Navegação principal"
        onSelect={() => {}}
      />,
    )

    const buttons = screen.getAllByRole('button')
    expect(buttons.map((button) => button.textContent)).toEqual([
      'Hoje',
      'Calendário',
      'Progresso',
      'Perfil',
    ])
    expect(buttons.every((button) => button.children.length === 1)).toBe(true)
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

  it.each(['dark', 'light'])('keeps canvas label roles on hover and press in %s mode', (mode) => {
    document.documentElement.dataset.theme = mode
    render(
      <BottomTabBar
        activeId="calendario"
        items={Object.entries(labels).map(([id, label]) => ({ id, label }))}
        label="Navegação principal"
        onSelect={() => {}}
      />,
    )

    const activeLabel = screen.getByText('Calendário')
    const inactiveLabel = screen.getByText('Hoje')
    expect(activeLabel).toHaveClass('text-[var(--primary-soft)]')
    expect(activeLabel).not.toHaveClass('group-hover:text-[var(--primary-text)]', 'group-active:text-[var(--primary-text)]')
    expect(inactiveLabel).toHaveClass('text-[var(--fg-3)]')
    expect(inactiveLabel).not.toHaveClass('group-hover:text-[var(--primary-text)]')
    delete document.documentElement.dataset.theme
  })

  it('contains the icon in a separate indicator inside the tab target', () => {
    render(
      <BottomTabBar
        activeId="hoje"
        items={[{ id: 'hoje', label: 'Hoje', icon: () => <svg data-testid="today-icon" /> }]}
        label="Navegação principal"
        onSelect={() => {}}
      />,
    )

    const iconLayer = screen.getByTestId('today-icon').parentElement
    expect(iconLayer).toHaveAttribute('data-tab-indicator')
    expect(iconLayer?.previousElementSibling).toBeNull()
  })

  it('leaves every label inactive for an unknown destination', () => {
    render(
      <BottomTabBar
        activeId="unknown"
        items={Object.entries(labels).map(([id, label]) => ({ id, label }))}
        label="Navegação principal"
        onSelect={() => {}}
      />,
    )

    expect(screen.getAllByRole('button').every(
      (button) => !button.hasAttribute('aria-current'),
    )).toBe(true)
    expect(screen.getAllByText(/Hoje|Calendário|Progresso|Perfil/).every(
      (label) => label.classList.contains('text-[var(--fg-3)]'),
    )).toBe(true)
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
