import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SegmentedControlProps } from '@orbit/shared/contracts/navigation'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { HabitViewSwitch } from '@/components/today/habit-view-switch'
import { useUIStore } from '@/stores/ui-store'
import { SegmentedControl } from '@/components/ui/segmented-control'

const options = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active', disabled: true },
  { value: 'completed', label: 'Completed' },
] as const

function Example({ onChange, choices = options, initialValue = 'all' }: Readonly<{
  onChange: (value: string) => void
  choices?: SegmentedControlProps<string>['options']
  initialValue?: string
}>) {
  const [value, setValue] = useState(initialValue)
  return <SegmentedControl options={choices} value={value} label="Views" onChange={(next) => { setValue(next); onChange(next) }} />
}

afterEach(() => { vi.useRealTimers() })

async function navigate(user: ReturnType<typeof userEvent.setup>, key: string, label: string) {
  await user.keyboard('{' + key + '>}')
  await waitFor(() => expect(screen.getByRole('radio', { name: label, checked: true })).toHaveFocus())
  await user.keyboard('{/' + key + '}')
}

describe('SegmentedControl radio choices', () => {
  it('announces the current option and activates another view once', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Example onChange={onChange} />)
    expect(screen.getByRole('radiogroup', { name: 'Views' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'All', checked: true })).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'All' }))
    expect(onChange).not.toHaveBeenCalled()
    await user.click(screen.getByRole('radio', { name: 'Completed' }))
    expect(onChange).toHaveBeenCalledExactlyOnceWith('completed')
    expect(screen.getByRole('radio', { name: 'Completed', checked: true })).toBeInTheDocument()
  })

  it('uses one entry, skips disabled options, wraps, and supports Home and End', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Example onChange={onChange} />)
    await user.tab()
    expect(screen.getByRole('radio', { name: 'All' })).toHaveFocus()
    await navigate(user, 'ArrowRight', 'Completed')
    expect(onChange).toHaveBeenCalledExactlyOnceWith('completed')
    await navigate(user, 'ArrowRight', 'All')
    await navigate(user, 'End', 'Completed')
    await navigate(user, 'Home', 'All')
  })

  it('blocks disabled options and a disabled control', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<SegmentedControl options={options} value="all" onChange={onChange} label="Views" disabled />)
    for (const tab of screen.getAllByRole('radio')) { expect(tab).toBeDisabled(); await user.click(tab) }
    expect(onChange).not.toHaveBeenCalled()
  })
})

it('commits a completed keyboard activation once with a controlled value', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  render(<SegmentedControl label="Views" value="all" onChange={onChange} options={[{ value: 'all', label: 'All' }, { value: 'completed', label: 'Completed' }]} />)
  await user.tab()
  await user.keyboard('{End}')
  onChange.mockClear()
  await user.keyboard('{Enter}')
  expect(onChange).toHaveBeenCalledExactlyOnceWith('completed')
})

it('retains selection and each control identity through focus inspection', async () => {
  const onChange = vi.fn()
  render(<Example onChange={onChange} />)
  const group = screen.getByRole('radiogroup', { name: 'Views' })
  expect(group).toHaveAttribute('tabindex', '-1')
  const radios = screen.getAllByRole('radio')
  for (const radio of radios.filter((option) => !option.hasAttribute('disabled'))) {
    radio.focus()
    expect(radio).toHaveFocus()
    expect(screen.getByRole('radio', { name: 'All' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getAllByRole('radio')).toEqual(radios)
  }
  expect(onChange).not.toHaveBeenCalled()
})

it.each(['Home', 'End'])('does not select on later ordinary focus after a stationary %s key', async (key) => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  render(<Example onChange={onChange} />)
  await user.tab()
  if (key === 'End') {
    await navigate(user, 'End', 'Completed')
  }
  onChange.mockClear()
  await user.keyboard('{' + key + '}')
  const selected = key === 'Home' ? 'All' : 'Completed'
  const other = key === 'Home' ? 'Completed' : 'All'
  screen.getByRole('radio', { name: other }).focus()
  expect(screen.getByRole('radio', { name: other })).toHaveFocus()
  expect(screen.getByRole('radio', { name: selected })).toHaveAttribute('aria-checked', 'true')
  expect(onChange).not.toHaveBeenCalled()
})

const navigationOptions = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
] as const

