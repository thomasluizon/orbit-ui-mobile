import { bundleGeometry } from '@/__tests__/support/profile-settings-browser'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { createTranslator } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { afterAll, afterEach, beforeAll, describe, it, expect, vi } from 'vitest'
import { act, render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { expectSmallSheetActions, sheetSlotButtons } from '@/__tests__/support/sheet-slots'

vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

import {
  MoveParentOverlay,
  type MoveParentOption,
} from '@/components/habits/habit-list/move-parent-overlay'

function makeOption(overrides: Partial<MoveParentOption>): MoveParentOption {
  return {
    id: 'option',
    label: 'Option',
    emoji: '⭐️',
    depth: 0,
    childCount: 0,
    disabled: false,
    reason: null,
    ...overrides,
  }
}

function renderOverlay(
  options: MoveParentOption[],
  onSelectOption = vi.fn(),
  selectedMoveParentId: string | null = null,
  overrides: Partial<Parameters<typeof MoveParentOverlay>[0]> = {},
) {
  const props: Parameters<typeof MoveParentOverlay>[0] = {
    t: (key) => key, open: true, isMoving: false, movingHabitTitle: 'Exercise', movingHabitParentId: null,
    options, selectedMoveParentId, canSubmit: false, onClose: vi.fn(), onConfirm: vi.fn(), onSelectOption, ...overrides,
  }
  return { ...render(<MoveParentOverlay {...props} />), onSelectOption, props }
}

describe('MoveParentOverlay', () => {
  it('uses small intrinsic Cancel then Move footer actions', () => {
    renderOverlay([])
    expect(sheetSlotButtons('sheet-actions')).toEqual(['common.cancel', 'habits.moveParent.confirm'])
    expectSmallSheetActions()
  })
  it('renders a selectable root row and the destinations eyebrow', () => {
    const { onSelectOption } = renderOverlay(
      [
        makeOption({ id: null, label: 'habits.moveParent.toRoot' }),
        makeOption({ id: 'parent', label: 'Parent' }),
      ],
      vi.fn(),
      'parent',
    )

    expect(screen.getByText('habits.moveParent.destinations')).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', {
      name: 'habits.moveParent.destinations',
    })).toBeInTheDocument()

    const rootRow = screen.getByText('habits.moveParent.toRoot').closest('button')
    if (!rootRow) throw new Error('Expected the root row button')
    fireEvent.click(rootRow)
    expect(onSelectOption).toHaveBeenCalledWith(null)
  })

  it('shows the child count for a habit with children', () => {
    renderOverlay([
      makeOption({ id: null, label: 'habits.moveParent.toRoot' }),
      makeOption({ id: 'parent', label: 'Parent', childCount: 12 }),
    ])

    const parentRow = screen.getByRole('radio', { name: /^Parent(?:,|$)/ }).parentElement
    if (!parentRow) throw new Error('Expected the parent row')
    expect(within(parentRow).getByText('12')).toBeInTheDocument()
  })

  it('reveals the search field only when destinations exceed eight', () => {
    renderOverlay([
      makeOption({ id: null, label: 'habits.moveParent.toRoot' }),
      makeOption({ id: 'parent', label: 'Parent' }),
    ])
    expect(
      screen.queryByPlaceholderText('habits.moveParent.searchPlaceholder'),
    ).not.toBeInTheDocument()

    render(<div />)

    renderOverlay([
      makeOption({ id: null, label: 'habits.moveParent.toRoot' }),
      ...Array.from({ length: 9 }, (_, index) =>
        makeOption({ id: `d${index}`, label: `Zeta ${index}` }),
      ),
    ])
    expect(
      screen.getByPlaceholderText('habits.moveParent.searchPlaceholder'),
    ).toBeInTheDocument()
  })

  it('filters the tree by search while keeping the ancestor chain', () => {
    renderOverlay([
      makeOption({ id: null, label: 'habits.moveParent.toRoot' }),
      makeOption({ id: 'alpha', label: 'Alpha', depth: 0, childCount: 1 }),
      makeOption({ id: 'bravo', label: 'Bravo', depth: 1 }),
      ...Array.from({ length: 9 }, (_, index) =>
        makeOption({ id: `zeta${index}`, label: `Zeta ${index}` }),
      ),
    ])

    const search = screen.getByPlaceholderText('habits.moveParent.searchPlaceholder')
    fireEvent.change(search, { target: { value: 'bravo' } })

    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Bravo')).toBeInTheDocument()
    expect(screen.queryByText('Zeta 0')).not.toBeInTheDocument()
  })

  it('keeps arrow navigation in rendered order after filtered rows return', async () => {
    const { onSelectOption } = renderOverlay([
      makeOption({ id: null, label: 'habits.moveParent.toRoot' }),
      ...Array.from({ length: 9 }, (_, index) =>
        makeOption({ id: `zeta${index}`, label: `Zeta ${index}` }),
      ),
    ])
    const search = screen.getByPlaceholderText('habits.moveParent.searchPlaceholder')

    fireEvent.change(search, { target: { value: 'Zeta 5' } })
    fireEvent.change(search, { target: { value: '' } })
    const zetaFour = screen.getByRole('radio', { name: /Zeta 4/ })
    const zetaFive = screen.getByRole('radio', { name: /Zeta 5/ })
    zetaFour.focus()
    fireEvent.keyDown(zetaFour, { key: 'ArrowDown' })

    await waitFor(() => expect(zetaFive).toHaveFocus())
    expect(onSelectOption).toHaveBeenLastCalledWith('zeta5')
  })

  it('skips a disabled destination and never gives it a tab stop', async () => {
    const { onSelectOption } = renderOverlay([
      makeOption({ id: null, label: 'Top level' }),
      makeOption({ id: 'alpha', label: 'Alpha', disabled: true, reason: 'Too deep' }),
      makeOption({ id: 'bravo', label: 'Bravo' }),
    ])
    const root = screen.getByRole('radio', { name: /Top level/ })
    const blocked = screen.getByRole('radio', { name: /Alpha/ })
    const bravo = screen.getByRole('radio', { name: /Bravo/ })

    expect([root.tabIndex, blocked.tabIndex, bravo.tabIndex]).toEqual([0, -1, -1])
    root.focus()
    fireEvent.keyDown(root, { key: 'ArrowDown' })

    await waitFor(() => expect(bravo).toHaveFocus())
    expect(onSelectOption).toHaveBeenCalledExactlyOnceWith('bravo')
  })

  it('wraps arrow navigation between Top level and the first destination', async () => {
    const { onSelectOption } = renderOverlay([
      makeOption({ id: null, label: 'Top level' }),
      makeOption({ id: 'alpha', label: 'Alpha' }),
    ])
    const root = screen.getByRole('radio', { name: /Top level/ })
    const firstDestination = screen.getByRole('radio', { name: /Alpha/ })

    root.focus()
    fireEvent.keyDown(root, { key: 'ArrowDown' })
    await waitFor(() => expect(firstDestination).toHaveFocus())
    expect(onSelectOption).toHaveBeenLastCalledWith('alpha')

    fireEvent.keyDown(firstDestination, { key: 'ArrowDown' })
    await waitFor(() => expect(root).toHaveFocus())
  })

  it('keeps the Move label on the busy confirm button while the move runs', () => {
    render(
      <MoveParentOverlay
        t={(key) => key}
        open
        isMoving
        movingHabitTitle="Exercise"
        movingHabitParentId={null}
        options={[makeOption({ id: 'root-a', label: 'Morning' })]}
        selectedMoveParentId="root-a"
        canSubmit={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        onSelectOption={vi.fn()}
      />,
    )

    const actions = document.querySelector<HTMLElement>('[data-slot="sheet-actions"]')!
    expect(within(actions).getByRole('button', { name: 'habits.moveParent.confirm' })).toHaveAttribute('aria-busy', 'true')
    expect(actions.textContent).not.toContain('habits.moveParent.moving')
  })
})


