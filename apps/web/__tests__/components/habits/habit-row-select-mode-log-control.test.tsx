import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { HabitRow } from '@/components/habits/habit-row'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
afterEach(cleanup)

const rows = [
  { name: 'leaf', hasChildren: false, state: 'empty', completionStatusUnavailable: false },
  { name: 'done leaf', hasChildren: false, state: 'done', completionStatusUnavailable: false },
  { name: 'parent', hasChildren: true, state: 'empty', completionStatusUnavailable: false },
  { name: 'unavailable', hasChildren: false, state: 'empty', completionStatusUnavailable: true },
] as const

describe.each(rows)('habit row log control in select mode, $name', ({ hasChildren, state, completionStatusUnavailable }) => {
  function renderRow(selectMode: boolean) {
    const element = (mode: boolean) => <HabitRow habit={createMockHabit({ title: 'Read' })} state={state}
      hasChildren={hasChildren} childProgress={hasChildren ? { done: 1, total: 3 } : undefined}
      completionStatusUnavailable={completionStatusUnavailable} structuralColumn selectMode={mode}
      actions={{ onLog: vi.fn(), onUnlog: vi.fn(), onEdit: vi.fn(), onToggleSelection: vi.fn(), onEnterSelectMode: vi.fn() }} />
    const view = render(element(selectMode))
    return { view, element }
  }

  it('renders no log control or status glyph while select mode is on', () => {
    const { view } = renderRow(true)
    expect(view.container.querySelector('[data-habit-check]')).toBeNull()
    expect(view.container.querySelector('[data-habit-row-control="check"]')).toBeNull()
    expect(view.queryByRole('img')).toBeNull()
    expect(view.queryByRole('button', { name: /habits\.(logHabit|actions\.unlog)/ })).toBeNull()
    expect(view.container.querySelector('[data-habit-row-control="selection"]')).not.toBeNull()
  })

  it('keeps an inert, empty, aria-hidden 52px spacer so the strip keeps its 104px trailing width', () => {
    const { view, element } = renderRow(true)
    const slot = view.container.querySelector<HTMLElement>('[data-habit-row-trailing-slot]')
    expect(slot).not.toBeNull()
    expect(slot!.getAttribute('aria-hidden')).toBe('true')
    expect(slot!.style.width).toBe('52px')
    expect(slot!.style.minHeight).toBe('48px')
    expect(slot!.childNodes).toHaveLength(0)
    expect(slot!.hasAttribute('role')).toBe(false)
    expect(slot!.hasAttribute('tabindex')).toBe(false)
    view.rerender(element(false))
    expect(view.container.querySelector('[data-habit-row-trailing-slot]')).toBeNull()
  })

  it('restores the log control after select mode ends', () => {
    const { view, element } = renderRow(true)
    view.rerender(element(false))
    expect(view.container.querySelector('[data-habit-check]')).not.toBeNull()
    if (!completionStatusUnavailable) {
      expect(view.container.querySelector('[data-habit-row-control="check"]')).not.toBeNull()
    }
    view.rerender(element(true))
    expect(view.container.querySelector('[data-habit-check]')).toBeNull()
  })
})

const menuActions = { onLog: vi.fn(), onEdit: vi.fn(), onToggleSelection: vi.fn() }
const plainActions = { onLog: vi.fn(), onToggleSelection: vi.fn() }
const spacerCases = [
  { name: 'selection button and menu', structuralColumn: true, actions: menuActions, spacer: '52px', normalMenu: 1 },
  { name: 'selection button, no menu', structuralColumn: true, actions: plainActions, spacer: null, normalMenu: 0 },
  { name: 'no selection button, menu', structuralColumn: false, actions: menuActions, spacer: '104px', normalMenu: 1 },
  { name: 'no selection button, no menu', structuralColumn: false, actions: plainActions, spacer: '48px', normalMenu: 0 },
] as const

describe.each(spacerCases)('habit row selection spacer, $name', ({ structuralColumn, actions, spacer, normalMenu }) => {
  it('replaces exactly the width of the trailing group it hides', () => {
    const element = (mode: boolean) => <HabitRow habit={createMockHabit({ title: 'Read' })} hasChildren
      childProgress={{ done: 1, total: 3 }} structuralColumn={structuralColumn} selectMode={mode} actions={actions} />
    const view = render(element(false))
    expect(view.container.querySelectorAll('[data-habit-row-control="menu"]')).toHaveLength(normalMenu)
    view.rerender(element(true))
    const slots = view.container.querySelectorAll<HTMLElement>('[data-habit-row-trailing-slot]')
    expect(slots).toHaveLength(spacer ? 1 : 0)
    if (spacer) expect(slots[0]!.style.width).toBe(spacer)
    expect(view.container.querySelectorAll('[data-habit-row-control="selection"]')).toHaveLength(structuralColumn ? 1 : 0)
  })
})
