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
