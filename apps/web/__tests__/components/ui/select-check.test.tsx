import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
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
      <RadioRow label="First" selected={value === 'first'} onClick={() => select('first')} />
      <RadioRow label="Disabled" selected={false} disabled onClick={() => select('disabled')} />
      <RadioRow label="Third" selected={value === 'third'} onClick={() => select('third')} />
      <RadioRow label="Last" selected={value === 'last'} onClick={() => select('last')} />
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
      <RadioRow label="First" selected={value === 'first'} onClick={() => select('first')} />
      <RadioRow label="Second" selected={value === 'second'} onClick={() => select('second')} />
    </RadioGroup>
  )
}

describe('select-check RadioRow group', () => {
  it('keeps one tab stop, skips disabled rows, wraps, and follows selection with focus', () => {
    const onChange = vi.fn()
    render(<RadioRows onChange={onChange} />)
    const first = screen.getByRole('radio', { name: 'First' })
    const disabled = screen.getByRole('radio', { name: 'Disabled' })
    const third = screen.getByRole('radio', { name: 'Third' })
    const last = screen.getByRole('radio', { name: 'Last' })

    expect([first, disabled, third, last].map((option) => option.tabIndex)).toEqual([0, -1, -1, -1])
    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowDown' })
    expect(onChange).toHaveBeenLastCalledWith('third')
    expect(third).toHaveFocus()

    fireEvent.keyDown(third, { key: 'End' })
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

  it('keeps pointer selection unchanged and blocks disabled rows', () => {
    const onChange = vi.fn()
    render(<RadioRows onChange={onChange} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Third' }))
    expect(onChange).toHaveBeenCalledExactlyOnceWith('third')
    expect(screen.getByRole('radio', { name: 'Disabled' })).toBeDisabled()
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