describe('move picker initial positioning', () => {
  afterEach(() => vi.restoreAllMocks())

  it.each([false, true])('positions once at the disabled current parent after loading=%s', (loading) => {
    vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (this: HTMLElement) {
      return this.dataset.currentParent === 'true' ? 640 : 0
    })
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(64)
    const options = [
      makeOption({ id: null, label: 'Top level', disabled: false }),
      ...Array.from({ length: 12 }, (_, index) => makeOption({ id: `p${index}`, label: `Parent ${index}`,
        disabled: index === 9, reason: index === 9 ? 'This habit is already here' : null })),
    ]
    const rendered = renderOverlay(loading ? [] : options, vi.fn(), 'p9', { movingHabitParentId: loading ? undefined : 'p9', inventoryState: loading ? 'loading' : undefined })
    if (loading) {
      expect(document.querySelector('[data-slot="move-destinations-scroll"]')).toBeNull()
      rendered.rerender(<MoveParentOverlay {...rendered.props} options={options} inventoryState={undefined} movingHabitParentId="p9" />)
    }
    const scroll = document.querySelector<HTMLElement>('[data-slot="move-destinations-scroll"]')!
    expect(scroll.scrollTop).toBe(576)
    const current = screen.getByRole('radio', { name: /Parent 9/ })
    expect(current).toHaveAttribute('aria-disabled', 'true')
    expect(current).toHaveAttribute('aria-checked', 'false')
    fireEvent.change(screen.getByPlaceholderText('habits.moveParent.searchPlaceholder'), { target: { value: 'Parent' } })
    expect(scroll.scrollTop).toBe(0)
  })

  it('opens at zero for root and omits the Current tag for mixed parents', () => {
    renderOverlay([makeOption({ id: null, label: 'Top level' }), makeOption({ id: 'p', label: 'Parent' })],
      vi.fn(), null, { movingHabitParentId: undefined, movingHabitCount: 12, error: '2 habits did not move' })
    expect(document.querySelector<HTMLElement>('[data-slot="move-destinations-scroll"]')!.scrollTop).toBe(0)
    expect(screen.queryByText('habits.moveParent.currentParent')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog')).toHaveAccessibleName('habits.moveParent.titleMany')
    expect(screen.queryByText('habits.moveParent.descriptionMany')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('2 habits did not move')
  })
})


describe('bulk move footer geometry in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  let pickerScript: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
    pickerScript = bundleGeometry(`
      import React, { useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import { NextIntlClientProvider, useTranslations } from 'next-intl';
      import en from '../../packages/shared/src/i18n/en.json';
      import ptBR from '../../packages/shared/src/i18n/pt-BR.json';
      import { MoveParentOverlay } from './components/habits/habit-list/move-parent-overlay';
      const root = document.getElementById('root');
      const parent = root.dataset.parent || null;
      const locale = root.dataset.locale;
      function Picker() {
        const t = useTranslations();
        const [selected, setSelected] = useState(parent);
        const [error, setError] = useState(null);
        const options = [{ id: null, label: t('habits.moveParent.toRoot'), emoji: null, depth: 0,
          childCount: 0, disabled: parent === null, reason: parent === null ? t('habits.moveParent.invalidCurrentParent') : null },
          ...Array.from({ length: 40 }, (_, index) => ({ id: 'p' + index, label: 'Parent ' + index,
            emoji: null, depth: index === 19 ? 1 : index === 20 ? 2 : 0, childCount: 0,
            disabled: 'p' + index === parent, reason: 'p' + index === parent ? t('habits.moveParent.invalidCurrentParent') : null }))];
        return <MoveParentOverlay t={t} open isMoving={false} movingHabitTitle="Reading"
          movingHabitCount={root.dataset.count ? Number(root.dataset.count) : undefined}
          movingHabitParentId={parent} selectedMoveParentId={selected} options={options}
          error={error} canSubmit={selected !== parent} onClose={() => {}}
          onConfirm={async () => { setError(t('habits.moveParent.errorPartial')); return false; }} onSelectOption={setSelected} />;
      }
      createRoot(root).render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ptBR} timeZone="UTC"><Picker /></NextIntlClientProvider>);
    `, {
      '@/components/ui/update-available-banner': 'export const UpdateAvailableBanner = () => null;',
      '@/components/ui/app-toast-host': 'export const AppToastHost = () => null;',
    })
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(['dark', 'light'].flatMap((mode) => ['en', 'pt-BR'].flatMap((locale) =>
    ['p20', ''].map((parent) => ({ mode, locale, parent })),
  )))('opens the complete $locale picker at $parent in $mode with focus and position intact', async ({ mode, locale, parent }) => {
    const page = await browser.newPage({ viewport: { width: 412, height: 915 }, reducedMotion: 'reduce' })
    try {
      const declarations = Object.entries(resolveWebThemeVariables('orange', mode as 'dark' | 'light'))
        .map(([key, value]) => `${key}:${value};`).join('')
      await page.setContent(`<style>${stylesheet}:root{${declarations}}</style><div id="root" data-parent="${parent}" data-locale="${locale}"></div>`)
      await page.addScriptTag({ content: pickerScript })
      const dialog = page.getByRole('dialog')
      await dialog.waitFor({ state: 'visible' })
      const geometry = await dialog.evaluate((element) => {
        const scroll = element.querySelector<HTMLElement>('[data-slot="move-destinations-scroll"]')!
        const current = scroll.querySelector<HTMLElement>('[data-current-parent="true"]')
        return { offset: scroll.scrollTop, height: scroll.clientHeight, contentHeight: scroll.scrollHeight,
          scroll: scroll.getBoundingClientRect().toJSON(), current: current?.getBoundingClientRect().toJSON(),
          focusInside: element.contains(document.activeElement) }
      })
      expect(geometry.focusInside).toBe(true)
      expect(geometry.contentHeight).toBeGreaterThan(geometry.height)
      if (parent) {
        expect(geometry.offset).toBeGreaterThan(0)
        expect(geometry.current!.top).toBeGreaterThan(geometry.scroll.top)
        expect(geometry.current!.bottom).toBeLessThanOrEqual(geometry.scroll.bottom)
      } else expect(geometry.offset).toBe(0)
    } finally { await page.close() }
  })

  it.each(['dark', 'light'].flatMap((mode) => ['en', 'pt-BR'].map((locale) => ({ mode, locale }))))(
    'keeps the empty live region out of the $locale picker spacing in $mode', async ({ mode, locale }) => {
      const page = await browser.newPage({ viewport: { width: 412, height: 915 }, reducedMotion: 'reduce' })
      try {
        const declarations = Object.entries(resolveWebThemeVariables('orange', mode as 'dark' | 'light'))
          .map(([key, value]) => `${key}:${value};`).join('')
        await page.setContent(`<style>${stylesheet}:root{${declarations}}</style><div id="root" data-parent="p20" data-locale="${locale}"></div>`)
        await page.addScriptTag({ content: pickerScript })
        const dialog = page.getByRole('dialog')
        await dialog.waitFor({ state: 'visible' })
        const status = dialog.getByRole('status')
        const measure = () => dialog.evaluate((element) => {
          const group = element.querySelector('[role="radiogroup"]')!
          const status = element.querySelector('[role="status"]')!
          const content = status.parentElement!
          return { trailingSpace: content.getBoundingClientRect().bottom - group.getBoundingClientRect().bottom,
            groupTop: group.getBoundingClientRect().top, contentTop: content.getBoundingClientRect().top,
            statusPosition: getComputedStyle(status).position }
        })
        const before = await measure()
        expect(before.trailingSpace).toBe(0)
        expect(await status.textContent()).toBe('')
        await status.evaluate((element) => { element.setAttribute('data-original-region', 'true') })
        await dialog.getByRole('radio', { name: /^Parent 21/ }).click()
        await dialog.getByRole('button', { name: locale === 'en' ? 'Move' : 'Mover', exact: true }).click()
        await expect.poll(() => status.textContent()).toBe((locale === 'en' ? en : ptBR).habits.moveParent.errorPartial)
        expect(await status.getAttribute('data-original-region')).toBe('true')
        const after = await measure()
        expect(after.statusPosition).toBe('static')
        expect(after.groupTop).toBeCloseTo(before.groupTop, 0)
        expect(after.contentTop).toBeCloseTo(before.contentTop, 0)
        expect(after.trailingSpace).toBeGreaterThan(8)
      } finally { await page.close() }
    },
  )

  it.each([320, 412].flatMap((width) => ['en', 'pt-BR'].flatMap((locale) =>
    ['dark', 'light'].flatMap((mode) => [1, 12, 100].map((count) => ({ width, locale, mode, count }))),
  )))('keeps $locale count $count on one line at $width in $mode', async ({ width, locale, mode, count }) => {
    const translate = createTranslator({ locale, messages: locale === 'en' ? en : ptBR })
    renderOverlay([], vi.fn(), null, { movingHabitCount: count, t: (key, values) => translate(key as Parameters<typeof translate>[0], values) })
    const actions = document.querySelector<HTMLElement>('[data-slot="sheet-actions"]')!
    const expected = locale === 'en' ? 'Move' : 'Mover'
    const title = locale === 'en' ? `Move ${count} habit${count === 1 ? '' : 's'}` : `Mover ${count} hábito${count === 1 ? '' : 's'}`
    expect(screen.getByRole('dialog')).toHaveAccessibleName(title)
    expect(actions.textContent).toContain(expected)
    const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'reduce' })
    try {
      const declarations = Object.entries(resolveWebThemeVariables('orange', mode as 'dark' | 'light'))
        .map(([key, value]) => `${key}:${value};`).join('')
      await page.setContent(`<style>${stylesheet}:root{${declarations}}</style><div id="root" data-locale="${locale}" data-count="${count}"></div>`)
      await page.addScriptTag({ content: pickerScript })
      const button = page.getByRole('button', { name: expected, exact: true })
      await button.waitFor({ state: 'visible' })
      const heading = page.getByRole('heading', { name: title, exact: true })
      const titleGeometry = await heading.evaluate((element) => {
        const range = document.createRange()
        range.selectNodeContents(element)
        const text = range.getBoundingClientRect()
        const bounds = element.getBoundingClientRect()
        return { lines: range.getClientRects().length, textRight: text.right, right: bounds.right }
      })
      expect(titleGeometry.lines).toBe(1)
      expect(titleGeometry.textRight).toBeLessThanOrEqual(titleGeometry.right)
      const dimensions = await button.evaluate((element) => ({
        label: element.querySelector('span')!.getBoundingClientRect().toJSON(),
        whitespace: getComputedStyle(element).whiteSpace,
        bounds: element.getBoundingClientRect().toJSON(),
      }))
      expect(dimensions.label.left).toBeGreaterThan(dimensions.bounds.left)
      expect(dimensions.label.right).toBeLessThan(dimensions.bounds.right)
      expect(dimensions.label.height).toBeLessThan(dimensions.bounds.height)
      expect(dimensions.whitespace).toBe('nowrap')
      expect(dimensions.bounds.right).toBeLessThanOrEqual(width)
      expect(dimensions.bounds.left).toBeGreaterThanOrEqual(0)
    } finally { await page.close() }
  })
})


