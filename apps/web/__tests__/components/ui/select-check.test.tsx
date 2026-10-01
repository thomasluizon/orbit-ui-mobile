import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { RadioGroup } from '@/components/ui/radio-row'
import { RadioRow } from '@/components/ui/select-check'

function RadioRows({ onChange }: Readonly<{ onChange: (value: string) => void }>) {
  const [value, setValue] = useState('first')
  const select = (nextValue: string) => {
    setValue(nextValue)
    onChange(nextValue)
  }

  return (
    <RadioGroup aria-label="Cadence">
      <RadioRow label="First" selected={value === 'first'} onSelect={() => select('first')} />
      <RadioRow label="Second" selected={value === 'second'} onSelect={() => select('second')} />
      <RadioRow label="Third" selected={value === 'third'} onSelect={() => select('third')} />
      <RadioRow label="Last" selected={value === 'last'} onSelect={() => select('last')} />
    </RadioGroup>
  )
}

function CommitRows({
  onChange,
  onCommit,
}: Readonly<{ onChange: (value: string) => void; onCommit: () => void }>) {
  const [value, setValue] = useState('first')
  const select = (nextValue: string) => {
    setValue(nextValue)
    onChange(nextValue)
  }

  return (
    <RadioGroup aria-label="Cadence" onCommit={onCommit}>
      <RadioRow label="First" selected={value === 'first'} onSelect={() => select('first')} />
      <RadioRow label="Second" selected={value === 'second'} onSelect={() => select('second')} />
    </RadioGroup>
  )
}