it('selects two options along after consecutive ArrowRight presses', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  render(<Example choices={navigationOptions} onChange={onChange} />)
  await user.tab()
  await navigate(user, 'ArrowRight', 'Active')
  await navigate(user, 'ArrowRight', 'Completed')
  expect(onChange.mock.calls).toEqual([['active'], ['completed']])
})

it.each([
  { key: 'Home', label: 'All', value: 'all', initialValue: 'completed' },
  { key: 'End', label: 'Completed', value: 'completed', initialValue: 'all' },
])('selects the enabled endpoint on $key', async ({ key, label, value, initialValue }) => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  render(<Example choices={[
    { value: 'before', label: 'Before', disabled: true },
    navigationOptions[0], navigationOptions[2],
    { value: 'after', label: 'After', disabled: true },
  ]} initialValue={initialValue} onChange={onChange} />)
  await user.tab()
  await navigate(user, key, label)
  expect(onChange).toHaveBeenCalledExactlyOnceWith(value)
})

describe('synchronous keyboard navigation', () => {
  it.each([
    { key: 'ArrowRight', labels: ['Active', 'Completed'], values: ['active', 'completed'] },
    { key: 'ArrowDown', labels: ['Active', 'Completed'], values: ['active', 'completed'] },
    { key: 'ArrowLeft', labels: ['Completed', 'Active'], values: ['completed', 'active'] },
    { key: 'ArrowUp', labels: ['Completed', 'Active'], values: ['completed', 'active'] },
  ])('checks and focuses both destinations on consecutive $key keydowns without advancing timers', ({ key, labels, values }) => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    render(<Example choices={navigationOptions} onChange={onChange} />)
    act(() => { screen.getByRole('radio', { name: 'All' }).focus() })
    for (let index = 0; index < labels.length; index++) {
      fireEvent.keyDown(document.activeElement!, { key })
    }
    const destination = screen.getByRole('radio', { name: labels[1], checked: true })
    expect(destination).toHaveFocus()
    expect(destination).toHaveAttribute('tabindex', '0')
    expect(screen.getAllByRole('radio').filter((radio) => radio.tabIndex === 0)).toEqual([destination])
    expect(onChange.mock.calls).toEqual(values.map((value) => [value]))
    fireEvent.keyUp(destination, { key })
    act(() => { vi.runAllTimers() })
    expect(destination).toHaveFocus()
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it.each([
    { key: 'ArrowRight', label: 'Completed', value: 'completed', initialValue: 'all' },
    { key: 'ArrowDown', label: 'Completed', value: 'completed', initialValue: 'all' },
    { key: 'ArrowLeft', label: 'All', value: 'all', initialValue: 'completed' },
    { key: 'ArrowUp', label: 'All', value: 'all', initialValue: 'completed' },
    { key: 'Home', label: 'All', value: 'all', initialValue: 'completed' },
    { key: 'End', label: 'Completed', value: 'completed', initialValue: 'all' },
  ])('checks the enabled destination immediately on $key and retains it after release', ({ key, label, value, initialValue }) => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    render(<Example choices={key === 'Home' || key === 'End' ? [
      { value: 'before', label: 'Before', disabled: true },
      options[0], options[2],
      { value: 'after', label: 'After', disabled: true },
    ] : options} initialValue={initialValue} onChange={onChange} />)
    const selected = screen.getByRole('radio', { checked: true })
    const destination = screen.getByRole('radio', { name: label })
    act(() => { selected.focus() })
    fireEvent.keyDown(selected, { key })
    expect(destination).toHaveFocus()
    expect(destination).toHaveAttribute('aria-checked', 'true')
    expect(onChange).toHaveBeenCalledExactlyOnceWith(value)
    fireEvent.keyUp(destination, { key })
    expect(destination).toHaveFocus()
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('checks each destination after two quick ArrowRight taps and leaves ordinary focus unselected without advancing timers', () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    render(<Example choices={navigationOptions} onChange={onChange} />)
    act(() => { screen.getByRole('radio', { name: 'All' }).focus() })
    for (const label of ['Active', 'Completed']) {
      const selected = screen.getByRole('radio', { checked: true })
      fireEvent.keyDown(selected, { key: 'ArrowRight' })
      fireEvent.keyUp(selected, { key: 'ArrowRight' })
      expect(screen.getByRole('radio', { name: label, checked: true })).toHaveFocus()
    }
    act(() => { screen.getByRole('radio', { name: 'All' }).focus() })
    expect(screen.getByRole('radio', { name: 'Completed', checked: true })).toBeInTheDocument()
    expect(onChange.mock.calls).toEqual([['active'], ['completed']])
  })

  it('selects the endpoint immediately when End follows ArrowRight without advancing timers', () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    render(<Example choices={navigationOptions} onChange={onChange} />)
    const first = screen.getByRole('radio', { name: 'All' })
    const last = screen.getByRole('radio', { name: 'Completed' })
    act(() => { first.focus() })
    for (const key of ['ArrowRight', 'End']) {
      fireEvent.keyDown(document.activeElement!, { key })
      fireEvent.keyUp(document.activeElement!, { key })
    }
    expect(last).toHaveFocus()
    expect(last).toHaveAttribute('aria-checked', 'true')
    expect(onChange.mock.calls).toEqual([['active'], ['completed']])
  })

  it.each(['Home', 'End'])('leaves ordinary focus unselected after a stationary %s without advancing timers', (key) => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    render(<Example choices={navigationOptions} initialValue={key === 'Home' ? 'all' : 'completed'} onChange={onChange} />)
    const selected = screen.getByRole('radio', { checked: true })
    act(() => { selected.focus() })
    fireEvent.keyDown(selected, { key })
    fireEvent.keyUp(selected, { key })
    act(() => { screen.getByRole('radio', { name: 'Active' }).focus() })
    expect(selected).toHaveAttribute('aria-checked', 'true')
    expect(onChange).not.toHaveBeenCalled()
  })

  it.each(['altKey', 'ctrlKey', 'metaKey', 'shiftKey'])('ignores navigation with %s', (modifier) => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    render(<Example choices={navigationOptions} onChange={onChange} />)
    const selected = screen.getByRole('radio', { name: 'All', checked: true })
    act(() => { selected.focus() })
    for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End']) {
      expect(fireEvent.keyDown(selected, { key, [modifier]: true })).toBe(true)
      fireEvent.keyUp(selected, { key, [modifier]: true })
    }
    act(() => { vi.runAllTimers() })
    expect(selected).toHaveFocus()
    expect(selected).toHaveAttribute('aria-checked', 'true')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('activates a pointer choice after keyboard selection', () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    render(<Example choices={navigationOptions} onChange={onChange} />)
    const first = screen.getByRole('radio', { name: 'All' })
    const last = screen.getByRole('radio', { name: 'Completed' })
    act(() => { first.focus() })
    fireEvent.keyDown(first, { key: 'ArrowRight' })
    fireEvent.keyUp(first, { key: 'ArrowRight' })
    fireEvent.pointerDown(last)
    fireEvent.click(last, { detail: 1 })
    expect(last).toHaveAttribute('aria-checked', 'true')
    expect(onChange.mock.calls).toEqual([['active'], ['completed']])
  })
})

