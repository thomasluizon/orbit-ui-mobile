import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from 'vitest'
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getTodayBoundary, computeHabitFutureHint } from '@orbit/shared/utils'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const localeMock = vi.hoisted(() => ({ rescheduleLabel: null as string | null }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key === 'habits.actions.reschedule' && localeMock.rescheduleLabel ? localeMock.rescheduleLabel : key }))

import { HabitRow } from '@/components/habits/habit-row'

describe('Hoje parent ring track', () => {
  it.each(['empty', 'overdue', 'bad'] as const)('uses the empty track for a %s parent, including selection mode', (state) => {
    for (const selectMode of [false, true]) {
      const { container, unmount } = render(<HabitRow habit={createMockHabit({ isBadHabit: state === 'bad' })}
        hasChildren childProgress={{ done: 1, total: 2 }} state={state} selectMode={selectMode} />)
      expect(container.querySelector('circle')).toHaveAttribute('stroke', 'var(--track-empty)')
      unmount()
    }
  })
})

describe('HabitRow overflow menus', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    localeMock.rescheduleLabel = null
  })

  it.each([['en', en.habits.actions.reschedule], ['pt-BR', ptBR.habits.actions.reschedule]])('shows the %s reschedule label on an overdue row', (_locale, label) => {
    localeMock.rescheduleLabel = label
    const onReschedule = vi.fn()
    render(<HabitRow habit={createMockHabit({ title: 'Run', isOverdue: true })} state="overdue" actions={{ onReschedule }} />)
    fireEvent.click(screen.getByRole('button', { name: 'habits.actions.more' }))
    const item = screen.getByRole('menuitem', { name: label })
    expect(label).toBe(_locale === 'en' ? 'Reschedule' : 'Reagendar')
    fireEvent.click(item)
    expect(onReschedule).toHaveBeenCalledOnce()
  })

  it.each([false, true])('connects the row overflow to its %s wide menu', async (wide) => {
    vi.stubGlobal('matchMedia', () => ({ matches: wide, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    render(<HabitRow habit={createMockHabit({ title: 'Read' })} actions={{ onEdit: vi.fn() }} />)
    const row = screen.getByTestId('habit-row')
    const button = within(row).getByRole('button', { name: 'habits.actions.more' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(button)
    expect(await screen.findByRole('menu')).toBeInTheDocument()
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(document.getElementById(button.getAttribute('aria-controls')!)).toHaveAttribute('role', 'menu')
  })

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

function matchingRowBackgrounds(element: Element, selectorMarker = 'data-habit-row'): string[] {
  const backgrounds: string[] = []

  function visitRules(rules: CSSRuleList): void {
    for (const rule of Array.from(rules)) {
      const styleRule = rule as CSSStyleRule
      if (typeof styleRule.selectorText === 'string') {
        if (
          styleRule.selectorText.includes(selectorMarker) &&
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

describe('HabitRow neutral metadata contrast', () => {
  const cases = [
    { label: 'parent count', value: '1/2', parent: true, exceptional: false },
    { label: 'single time', value: '21:00', parent: false, exceptional: false },
    { label: 'count with state words', value: '1/2', parent: true, exceptional: true },
    { label: 'time with state words', value: '21:00', parent: false, exceptional: true },
  ]
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => {
    browserLaunch = launch
    browser = await launch
  })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  const scenarios = (['dark', 'light'] as const).flatMap((mode) =>
    cases.flatMap((row) => [false, true].flatMap((child) =>
      [false, true].map((touch) => ({ mode, ...row, child, touch })))),
  )

  function renderMetadataRow({ label, value, parent, exceptional, child }: (typeof scenarios)[number]): HTMLElement {
    const { container } = render(<div className="habit-panel"><HabitRow
      habit={createMockHabit({ title: label, dueTime: '21:00' })}
      child={child} depth={child ? 1 : 0} hasChildren={parent}
      childProgress={parent ? { done: 1, total: 2 } : undefined}
      meta={exceptional ? [value, { kind: 'overdue', label: 'Overdue' }, { kind: 'bad', label: 'Recorded' }] : [value]} />
    </div>)
    return container
  }

  it.each(scenarios)('$mode $label, child=$child touch=$touch preserves rest and interaction contrast', async (scenario) => {
    const { mode, touch, exceptional } = scenario
    const variables = resolveWebThemeVariables('orange', mode)
    const container = renderMetadataRow(scenario)
    const page = await browser.newPage({ hasTouch: touch, isMobile: touch })
    try {
      const theme = Object.entries(variables).map(([name, color]) => `${name}:${color}`).join(';')
      await page.setContent(`<style>${stylesheet} :root { ${theme} }</style>${container.innerHTML}`)
      for (const state of ['rest', 'hover', 'press', 'release'] as const) {
        if (state === 'hover') await page.locator('[data-habit-row-body]').hover()
        if (state === 'press') await page.mouse.down()
        if (state === 'release') { await page.mouse.up(); await page.mouse.move(0, 0) }
        const interactive = state === 'press' || (state === 'hover' && !touch)
        await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState === 'finished'), undefined, { timeout: 2000 })
        const measured = await page.evaluate(({ interactive }) => {
          const panel = document.querySelector('.habit-panel')!
          const body = panel.querySelector('[data-habit-row-body]')!
          const metadata = body.querySelector('[data-habit-row-meta]')!
          const reference = document.createElement('span')
          panel.append(reference)
          const colorOf = (token: string) => {
            reference.style.color = `var(${token})`
            return getComputedStyle(reference).color
          }
          const layers = [getComputedStyle(document.body).backgroundColor, getComputedStyle(panel).backgroundColor]
          if (interactive) layers.push(getComputedStyle(body).backgroundColor)
          const result = {
            foreground: getComputedStyle(metadata).color,
            expectedForeground: colorOf(interactive ? '--fg-2' : '--fg-3'),
            separators: Array.from(metadata.querySelectorAll('span')).filter((span) => span.textContent === '·').map((span) => getComputedStyle(span).color),
            stateWords: Array.from(metadata.querySelectorAll('span')).filter((span) => span.textContent !== '·').map((span) => getComputedStyle(span).color),
            expectedStateWords: [colorOf('--status-overdue-text'), colorOf('--status-bad-text')],
            bodyFill: getComputedStyle(body).backgroundColor,
            expectedBodyFill: interactive ? getComputedStyle(panel).getPropertyValue('--bg-hover').trim() : 'rgba(0, 0, 0, 0)',
            transition: getComputedStyle(metadata).transitionProperty,
            duration: getComputedStyle(metadata).transitionDuration,
            fillDuration: getComputedStyle(body).transitionDuration,
            layers,
          }
          reference.remove()
          return result
        }, { interactive })
        expect(measured.foreground, state).toBe(measured.expectedForeground)
        expect(contrastOnSurface(measured.foreground, measured.layers), state).toBeGreaterThanOrEqual(4.5)
        expect(measured.bodyFill.replaceAll(' ', ''), state).toBe(measured.expectedBodyFill.replaceAll(' ', ''))
        expect(measured.transition).toBe('color')
        expect(measured.duration).toBe(measured.fillDuration)
        if (interactive && mode === 'dark') {
          expect(contrastOnSurface(variables['--fg-3']!, measured.layers)).toBeCloseTo(4.029, 3)
        }
        for (const separator of measured.separators) {
          expect(separator, state).toBe(measured.expectedForeground)
          expect(contrastOnSurface(separator, measured.layers), state).toBeGreaterThanOrEqual(4.5)
        }
        if (exceptional) expect(measured.stateWords, state).toEqual(measured.expectedStateWords)
      }
    } finally {
      await page.close()
    }
  })

  it('exposes the old foreground failure only after the hover layer is nested in the card', () => {
    const variables = resolveWebThemeVariables('orange', 'dark')
    const layers = [variables['--bg']!, variables['--bg-card']!, variables['--bg-hover']!]
    expect(contrastOnSurface(variables['--fg-3']!, layers)).toBeCloseTo(4.029, 3)
    expect(contrastOnSurface(variables['--fg-3']!, layers.slice(0, 2))).toBeGreaterThanOrEqual(4.5)
  })
})

describe('HabitRow canonical content', () => {
  it('keeps a child body on the shared leading edge', () => {
    render(<HabitRow habit={createMockHabit({ title: 'Child' })} child depth={1} />)
    const row = screen.getByTestId('habit-row')
    expect(row.firstElementChild).toHaveAttribute('data-habit-row-body')
    expect(row.style.paddingInlineStart).toBe('')
    expect(row.firstElementChild).toHaveStyle({ paddingInlineStart: '0px' })
  })

  it('keeps selection, disclosure, and a neutral checkbox on a parent row', () => {
    const onToggleExpand = vi.fn()
    const onToggleSelection = vi.fn()
    render(<HabitRow habit={createMockHabit({ title: 'Parent' })} structuralColumn selectMode selected
      hasChildren expanded childProgress={{ done: 1, total: 2 }} actions={{ onToggleExpand, onToggleSelection }} />)
    const row = screen.getByTestId('habit-row')
    expect(row.children[0]).toHaveAttribute('data-habit-row-body')
    expect(row.children[1]).toHaveAttribute('data-habit-row-control', 'selection')
    expect(row.children[2]).toHaveAttribute('data-habit-row-control', 'disclosure')
    expect(row.children[1]!.querySelector('span[aria-hidden="true"]')).toHaveStyle({ background: 'var(--status-done)' })
    expect(row.children[1]!.querySelector('[style*="--primary"]')).toBeNull()
    fireEvent.click(row.children[2]!)
    expect(onToggleExpand).toHaveBeenCalledOnce()
    expect(onToggleSelection).not.toHaveBeenCalled()
    expect(within(row).queryByRole('button', { name: /habits\.statusDot/ })).toBeNull()
    expect(within(row).getByRole('img', { name: 'habits.statusDot.empty, 1/2' })).toBeInTheDocument()
  })

  it('keeps selection and a named status glyph without a leaf gutter', () => {
    render(<HabitRow habit={createMockHabit({ title: 'Leaf' })} structuralColumn selectMode completionReadOnly />)
    const row = screen.getByTestId('habit-row')
    expect(row.children[0]).toHaveAttribute('data-habit-row-body')
    expect(row.children[1]).toHaveAttribute('data-habit-row-control', 'selection')
    expect(row.querySelector('[data-habit-row-control="disclosure"]')).toBeNull()
    expect(within(row).getByRole('img', { name: 'habits.statusDot.empty' })).toBeInTheDocument()
    expect(within(row).queryByTestId('habit-status-toggle')).toBeNull()
  })
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
      structuralColumn hasChildren hasSubHabits childProgress={{ done: 0, total: 1 }} actions={actions} />)

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
      structuralColumn completionReadOnly hasChildren expanded childProgress={{ done: 0, total: 1 }}
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
    expect(matchingRowBackgrounds(body)).toEqual(['var(--bg-hover)'])
    expect(matchingRowBackgrounds(panel)).toEqual([])
    expect(matchingRowBackgrounds(ring)).toEqual([])
  })

  it('lights an enabled ring locally without lighting the panel', () => {
    const panel = renderRowInPanel(
      <HabitRow habit={createMockHabit({ title: 'Meditate' })} actions={{ onDetail: vi.fn() }} />,
    )
    const ring = screen.getByTestId('habit-status-toggle')

    fireEvent.mouseOver(ring)

    expect(ring).toHaveAttribute('data-habit-row-control', 'ring')
    expect(matchingRowBackgrounds(ring)).toEqual(['var(--bg-hover)'])
    expect(matchingRowBackgrounds(panel)).toEqual([])
  })

  it('lights an enabled disclosure control locally without lighting the panel', () => {
    const panel = renderRowInPanel(
      <HabitRow
        habit={createMockHabit({ title: 'Meditate' })}
        structuralColumn
        hasChildren
        actions={{ onDetail: vi.fn(), onToggleExpand: vi.fn() }}
      />,
    )
    const disclosure = screen.getByRole('button', { name: 'common.expand' })

    fireEvent.mouseOver(disclosure)

    expect(disclosure).toHaveAttribute('data-habit-row-control', 'disclosure')
    expect(matchingRowBackgrounds(disclosure)).toEqual(['var(--bg-hover)'])
    expect(matchingRowBackgrounds(panel)).toEqual([])
  })

  it('lights an enabled selection control locally without lighting the panel', () => {
    const panel = renderRowInPanel(
      <HabitRow
        habit={createMockHabit({ title: 'Meditate' })}
        structuralColumn
        selectMode
        actions={{ onDetail: vi.fn(), onToggleSelection: vi.fn() }}
      />,
    )
    const selection = document.querySelector('[data-habit-row-control="selection"]')!

    fireEvent.mouseOver(selection)

    expect(selection).toHaveAttribute('data-habit-row-control', 'selection')
    expect(matchingRowBackgrounds(selection)).toEqual(['var(--bg-hover)'])
    expect(matchingRowBackgrounds(panel)).toEqual([])
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
        structuralColumn
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

describe('HabitRow large text placement', () => {
  afterEach(() => document.documentElement.style.removeProperty('font-size'))

  it.each([1, 2].flatMap((textScale) => [false, true].map((selectMode) => ({ textScale, selectMode }))))(
    'activates progress once at $textScale text scale, selecting=$selectMode', ({ textScale, selectMode }) => {
      document.documentElement.style.fontSize = `${16 * textScale}px`
      const onDetail = vi.fn()
      const onToggleSelection = vi.fn()
      render(<HabitRow habit={createMockHabit({ title: 'Parent' })} hasChildren
        childProgress={{ done: 0, total: 2 }} meta={['0 of 2']} selectMode={selectMode}
        actions={{ onDetail, onToggleSelection }} />)
      fireEvent.click(screen.getByText('0 of 2'))
      expect(selectMode ? onToggleSelection : onDetail).toHaveBeenCalledExactlyOnceWith()
      expect(selectMode ? onDetail : onToggleSelection).not.toHaveBeenCalled()
    },
  )

  it.each([1, 2].flatMap((textScale) => [false, true].map((selectMode) => ({ textScale, selectMode }))))('names progress and state words at $textScale text scale, selecting=$selectMode', ({ textScale, selectMode }) => {
    document.documentElement.style.fontSize = `${16 * textScale}px`
    render(<HabitRow habit={createMockHabit({ title: 'Parent' })} hasChildren
      childProgress={{ done: 0, total: 2 }} selectMode={selectMode}
      meta={['0 of 2', { kind: 'overdue', label: 'Overdue' }, { kind: 'bad', label: 'Bad' }]} />)
    expect(document.querySelector('[data-habit-row-body]')).toHaveAccessibleName(/Parent\s*0 of 2·Overdue·Bad/)
  })

  it('keeps producer-derived future hints hidden when parent progress moves', () => {
    document.documentElement.style.fontSize = '32px'
    const habit = createMockHabit({ title: 'Parent', dueDate: '2030-01-02' })
    const hint = computeHabitFutureHint(habit, '2030-01-01', (key) => key, 'en')!
    render(<HabitRow habit={habit} hasChildren childProgress={{ done: 0, total: 2 }}
      meta={['0 of 2', { kind: 'future', label: hint }]} />)
    expect(screen.getByText('0 of 2').textContent).toBe('0 of 2')
    expect(screen.getByText(hint).closest('[data-habit-row-body]')).not.toBeNull()
    expect(screen.getByText('0 of 2').textContent).not.toContain(hint)
  })

  it.each([false, true])('moves progress only above 130 percent text and restores it after resizing, selecting=%s', async (selectMode) => {
    document.documentElement.style.fontSize = '20.8px'
    render(<HabitRow habit={createMockHabit({ title: 'Parent' })} hasChildren childProgress={{ done: 0, total: 2 }} meta={['0 of 2']} selectMode={selectMode} />)
    const progress = screen.getByText('0 of 2')
    expect(progress.closest('[data-habit-row-body]')).not.toBeNull()
    expect(document.querySelector('[data-habit-row-heading]')).toBeNull()
    document.documentElement.style.fontSize = '21px'
    await waitFor(() => {
      expect(document.querySelector('[data-habit-row-heading]')).not.toBeNull()
      expect(screen.getByText('0 of 2').closest('[data-habit-row-heading]')).toBeNull()
      expect(screen.getByText('0 of 2').closest('[data-habit-row-body]')).not.toBeNull()
    })
    document.documentElement.style.fontSize = '16px'
    await waitFor(() => {
      expect(document.querySelector('[data-habit-row-heading]')).toBeNull()
      expect(screen.getByText('0 of 2').closest('[data-habit-row-body]')).not.toBeNull()
    })
  })
})
