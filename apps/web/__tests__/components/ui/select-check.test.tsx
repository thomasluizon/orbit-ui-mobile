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

    expect(selected).toHaveStyle({ background: 'rgba(var(--primary-rgb), 0.10)' })
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