describe('select-check RadioRow group', () => {
  it('uses the selected row tint and the empty track ring', () => {
    render(<RadioRows onChange={vi.fn()} />)
    const selected = screen.getByRole('radio', { name: 'First' })
    const unselected = screen.getByRole('radio', { name: 'Second' })

    expect(selected).toHaveClass('bg-[rgba(var(--primary-rgb),0.10)]')
    expect(selected).toHaveClass('hover:bg-[var(--bg-hover)]')
    expect(selected).toHaveStyle({ boxShadow: 'inset 0 0 0 1.5px var(--primary)' })
    expect(unselected.querySelector('[aria-hidden="true"]')).toHaveStyle({ boxShadow: 'inset 0 0 0 2px var(--track-empty)' })
  })

  it('keeps one tab stop, wraps, and follows selection with focus', () => {
    const onChange = vi.fn()
    render(<RadioRows onChange={onChange} />)
    const first = screen.getByRole('radio', { name: 'First' })
    const second = screen.getByRole('radio', { name: 'Second' })
    const third = screen.getByRole('radio', { name: 'Third' })
    const last = screen.getByRole('radio', { name: 'Last' })

    expect([first, second, third, last].map((option) => option.tabIndex)).toEqual([0, -1, -1, -1])
    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowDown' })
    expect(onChange).toHaveBeenLastCalledWith('second')
    expect(second).toHaveFocus()

    fireEvent.keyDown(second, { key: 'End' })
    expect(onChange).toHaveBeenLastCalledWith('last')
    expect(last).toHaveFocus()
    fireEvent.keyDown(last, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith('first')
    expect(first).toHaveFocus()
    fireEvent.keyDown(first, { key: 'ArrowUp' })
    expect(onChange).toHaveBeenLastCalledWith('last')
    expect(last).toHaveFocus()

    onChange.mockClear()
    fireEvent.keyDown(last, { key: 'End' })
    expect(onChange).not.toHaveBeenCalled()
    expect(last).toHaveFocus()
  })

  it('keeps pointer selection unchanged', () => {
    const onChange = vi.fn()
    render(<RadioRows onChange={onChange} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Third' }))
    expect(onChange).toHaveBeenCalledExactlyOnceWith('third')
  })

  it('changes the value on an arrow key without committing the group', () => {
    const onChange = vi.fn()
    const onCommit = vi.fn()
    render(<CommitRows onChange={onChange} onCommit={onCommit} />)
    const first = screen.getByRole('radio', { name: 'First' })

    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowDown' })

    expect(onChange).toHaveBeenCalledExactlyOnceWith('second')
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('commits without selecting again when a press lands on the focused row', () => {
    const onChange = vi.fn()
    const onCommit = vi.fn()
    render(<CommitRows onChange={onChange} onCommit={onCommit} />)
    const first = screen.getByRole('radio', { name: 'First' })

    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowDown' })
    fireEvent.click(screen.getByRole('radio', { name: 'Second' }))

    expect(onChange).toHaveBeenCalledExactlyOnceWith('second')
    expect(onCommit).toHaveBeenCalledOnce()
  })

  it('commits the group on Enter, Space and a pointer press alike', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const onCommit = vi.fn()
    render(<CommitRows onChange={onChange} onCommit={onCommit} />)
    const first = screen.getByRole('radio', { name: 'First' })

    first.focus()
    await user.keyboard('{Enter}')
    expect(onCommit).toHaveBeenCalledOnce()

    await user.keyboard(' ')
    expect(onCommit).toHaveBeenCalledTimes(2)

    fireEvent.click(screen.getByRole('radio', { name: 'Second' }))
    expect(onCommit).toHaveBeenCalledTimes(3)
    expect(onChange).toHaveBeenLastCalledWith('second')
  })
})

describe('RadioRow description contrast', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(['dark', 'light'] as const)('keeps the web selection adapter readable in %s', async (mode) => {
    const theme = resolveWebThemeVariables('orange', mode)
    const variables = Object.entries(theme).map(([key, value]) => `${key}:${value}`).join(';')
    const { container } = render(<RadioGroup aria-label="Subjects">
      <RadioRow label="Selected" description="Selected details" selected onSelect={vi.fn()} />
      <RadioRow label="Unselected" description="Unselected details" onSelect={vi.fn()} />
      <RadioRow label="Disabled selected" description="Disabled selected details" selected disabled reason="Sending" />
      <RadioRow label="Disabled unselected" description="Disabled unselected details" disabled reason="Sending" />
    </RadioGroup>)
    const page = await browser.newPage()
    try {
      await page.setContent(`<style>${stylesheet}</style><div style="${variables};background:var(--bg)">${container.innerHTML}</div>`)
      const measured = await page.locator('[role="radio"]').evaluateAll((rows) => rows.map((row) => {
        const description = [...row.querySelectorAll('span')].find((span) => span.children.length === 0 && span.textContent.endsWith('details'))!
        const style = getComputedStyle(row)
        return {
          color: getComputedStyle(description).color,
          fontSize: getComputedStyle(description).fontSize,
          background: style.backgroundColor,
          opacity: style.opacity,
          selected: row.getAttribute('aria-checked') === 'true',
          disabled: row.getAttribute('aria-disabled') === 'true',
          text: row.textContent,
          focusable: row instanceof HTMLButtonElement,
        }
      }))
      expect(measured).toHaveLength(4)
      for (const row of measured) {
        expect(row.fontSize).toBe('14px')
        expect(row.opacity).toBe(row.disabled ? '0.5' : '1')
        expect(row.focusable).toBe(!row.disabled)
        if (row.disabled) expect(row.text).toContain('Sending')
        else {
          for (const surface of [[], [theme['--bg-card']!], [theme['--bg-sheet']!]]) {
            expect(contrastOnSurface(row.color, [theme['--bg']!, ...surface, row.background]))
              .toBeGreaterThanOrEqual(4.5)
          }
        }
        expect(contrastOnSurface(row.color, [row.selected ? theme['--fg-2']! : theme['--fg-3']!])).toBe(1)
        expect(contrastOnSurface(row.background, [theme['--bg']!])).toBe(contrastOnSurface(
          row.selected ? `rgba(${theme['--primary-rgb']}, 0.1)` : 'rgba(0, 0, 0, 0)', [theme['--bg']!],
        ))
      }
    } finally { await page.close() }
  })
})
