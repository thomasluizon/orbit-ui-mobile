import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Input } from '@/components/ui/input'

function field(radius?: 12 | 16) {
  const view = render(<Input label="Item" value="" onChange={() => {}} radius={radius} />)
  const perimeter = view.container.querySelector<HTMLElement>('[data-focus-perimeter]')!
  const control = view.container.querySelector<HTMLInputElement>('input')!
  return { perimeter, control }
}

describe('the field radius of Input', () => {
  it('draws the default field at radius 12 and minimum height 54', () => {
    const { perimeter, control } = field()
    expect(perimeter).toHaveClass('rounded-[12px]')
    expect(perimeter.style.minHeight).toBe('54px')
    expect(control.style.minHeight).toBe('54px')
  })

  it('draws the 16 field at radius 16 and minimum height 56, on the perimeter and on the control', () => {
    const { perimeter, control } = field(16)
    expect(perimeter).toHaveClass('rounded-[16px]')
    expect(perimeter).not.toHaveClass('rounded-[12px]')
    expect(perimeter.style.minHeight).toBe('56px')
    expect(control.style.minHeight).toBe('56px')
  })
})
