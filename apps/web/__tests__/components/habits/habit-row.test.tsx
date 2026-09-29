import { describe, it, expect, vi, afterEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getTodayBoundary } from '@orbit/shared/utils'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

import { HabitRow } from '@/components/habits/habit-row'

describe('HabitRow overflow menus', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('matches the drawn menu for an overdue parent on a free plan', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    render(<HabitRow habit={createMockHabit({ title: 'Walk' })} state="overdue" hasSubHabits hasProAccess={false}
      actions={{ onAddSubHabit: vi.fn(), onMoveParent: vi.fn(), onSkip: vi.fn(), onReschedule: vi.fn(),
        onEdit: vi.fn(), onDuplicate: vi.fn(), onEnterSelectMode: vi.fn(), onDrillInto: vi.fn(), onDelete: vi.fn() }} />)
    fireEvent.click(screen.getByRole('button', { name: 'habits.actions.more' }))
    const items = await screen.findAllByRole('menuitem')
    expect(document.querySelector('.orbit-menu-panel')).toHaveAttribute('aria-label', 'Walk')
    expect(items.map((item) => item.textContent)).toEqual([
      'habits.actions.addSubHabitPro', 'habits.actions.moveUnder', 'habits.actions.skip',
      'habits.actions.reschedule', 'common.edit', 'habits.actions.duplicate',
      'common.select', 'habits.actions.openSubHabits', 'habits.actions.delete',
    ])
    expect(items.map((item) => item.querySelector('[data-icon]')?.getAttribute('data-icon'))).toEqual([
      'subtask', 'arrows-move', 'player-skip-forward', 'calendar-time', 'pencil',
      'copy', 'checkbox', 'list-tree', 'trash',
    ])
    expect(items.every((item) => item.querySelector('[data-icon] svg[width="20"][stroke-width="2"]'))).toBe(true)
    expect(items[8]).toHaveAttribute('data-destructive', 'true')
  })

  it('omits overdue and child actions when their row conditions do not apply', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    render(<HabitRow habit={createMockHabit({ title: 'Read' })} state="empty" hasProAccess
      actions={{ onAddSubHabit: vi.fn(), onReschedule: vi.fn(), onDrillInto: vi.fn(), onEnterSelectMode: vi.fn() }} />)
    fireEvent.click(screen.getByRole('button', { name: 'habits.actions.more' }))
    expect(await screen.findByRole('menuitem', { name: 'habits.actions.addSubHabit' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'habits.actions.reschedule' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'habits.actions.openSubHabits' })).toBeNull()
    expect(screen.getByRole('menuitem', { name: 'common.select' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'habits.actions.addSubHabit' })).not.toHaveTextContent('Pro')
    expect(screen.getByText('Read', { selector: '.orbit-sheet-title' })).toBeInTheDocument()
  })

  it('removes the menu while selecting rows', () => {
    render(<HabitRow habit={createMockHabit({ title: 'Walk' })} selectMode
      actions={{ onEnterSelectMode: vi.fn(), onEdit: vi.fn() }} />)
    expect(screen.queryByRole('button', { name: 'habits.actions.more' })).toBeNull()
  })

  it('keeps only the second row menu open when another row opens', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: true,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
    render(
      <div onPointerDown={(event) => event.stopPropagation()}>
        <HabitRow habit={createMockHabit({ id: 'first', title: 'Meditate' })} actions={{ onEdit: vi.fn() }} />
        <HabitRow habit={createMockHabit({ id: 'second', title: 'Run' })} actions={{ onDelete: vi.fn() }} />
      </div>,
    )

    const [firstTrigger, secondTrigger] = screen.getAllByRole('button', { name: 'habits.actions.more' })
    fireEvent.pointerDown(firstTrigger!)
    fireEvent.click(firstTrigger!)
    expect(await screen.findByRole('menuitem', { name: 'common.edit' })).toBeInTheDocument()

    fireEvent.pointerDown(secondTrigger!)
    fireEvent.click(secondTrigger!)
    expect(await screen.findByRole('menuitem', { name: 'habits.actions.delete' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'common.edit' })).toBeNull()
  })
})

const styleElement = document.createElement('style')
styleElement.textContent = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8')
document.head.append(styleElement)

function renderRowInPanel(row: ReactNode): HTMLElement {
  render(<div className="habit-panel">{row}</div>)
  return document.querySelector('.habit-panel')!
}

