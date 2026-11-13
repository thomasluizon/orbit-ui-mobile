import { readFileSync } from 'node:fs'
import postcss, { type AtRule, type Node } from 'postcss'
import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Sheet } from '@/components/ui/sheet'
import { Select } from '@/components/ui/select'

vi.unmock('@/components/ui/sheet')
vi.mock('next-intl', () => ({ useLocale: () => 'en', useTranslations: () => (key: string) => key }))

Object.defineProperty(Element.prototype, 'hasPointerCapture', { configurable: true, value: () => false })

const options = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Charlie' },
]

function Example() {
  const [value, setValue] = useState('a')
  return <><input aria-label="Reminder count" /><Select label="Units" value={value} onChange={setValue} options={options} /></>
}

describe('Select', () => {
  it('opens on the first activation after editing and announces the selected value', async () => {
    const user = userEvent.setup()
    render(<Example />)
    await user.type(screen.getByRole('textbox'), '2')
    await user.click(screen.getByRole('combobox', { name: 'Units' }))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Alpha', selected: true })).toBeInTheDocument()
  })

  it('moves with arrows and typeahead, commits, then restores trigger focus', async () => {
    const user = userEvent.setup()
    render(<Example />)
    const trigger = screen.getByRole('combobox', { name: 'Units' })
    trigger.focus()
    await user.keyboard('{ArrowDown}')
    await waitFor(() => expect(screen.getByRole('option', { name: 'Alpha' })).toHaveFocus())
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('option', { name: 'Beta' })).toHaveFocus()
    await user.keyboard('c')
    await waitFor(() => expect(screen.getByRole('option', { name: 'Charlie' })).toHaveFocus())
    await user.keyboard('{Enter}')
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
    expect(trigger).toHaveTextContent('Charlie')
    expect(trigger).toHaveFocus()
  })
})

it('keeps a select popup inside its owning dialog and Escape closes only the select', async () => {
  const user = userEvent.setup()
  const onClose = vi.fn()
  render(<Sheet open title="Reminders" onClose={onClose}><Example /></Sheet>)
  const dialog = screen.getByRole('dialog', { name: 'Reminders' })
  const trigger = screen.getByRole('combobox', { name: 'Units' })
  await user.click(trigger)
  const listbox = screen.getByRole('listbox')
  expect(listbox.closest('[role="dialog"]')).toBe(dialog)
  expect(listbox.closest('[aria-hidden="true"]')).toBeNull()
  await user.keyboard('{ArrowDown}')
  await waitFor(() => expect(screen.getByRole('option', { name: 'Beta' })).toHaveFocus())
  await user.keyboard('{Enter}')
  await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
  expect(trigger).toHaveTextContent('Beta')
  expect(trigger).toHaveFocus()
  await user.click(trigger)
  await user.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
  expect(dialog).toBeInTheDocument()
  expect(onClose).not.toHaveBeenCalled()
  expect(trigger).toHaveFocus()
})

describe('select popup motion', () => {
  function declarations(selector: string): [string, string, string[]][] {
    const found: [string, string, string[]][] = []
    postcss.parse(readFileSync('app/globals.css', 'utf8')).walkRules((rule) => {
      if (!rule.selectors.includes(selector)) return
      const media: string[] = []
      for (let parent: Node | undefined = rule.parent; parent; parent = parent.parent) if (parent.type === 'atrule') media.push((parent as AtRule).params)
      rule.walkDecls((declaration) => { found.push([declaration.prop, declaration.value, media]) })
    })
    return found
  }

  it('opens the popup from its trigger with the menu preset and closes it with the shorter exit', async () => {
    const user = userEvent.setup()
    render(<Example />)
    await user.click(screen.getByRole('combobox', { name: 'Units' }))
    expect(screen.getByRole('listbox')).toHaveClass('orbit-select-panel')
    expect(screen.getByRole('listbox')).toHaveAttribute('data-state', 'open')
    expect(declarations('.orbit-select-panel')).toEqual(expect.arrayContaining([
      ['transform-origin', 'var(--radix-select-content-transform-origin)', []],
      ['animation', 'orbit-menu-enter var(--motion-menu-enter) var(--motion-ease-enter)', []],
      ['animation', 'none', ['(prefers-reduced-motion: reduce)']],
    ]))
    expect(declarations('.orbit-select-panel[data-state="closed"]')).toEqual(expect.arrayContaining([
      ['animation', 'orbit-menu-exit var(--motion-menu-exit) var(--motion-ease-exit)', []],
      ['animation', 'orbit-menu-fade-out var(--motion-menu-exit) linear', ['(prefers-reduced-motion: reduce)']],
    ]))
  })
})
