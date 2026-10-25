import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SegmentedControlProps } from '@orbit/shared/contracts/navigation'
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

it.each([
  { timing: 'before', releaseFirst: true },
  { timing: 'before', releaseFirst: false },
  { timing: 'after', releaseFirst: true },
])('selects the last option when End follows ArrowRight $timing its queued focus (release first: $releaseFirst)', ({ timing, releaseFirst }) => {
  vi.useFakeTimers()
  const onChange = vi.fn()
  render(<Example choices={navigationOptions} onChange={onChange} />)
  const first = screen.getByRole('radio', { name: 'All' })
  const middle = screen.getByRole('radio', { name: 'Active' })
  const last = screen.getByRole('radio', { name: 'Completed' })
  act(() => { first.focus() })
  const pressEnd = (event: FocusEvent) => {
    if (event.target !== middle) return
    fireEvent.keyUp(middle, { key: 'ArrowRight' })
    fireEvent.keyDown(middle, { key: 'End' })
  }
  document.addEventListener('focusin', pressEnd)
  try {
    if (timing === 'before') document.removeEventListener('focusin', pressEnd)
    fireEvent.keyDown(first, { key: 'ArrowRight' })
    if (timing === 'before') {
      if (releaseFirst) fireEvent.keyUp(first, { key: 'ArrowRight' })
      fireEvent.keyDown(first, { key: 'End' })
      if (!releaseFirst) fireEvent.keyUp(first, { key: 'ArrowRight' })
    }
    act(() => { vi.runAllTimers() })
    fireEvent.keyUp(last, { key: 'End' })
    expect(last).toHaveFocus()
    expect(last).toHaveAttribute('aria-checked', 'true')
    expect(onChange.mock.calls).toEqual(timing === 'before' ? [['completed']] : [['active'], ['completed']])
  } finally {
    document.removeEventListener('focusin', pressEnd)
  }
})