function matchingHabitHoverBackgrounds(element: Element): string[] {
  const backgrounds: string[] = []

  function visitRules(rules: CSSRuleList): void {
    for (const rule of Array.from(rules)) {
      const styleRule = rule as CSSStyleRule
      if (typeof styleRule.selectorText === 'string') {
        if (
          styleRule.selectorText.includes('data-habit-row') &&
          element.matches(styleRule.selectorText)
        ) {
          const background = styleRule.style.getPropertyValue('background')
          if (background) backgrounds.push(background)
        }
      } else if ('cssRules' in rule) {
        visitRules((rule as CSSGroupingRule).cssRules)
      }
    }
  }

  for (const stylesheet of Array.from(document.styleSheets)) {
    visitRules(stylesheet.cssRules)
  }
  return backgrounds
}

describe('HabitRow canonical content', () => {
  it('renders title and meta, not descriptions or tags', () => {
    render(
      <HabitRow
        habit={createMockHabit({
          title: 'Meditate',
          description: 'Ten minutes of breathing',
          tags: [{ id: '1', name: 'Evening', color: '#7c3aed' }],
        })}
        meta={['Daily']}
      />,
    )
    expect(screen.getByText('Meditate')).toBeDefined()
    expect(screen.getByText('Daily')).toBeDefined()
    expect(screen.queryByText('Ten minutes of breathing')).toBeNull()
    expect(screen.queryByText('Evening')).toBeNull()
  })

  it('uses the first uppercase letter when an emoji is missing', () => {
    render(<HabitRow habit={createMockHabit({ title: 'read', emoji: null })} />)
    expect(screen.getByText('R')).toBeDefined()
  })

  it('renders child geometry at display depth one', () => {
    render(<HabitRow habit={createMockHabit({ title: 'Child' })} child depth={1} />)
    expect(screen.getByTestId('habit-row')).toHaveAttribute('data-depth', '1')
  })

  it.each([
    { child: false, depth: 0, color: 'var(--fg-1)' },
    { child: true, depth: 1, color: 'var(--fg-2)' },
  ] as const)('keeps done and pending titles alike at depth $depth', ({ child, depth, color }) => {
    render(
      <div>
        <HabitRow habit={createMockHabit({ title: 'Pending' })} child={child} depth={depth} />
        <HabitRow habit={createMockHabit({ title: 'Done' })} child={child} depth={depth} state="done" />
      </div>,
    )
    const pending = screen.getByText('Pending')
    const done = screen.getByText('Done')
    expect(pending).toHaveStyle({ color })
    expect(done).toHaveStyle({ color })
    expect(pending.style.textDecorationLine).toBe('')
    expect(done.style.textDecorationLine).toBe('')
    expect(screen.getAllByTestId('habit-status-toggle')[1]).toHaveAttribute(
      'aria-label', 'habits.statusDot.done, habits.actions.unlog: Done',
    )
  })
})