function StoredView() {
  const value = useUIStore((state) => state.activeView)
  const onChange = useUIStore((state) => state.setActiveView)
  return <HabitViewSwitch value={value} onChange={onChange} />
}

it('keeps activeView when selecting in a folded menu and changing locale back to segments', async () => {
  let width = 100
  const geometry = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return new DOMRect(0, 0, this.hasAttribute('data-segmented-control') ? width : 0, 20)
  })
  useUIStore.setState({ activeView: 'today' })
  const user = userEvent.setup()
  const { rerender } = render(<NextIntlClientProvider locale="en" messages={en}><StoredView /></NextIntlClientProvider>)
  try {
    await user.click(screen.getByRole('button', { name: `${en.habits.viewsLabel}: ${en.habits.viewToday}` }))
    await user.click(await screen.findByRole('menuitemcheckbox', { name: en.habits.viewGeneral, checked: false }))
    await waitFor(() => expect(useUIStore.getState().activeView).toBe('general'))
    expect(screen.getByRole('button', { name: `${en.habits.viewsLabel}: ${en.habits.viewGeneral}` })).toBeInTheDocument()
    width = 400
    rerender(<NextIntlClientProvider locale="pt-BR" messages={ptBR}><StoredView /></NextIntlClientProvider>)
    expect(screen.getByRole('radio', { name: ptBR.habits.viewGeneral, checked: true })).toBeInTheDocument()
    expect(useUIStore.getState().activeView).toBe('general')
  } finally { geometry.mockRestore(); useUIStore.setState({ activeView: 'today' }) }
})
