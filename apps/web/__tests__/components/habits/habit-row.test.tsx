import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

import { HabitRow } from '@/components/habits/habit-row'

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
})

describe('HabitRow check circle accessible name', () => {
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

  it('shows no hover feedback anywhere on a read-only row', () => {
    const panel = renderRowInPanel(
      <HabitRow
        habit={createMockHabit({ title: 'Meditate' })}
        readOnly
        hasChildren
        childProgress={{ done: 0, total: 1 }}
        actions={{ onDetail: vi.fn(), onToggleExpand: vi.fn(), onEdit: vi.fn() }}
      />,
    )
    const row = screen.getByTestId('habit-row')

    for (const target of [row, ...Array.from(row.querySelectorAll('button'))]) {
      fireEvent.mouseOver(target)
      expect(matchingHabitHoverBackgrounds(panel)).toEqual([])
      expect(matchingHabitHoverBackgrounds(target)).toEqual([])
      fireEvent.mouseOut(target)
    }
  })

  it('makes every read-only descendant inert for keyboard and synthetic activation', async () => {
    const user = userEvent.setup()
    const onDetail = vi.fn()
    const onLog = vi.fn()
    const onToggleExpand = vi.fn()
    const onEdit = vi.fn()
    render(
      <>
        <button type="button">Before</button>
        <HabitRow
          habit={createMockHabit({ title: 'Meditate' })}
          readOnly
          hasChildren
          childProgress={{ done: 0, total: 1 }}
          actions={{ onDetail, onLog, onToggleExpand, onEdit }}
        />
        <button type="button">After</button>
      </>,
    )

    const row = screen.getByTestId('habit-row')
    expect(row).toHaveAttribute('aria-disabled', 'true')
    expect(row).toHaveStyle({ opacity: '0.5' })
    expect(row).not.toHaveStyle({ pointerEvents: 'none' })

    const rowButtons = Array.from(row.querySelectorAll('button'))
    expect(rowButtons).toHaveLength(4)
    for (const button of rowButtons) {
      expect(button).toBeDisabled()
      fireEvent.keyDown(button, { key: 'Enter' })
      fireEvent.keyDown(button, { key: ' ' })
      fireEvent.click(button)
    }
    fireEvent.contextMenu(row)

    await user.click(screen.getByRole('button', { name: 'Before' }))
    await user.tab()
    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus()
    expect(onDetail).not.toHaveBeenCalled()
    expect(onLog).not.toHaveBeenCalled()
    expect(onToggleExpand).not.toHaveBeenCalled()
    expect(onEdit).not.toHaveBeenCalled()
    expect(screen.queryByRole('menu')).toBeNull()
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
    expect(row).toHaveStyle({ opacity: '1' })
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
