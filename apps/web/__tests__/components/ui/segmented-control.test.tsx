import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { SegmentedControl } from '@/components/ui/segmented-control'

const options = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active', disabled: true },
  { value: 'completed', label: 'Completed' },
] as const

function Example({ onChange }: Readonly<{ onChange: (value: string) => void }>) {
  const [value, setValue] = useState<(typeof options)[number]['value']>('all')
  return <SegmentedControl options={options} value={value} label="Views" onChange={(next) => { setValue(next); onChange(next) }} />
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
    await user.keyboard('{ArrowRight}')
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Completed', checked: true })).toHaveFocus())
    expect(onChange).toHaveBeenCalledExactlyOnceWith('completed')
    await user.keyboard('{ArrowRight}')
    await waitFor(() => expect(screen.getByRole('radio', { name: 'All', checked: true })).toHaveFocus())
    await user.keyboard('{End}')
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Completed' })).toHaveFocus())
    await user.keyboard('{Home}')
    await waitFor(() => expect(screen.getByRole('radio', { name: 'All' })).toHaveFocus())
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
    await user.keyboard('{End}')
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Completed', checked: true })).toHaveFocus())
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
