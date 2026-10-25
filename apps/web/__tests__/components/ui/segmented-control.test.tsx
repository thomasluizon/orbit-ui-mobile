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

describe('SegmentedControl tabs', () => {
  it('announces the current tab and activates another view once', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Example onChange={onChange} />)
    expect(screen.getByRole('tablist', { name: 'Views' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'All', selected: true })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'All' }))
    expect(onChange).not.toHaveBeenCalled()
    await user.click(screen.getByRole('tab', { name: 'Completed' }))
    expect(onChange).toHaveBeenCalledExactlyOnceWith('completed')
    expect(screen.getByRole('tab', { name: 'Completed', selected: true })).toBeInTheDocument()
  })

  it('uses one entry, skips disabled tabs, wraps, and supports Home and End', async () => {
    const user = userEvent.setup()
    render(<Example onChange={vi.fn()} />)
    await user.tab()
    expect(screen.getByRole('tab', { name: 'All' })).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Completed', selected: true })).toHaveFocus())
    await user.keyboard('{ArrowRight}')
    await waitFor(() => expect(screen.getByRole('tab', { name: 'All', selected: true })).toHaveFocus())
    await user.keyboard('{End}')
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Completed' })).toHaveFocus())
    await user.keyboard('{Home}')
    await waitFor(() => expect(screen.getByRole('tab', { name: 'All' })).toHaveFocus())
  })

  it('blocks disabled options and a disabled control', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<SegmentedControl options={options} value="all" onChange={onChange} label="Views" disabled />)
    for (const tab of screen.getAllByRole('tab')) { expect(tab).toBeDisabled(); await user.click(tab) }
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