it('clears a picker search after successful confirmation before reopening', async () => {
  const onClose = vi.fn()
  renderOverlay(Array.from({ length: 12 }, (_, index) => makeOption({ id: `p${index}`, label: `Parent ${index}` })),
    vi.fn(), 'p1', { canSubmit: true, onConfirm: vi.fn().mockResolvedValue(true), onClose })
  const search = screen.getByPlaceholderText('habits.moveParent.searchPlaceholder')
  fireEvent.change(search, { target: { value: 'Parent 1' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'habits.moveParent.confirm' })) })
  expect(onClose).toHaveBeenCalledOnce()
  expect(search).toHaveValue('')
})


describe('disabled destination reason geometry', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  let pickerScript: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
    pickerScript = bundleGeometry(`
      import React, { useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import { NextIntlClientProvider, useTranslations } from 'next-intl';
      import en from '../../packages/shared/src/i18n/en.json';
      import ptBR from '../../packages/shared/src/i18n/pt-BR.json';
      import { MoveParentOverlay } from './components/habits/habit-list/move-parent-overlay';
      const root = document.getElementById('root');
      const locale = root.dataset.locale;
      function Picker() {
        const t = useTranslations();
        const [selected, setSelected] = useState('current');
        const options = [
          { id: null, label: t('habits.moveParent.toRoot'), emoji: null, depth: 0, childCount: 0, disabled: false, reason: null },
          { id: 'current', label: 'Current place for evening tasks', emoji: null, depth: 2, childCount: 12,
            disabled: true, reason: t('habits.moveParent.invalidCurrentParentMany') },
          { id: 'other', label: 'Another destination', emoji: null, depth: 0, childCount: 0, disabled: false, reason: null }
        ];
        return <MoveParentOverlay t={t} open isMoving={false} movingHabitTitle={null} movingHabitCount={12}
          movingHabitParentId="current" selectedMoveParentId={selected} options={options} canSubmit={selected !== 'current'}
          onClose={() => {}} onConfirm={async () => false} onSelectOption={setSelected} />;
      }
      createRoot(root).render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ptBR} timeZone="UTC"><Picker /></NextIntlClientProvider>);
    `, {
      '@/components/ui/update-available-banner': 'export const UpdateAvailableBanner = () => null;',
      '@/components/ui/app-toast-host': 'export const AppToastHost = () => null;',
    })
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  const cases = (['dark', 'light'] as const).flatMap((mode) =>
    (['en', 'pt-BR'] as const).map((locale) => ({ mode, locale, scale: 2 })),
  )
  it.each([...cases, { mode: 'dark' as const, locale: 'en' as const, scale: 1 }])(
    'keeps the complete $locale current-parent reason clear at 320/$scale in $mode', async ({ mode, locale, scale }) => {
      const page = await browser.newPage({ viewport: { width: 320, height: 915 }, reducedMotion: 'reduce' })
      try {
        const declarations = Object.entries(resolveWebThemeVariables('orange', mode))
          .map(([key, value]) => `${key}:${value};`).join('')
        await page.setContent(`<style>${stylesheet}:root{${declarations}}</style><div id="root" data-locale="${locale}"></div>`)
        await page.evaluate((scale) => { document.documentElement.style.fontSize = `${16 * scale}px` }, scale)
        await page.addScriptTag({ content: pickerScript })
        await (await import('@/__tests__/support/app-fonts')).loadAppFonts(page)
        const dialog = page.getByRole('dialog')
        await dialog.waitFor({ state: 'visible' })
        const words = locale === 'en' ? en : ptBR
        const reasonText = words.habits.moveParent.invalidCurrentParentMany
        const current = page.locator('[data-current-parent="true"]')
        const disclosure = current.getByRole('button', { name: 'Current place for evening tasks', exact: true })
        for (const expanded of [false, true]) {
          expect(await disclosure.getAttribute('aria-expanded')).toBe(String(expanded))
          const measured = await current.evaluate((row, reasonText) => {
            const rect = (element: Element) => {
              const { left, right, top, bottom, width, height } = element.getBoundingClientRect()
              return { left, right, top, bottom, width, height }
            }
            const reason = [...row.querySelectorAll('span')].find((span) => span.children.length === 0 && span.textContent === reasonText)!
            const title = row.querySelector<HTMLElement>('[data-personal-text]')!
            const count = [...row.querySelectorAll('span')].find((span) => span.textContent === '12')!
            const tag = [...row.querySelectorAll('span')].find((span) => span.classList.contains('uppercase'))!
            const glyph = row.querySelector('[data-slot="list-row-trailing"]')!
            const control = row.querySelector('button')!
            const range = document.createRange()
            range.selectNodeContents(reason)
            const fragments = [...range.getClientRects()].map(({ left, right, top, bottom, width, height }) => ({ left, right, top, bottom, width, height }))
            const center = rect(control)
            const inset = 4
            const hitPoints = [[center.left + inset, center.top + inset], [center.right - inset, center.top + inset],
              [center.left + inset, center.bottom - inset], [center.right - inset, center.bottom - inset]]
            return { reason: rect(reason), title: rect(title), fragments, content: reason.textContent, titleContent: title.textContent, expanded: title.hasAttribute('data-personal-text-expanded'),
              obstacles: [count, tag, glyph, control].map(rect), control: center,
              hits: hitPoints.map(([x, y]) => control.contains(document.elementFromPoint(x!, y!))),
              fontSize: parseFloat(getComputedStyle(title).fontSize), rootFontSize: getComputedStyle(document.documentElement).fontSize,
              row: rect(row), overflow: row.scrollWidth - row.clientWidth }
          }, reasonText)
          expect(measured.rootFontSize).toBe(`${16 * scale}px`)
          expect(measured.content).toBe(reasonText)
          expect(measured.titleContent).toBe('Current place for evening tasks')
          expect(measured.expanded).toBe(expanded)
          expect(measured.fragments.length).toBeGreaterThan(0)
          const collisions = measured.fragments.flatMap((fragment) => measured.obstacles.map((obstacle) =>
            fragment.left < obstacle.right && fragment.right > obstacle.left && fragment.top < obstacle.bottom && fragment.bottom > obstacle.top))
          expect(collisions, 'Reason text must clear count, current tag, radio and name disclosure').not.toContain(true)
          for (const fragment of measured.fragments) {
            expect(fragment.left).toBeGreaterThanOrEqual(measured.reason.left)
            expect(fragment.right).toBeLessThanOrEqual(measured.reason.right)
            expect(fragment.top).toBeGreaterThanOrEqual(measured.reason.top)
            expect(fragment.bottom).toBeLessThanOrEqual(measured.reason.bottom)
          }
          expect(measured.title.width).toBeGreaterThanOrEqual(Math.max(24, measured.fontSize))
          expect(measured.title.height).toBeGreaterThanOrEqual(measured.fontSize)
          expect(measured.reason.width).toBeGreaterThan(measured.title.width)
          expect(measured.overflow).toBeLessThanOrEqual(1)
          expect(measured.reason.top).toBeGreaterThanOrEqual(Math.max(...measured.obstacles.map((obstacle) => obstacle.bottom)))
          for (const target of [measured.control]) {
            expect(target.width).toBeGreaterThanOrEqual(48)
            expect(target.height).toBeGreaterThanOrEqual(48)
            expect(target.left).toBeGreaterThanOrEqual(0)
            expect(target.right).toBeLessThanOrEqual(320)
            expect(target.top).toBeGreaterThanOrEqual(0)
            expect(target.bottom).toBeLessThanOrEqual(915)
          }
          expect(measured.hits).toEqual([true, true, true, true])
          expect(await current.getByRole('radio').getAttribute('aria-disabled')).toBe('true')
          if (!expanded) await disclosure.click()
        }
        await dialog.getByRole('radio', { name: 'Another destination', exact: true }).click()
        expect(await dialog.getByRole('radio', { name: 'Another destination', exact: true }).getAttribute('aria-checked')).toBe('true')
      } finally { await page.close() }
    },
  )
})