describe('HabitRow check circle accessible name', () => {
  it('keeps management available ten days back while completion stays disabled', () => {
    const selectedDate = '2026-04-01'
    const today = '2026-04-11'
    const readOnly = getTodayBoundary(selectedDate, today) === 'read-only'
    const actions = {
      onEdit: vi.fn(), onDuplicate: vi.fn(), onMoveParent: vi.fn(),
      onAddSubHabit: vi.fn(), onEnterSelectMode: vi.fn(), onDrillInto: vi.fn(),
      onDelete: vi.fn(), onDetail: vi.fn(), onToggleExpand: vi.fn(),
      onLog: vi.fn(), onSkip: vi.fn(), onReschedule: vi.fn(),
    }
    render(<HabitRow habit={createMockHabit({ title: 'Read' })} completionReadOnly={readOnly}
      completionReason="Logging stops 7 days back."
      hasChildren hasSubHabits childProgress={{ done: 0, total: 1 }} actions={actions} />)

    fireEvent.click(screen.getByRole('button', { name: 'habits.actions.more' }))
    for (const label of ['habits.actions.addSubHabit', 'habits.actions.moveUnder', 'common.edit',
      'habits.actions.duplicate', 'common.select', 'habits.actions.openSubHabits', 'habits.actions.delete']) {
      expect(screen.getByRole('menuitem', { name: label })).toBeEnabled()
    }
    expect(screen.queryByRole('menuitem', { name: 'habits.actions.skip' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'habits.actions.reschedule' })).toBeNull()
    fireEvent.click(screen.getByRole('menuitem', { name: 'common.edit' }))
    expect(actions.onEdit).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Read' }))
    fireEvent.click(screen.getByRole('button', { name: 'common.expand' }))
    expect(actions.onDetail).toHaveBeenCalledOnce()
    expect(actions.onToggleExpand).toHaveBeenCalledOnce()
    const parentRing = screen.getByRole('button', { name: /habits.logHabit: Read/ })
    expect(parentRing).toHaveAttribute('aria-disabled', 'true')
    expect(parentRing).toHaveAccessibleDescription('Logging stops 7 days back.')
    fireEvent.click(parentRing)
    expect(actions.onLog).not.toHaveBeenCalled()
  })

  it('keeps collapse available and disables a leaf checkmark on an old day', () => {
    const onToggleExpand = vi.fn()
    const { rerender } = render(<HabitRow habit={createMockHabit({ title: 'Read' })}
      completionReadOnly hasChildren expanded childProgress={{ done: 0, total: 1 }}
      actions={{ onToggleExpand }} />)
    fireEvent.click(screen.getByRole('button', { name: 'common.collapse' }))
    expect(onToggleExpand).toHaveBeenCalledOnce()
    rerender(<HabitRow habit={createMockHabit({ title: 'Write' })} completionReadOnly
      completionReason="Logging stops 7 days back." />)
    const checkmark = screen.getByTestId('habit-status-toggle')
    expect(checkmark).toHaveAttribute('aria-disabled', 'true')
    expect(checkmark).toHaveAccessibleDescription('Logging stops 7 days back.')
  })
  it('announces the unavailable day reason on a focusable child completion control', () => {
    const onLog = vi.fn()
    const { rerender } = render(<HabitRow habit={createMockHabit({ title: 'Read' })} child depth={1}
      completionReadOnly completionStatusUnavailable completionReason="We could not load this day's habits."
      actions={{ onLog }} />)
    const ring = screen.getByTestId('habit-status-toggle')
    expect(ring).toHaveAttribute('aria-disabled', 'true')
    expect(ring).toHaveAccessibleName('habits.logHabit: Read')
    expect(ring).toHaveAccessibleDescription("We could not load this day's habits.")
    const unavailable = ring.querySelector<HTMLElement>('[data-status="unavailable"]')
    expect(unavailable).toBeInTheDocument()
    expect(unavailable).toHaveClass('bg-[var(--bg-well)]')
    fireEvent.click(ring)
    expect(onLog).not.toHaveBeenCalled()
    rerender(<HabitRow habit={createMockHabit({ title: 'Read' })} child depth={1} actions={{ onLog }} />)
    const emptyRing = ring.querySelector<HTMLElement>('[data-status="empty"]')
    expect(emptyRing).toBeInTheDocument()
    expect(unavailable?.style.width).toBe(emptyRing?.style.width)
    expect(unavailable?.style.height).toBe(emptyRing?.style.height)
  })
  it('lights the panel only while the enabled body is hovered', () => {
    const panel = renderRowInPanel(
      <HabitRow
        habit={createMockHabit({ title: 'Meditate' })}
        actions={{ onDetail: vi.fn(), onEdit: vi.fn() }}
      />,
    )

    const body = screen.getByRole('button', { name: 'Meditate' })
    const ring = screen.getByTestId('habit-status-toggle')
    expect(body).toHaveAttribute('data-habit-row-body')
    expect(body).not.toHaveAttribute('data-habit-row-control')
    fireEvent.mouseOver(body)
    expect(matchingHabitHoverBackgrounds(panel)).toEqual(['var(--bg-hover)'])
    expect(matchingHabitHoverBackgrounds(ring)).toEqual([])
  })

  it('lights an enabled ring locally without lighting the panel', () => {
    const panel = renderRowInPanel(
      <HabitRow habit={createMockHabit({ title: 'Meditate' })} actions={{ onDetail: vi.fn() }} />,
    )
    const ring = screen.getByTestId('habit-status-toggle')

    fireEvent.mouseOver(ring)

    expect(ring).toHaveAttribute('data-habit-row-control', 'ring')
    expect(matchingHabitHoverBackgrounds(ring)).toEqual(['var(--bg-hover)'])
    expect(matchingHabitHoverBackgrounds(panel)).toEqual([])
  })

  it('lights an enabled disclosure control locally without lighting the panel', () => {
    const panel = renderRowInPanel(
      <HabitRow
        habit={createMockHabit({ title: 'Meditate' })}
        hasChildren
        actions={{ onDetail: vi.fn(), onToggleExpand: vi.fn() }}
      />,
    )
    const disclosure = screen.getByRole('button', { name: 'common.expand' })

    fireEvent.mouseOver(disclosure)

    expect(disclosure).toHaveAttribute('data-habit-row-control', 'disclosure')
    expect(matchingHabitHoverBackgrounds(disclosure)).toEqual(['var(--bg-hover)'])
    expect(matchingHabitHoverBackgrounds(panel)).toEqual([])
  })

  it('lights an enabled selection control locally without lighting the panel', () => {
    const panel = renderRowInPanel(
      <HabitRow
        habit={createMockHabit({ title: 'Meditate' })}
        selectMode
        actions={{ onDetail: vi.fn(), onToggleSelection: vi.fn() }}
      />,
    )
    const selection = document.querySelector('[data-habit-row-control="selection"]')!

    fireEvent.mouseOver(selection)

    expect(selection).toHaveAttribute('data-habit-row-control', 'selection')
    expect(matchingHabitHoverBackgrounds(selection)).toEqual(['var(--bg-hover)'])
    expect(matchingHabitHoverBackgrounds(panel)).toEqual([])
  })

  it('keeps future row navigation live while disabling only its completion ring', () => {
    const onDetail = vi.fn()
    const onLog = vi.fn()
    const onEdit = vi.fn()
    render(
      <HabitRow
        habit={createMockHabit({ title: 'Meditate' })}
        canLog={false}
        actions={{ onDetail, onLog, onEdit }}
      />,
    )

    const row = screen.getByTestId('habit-row')
    expect(row).not.toHaveAttribute('aria-disabled')
    fireEvent.click(screen.getByRole('button', { name: 'Meditate' }))
    expect(onDetail).toHaveBeenCalledOnce()
    expect(screen.getByTestId('habit-status-toggle')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'habits.actions.more' })).toBeEnabled()
  })

  it('keeps normal row descendants enabled and operable', () => {
    const onDetail = vi.fn()
    const onLog = vi.fn()
    const onToggleExpand = vi.fn()
    const onEdit = vi.fn()
    render(
      <HabitRow
        habit={createMockHabit({ title: 'Meditate' })}
        hasChildren
        childProgress={{ done: 0, total: 1 }}
        actions={{ onDetail, onLog, onToggleExpand, onEdit }}
      />,
    )

    const row = screen.getByTestId('habit-row')
    const rowButtons = Array.from(row.querySelectorAll('button'))
    expect(rowButtons).toHaveLength(4)
    for (const button of rowButtons) expect(button).not.toBeDisabled()

    fireEvent.click(rowButtons[0]!)
    fireEvent.click(rowButtons[1]!)
    fireEvent.click(rowButtons[2]!)
    fireEvent.click(rowButtons[3]!)
    expect(onToggleExpand).toHaveBeenCalledOnce()
    expect(onDetail).toHaveBeenCalledOnce()
    expect(onLog).toHaveBeenCalledOnce()
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  it('announces the state and log action when loggable', () => {
    render(<HabitRow habit={createMockHabit({ title: 'Meditate' })} />)
    expect(screen.getByTestId('habit-status-toggle')).toHaveAttribute('aria-label', 'habits.statusDot.empty, habits.logHabit: Meditate')
    expect(screen.getByTestId('habit-status-toggle')).not.toHaveAttribute('aria-disabled')
  })

  it('announces the unlog action when done', () => {
    render(<HabitRow habit={createMockHabit({ title: 'Meditate' })} state="done" />)
    expect(screen.getByTestId('habit-status-toggle')).toHaveAttribute('aria-label', 'habits.statusDot.done, habits.actions.unlog: Meditate')
  })

  it('announces parent progress and the parent action', () => {
    render(
      <HabitRow
        habit={createMockHabit({ title: 'Morning routine' })}
        hasChildren
        childProgress={{ done: 1, total: 2 }}
      />,
    )
    expect(
      screen.getByRole('button', {
        name: 'habits.statusDot.empty, habits.logHabit: Morning routine, 1/2',
      }),
    ).toBeInTheDocument()
  })

  it('logs a parent with open children directly from its ring', () => {
    const onLog = vi.fn()
    render(
      <HabitRow
        habit={createMockHabit({ title: 'Morning routine' })}
        hasChildren
        childProgress={{ done: 1, total: 2 }}
        actions={{ onLog }}
      />,
    )

    screen.getByRole('button', {
      name: 'habits.statusDot.empty, habits.logHabit: Morning routine, 1/2',
    }).click()
    expect(onLog).toHaveBeenCalledOnce()
  })
})
