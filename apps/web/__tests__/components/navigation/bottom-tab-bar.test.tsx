import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { TAB_BAR_LABEL_MAX_FONT_SCALE } from '@orbit/shared/contracts/navigation'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { BottomTabBar } from '@/components/navigation/bottom-tab-bar'

const routes: Record<string, string> = { hoje: '/', calendario: '/calendar', progresso: '/progress', perfil: '/profile' }

const labels: Record<string, string> = {
  hoje: 'Hoje',
  calendario: 'Calendário',
  progresso: 'Progresso',
  perfil: 'Perfil',
}

describe('BottomTabBar', () => {
  it('centres navigation in the same capped column as the mobile tab bar', () => {
    render(<BottomTabBar activeId="hoje" items={Object.entries(labels).map(([id, label]) => ({ id, label, href: routes[id]! }))} label="Navegação principal" onSelect={() => {}} />)
    expect(screen.getByRole('navigation')).toHaveClass('mx-auto', 'w-full', 'max-w-[740px]')
  })

  it('renders exactly the four locked destinations', () => {
    render(
      <BottomTabBar
        activeId="hoje"
        items={Object.entries(labels).map(([id, label]) => ({ id, label, href: routes[id]! }))}
        label="Navegação principal"
        onSelect={() => {}}
      />,
    )

    const buttons = screen.getAllByRole('link')
    expect(buttons.map((button) => button.textContent)).toEqual([
      'Hoje',
      'Calendário',
      'Progresso',
      'Perfil',
    ])
    expect(buttons.every((button) => button.children.length === 1)).toBe(true)
    expect(buttons.map((button) => button.getAttribute('href'))).toEqual(Object.values(routes))
    expect(screen.queryByText('Astra')).not.toBeInTheDocument()
  })

  it('marks the active tab and reports the Portuguese destination id', () => {
    const onTab = vi.fn()
    render(
      <BottomTabBar
        activeId="perfil"
        items={Object.entries(labels).map(([id, label]) => ({ id, label, href: routes[id]! }))}
        label="Navegação principal"
        onSelect={onTab}
      />,
    )

    expect(screen.getByRole('link', { name: 'Perfil' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Hoje' })).not.toHaveAttribute('aria-current')
    fireEvent.click(screen.getByRole('link', { name: 'Calendário' }))
    expect(onTab).toHaveBeenCalledWith('calendario')
  })

  it.each(['dark', 'light'])('keeps canvas label roles on hover and press in %s mode', (mode) => {
    document.documentElement.dataset.theme = mode
    render(
      <BottomTabBar
        activeId="calendario"
        items={Object.entries(labels).map(([id, label]) => ({ id, label, href: routes[id]! }))}
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
        items={[{ id: 'hoje', href: '/', label: 'Hoje', icon: () => <svg data-testid="today-icon" /> }]}
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
        items={Object.entries(labels).map(([id, label]) => ({ id, label, href: routes[id]! }))}
        label="Navegação principal"
        onSelect={() => {}}
      />,
    )

    expect(screen.getAllByRole('link').every(
      (button) => !button.hasAttribute('aria-current'),
    )).toBe(true)
    expect(screen.getAllByText(/Hoje|Calendário|Progresso|Perfil/).every(
      (label) => label.classList.contains('text-[var(--fg-3)]'),
    )).toBe(true)
  })
})

it('keeps one current position when another or the current item is pressed', () => {
  const onSelect = vi.fn()
  const items = Object.entries(labels).map(([id, label]) => ({ id, label, href: routes[id]! }))
  render(<BottomTabBar items={items} activeId="calendario" onSelect={onSelect} label="Navigation" />)
  const buttons = screen.getAllByRole('link')
  expect(buttons.filter((button) => button.hasAttribute('aria-current'))).toEqual([buttons[1]])
  fireEvent.click(buttons[2]!)
  expect(onSelect).toHaveBeenCalledExactlyOnceWith('progresso')
  onSelect.mockClear()
  fireEvent.click(buttons[1]!)
  expect(onSelect).toHaveBeenCalledExactlyOnceWith('calendario')
  expect(buttons.filter((button) => button.hasAttribute('aria-current'))).toEqual([buttons[1]])
})

afterEach(() => {
  vi.useRealTimers()
  document.documentElement.style.removeProperty('font-size')
})

it.each([en, ptBR].flatMap((messages) => [320, 360, 384, 412].flatMap((width) => [1, 1.3, 1.6, 2].map((textScale) => ({ messages, width, textScale })))))(
  'reveals full-size destination content only above the cap at $width and $textScale in $messages.nav.calendar',
  ({ messages, width, textScale }) => {
    vi.useFakeTimers()
    document.documentElement.style.fontSize = `${16 * textScale}px`
    const onSelect = vi.fn()
    const destinations = ['today', 'calendar', 'progress', 'profile'] as const
    const view = render(<div style={{ width }}><BottomTabBar activeId="today" label={messages.nav.mainNavigation} onSelect={onSelect}
      items={destinations.map((id) => ({ id, href: `/${id}`, label: messages.nav[id], icon: () => <svg data-testid={`viewer-icon-${id}`} /> }))} /></div>)
    for (const id of destinations) {
      const tab = screen.getByRole('link', { name: messages.nav[id] })
      fireEvent.pointerDown(tab, { button: 0, pointerId: 1 })
      act(() => { vi.advanceTimersByTime(499) })
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
      act(() => { vi.advanceTimersByTime(1) })
      const viewer = screen.queryByRole('tooltip', { name: messages.nav[id] })
      if (textScale > TAB_BAR_LABEL_MAX_FONT_SCALE) {
        expect(viewer).toBeInTheDocument()
        expect(viewer).toHaveTextContent(messages.nav[id])
        expect(viewer!.querySelector('svg')).toBeInTheDocument()
        expect(view.container.contains(viewer)).toBe(false)
      } else expect(viewer).not.toBeInTheDocument()
      expect(onSelect).not.toHaveBeenCalled()
      fireEvent.pointerUp(tab, { pointerId: 1 })
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
      fireEvent.click(tab, { detail: 1 })
      if (textScale > TAB_BAR_LABEL_MAX_FONT_SCALE) expect(onSelect).not.toHaveBeenCalled()
      else expect(onSelect).toHaveBeenCalledExactlyOnceWith(id)
      onSelect.mockClear()
      fireEvent.pointerDown(tab, { button: 0, pointerId: 1 })
      act(() => { vi.advanceTimersByTime(100) })
      fireEvent.pointerUp(tab, { pointerId: 1 })
      fireEvent.click(tab, { detail: 1 })
      expect(onSelect).toHaveBeenCalledExactlyOnceWith(id)
      onSelect.mockClear()
    }
  },
)

it.each(['pointerCancel', 'pointerLeave', 'blur'] as const)('cancels pending and visible previews on %s', (eventName) => {
  vi.useFakeTimers()
  document.documentElement.style.fontSize = '32px'
  render(<BottomTabBar activeId="today" label="Navigation" onSelect={vi.fn()} items={[{ id: 'today', href: '/', label: 'Today' }]} />)
  const tab = screen.getByRole('link', { name: 'Today' })
  for (const duration of [100, 500]) {
    fireEvent.pointerDown(tab, { button: 0, pointerId: 1 })
    act(() => { vi.advanceTimersByTime(duration) })
    fireEvent[eventName](tab)
    act(() => { vi.advanceTimersByTime(500) })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  }
})
