import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { GoalType } from '@orbit/shared/types/goal'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { GoalTypeSelector } from '@/components/habits/create-goal-from-habit/goal-type-selector'

function Selector({ onChange }: Readonly<{ onChange: (value: GoalType) => void }>) {
  const [value, setValue] = useState<GoalType>('Standard')
  return (
    <GoalTypeSelector
      goalType={value}
      onTypeChange={(nextValue) => {
        setValue(nextValue)
        onChange(nextValue)
      }}
    />
  )
}

describe('GoalTypeSelector', () => {
  it('keeps one tab stop and moves selection and focus with radio keys', () => {
    const onChange = vi.fn()
    render(<Selector onChange={onChange} />)
    const standard = screen.getByRole('radio', { name: 'goals.form.typeStandard' })
    const streak = screen.getByRole('radio', { name: 'goals.form.typeStreak' })

    expect([standard.tabIndex, streak.tabIndex]).toEqual([0, -1])
    standard.focus()
    fireEvent.keyDown(standard, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenCalledExactlyOnceWith('Streak')
    expect(streak).toHaveFocus()
    fireEvent.keyDown(streak, { key: 'Home' })
    expect(onChange).toHaveBeenLastCalledWith('Standard')
    expect(standard).toHaveFocus()
  })

  it('keeps pointer selection unchanged', () => {
    const onChange = vi.fn()
    render(<Selector onChange={onChange} />)
    fireEvent.click(screen.getByRole('radio', { name: 'goals.form.typeStreak' }))
    expect(onChange).toHaveBeenCalledExactlyOnceWith('Streak')
  })
})
