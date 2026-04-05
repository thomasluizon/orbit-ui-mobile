import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AppSelect } from '@/components/ui/app-select'

const options = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Charlie' },
]

describe('AppSelect', () => {
  it('renders all options', () => {
    render(<AppSelect value="a" onChange={vi.fn()} options={options} />)
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.getByText('Charlie')).toBeInTheDocument()
  })

  it('selects the correct value', () => {
    render(<AppSelect value="b" onChange={vi.fn()} options={options} />)
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.value).toBe('b')
  })

  it('calls onChange when selection changes', () => {
    const onChange = vi.fn()
    render(<AppSelect value="a" onChange={onChange} options={options} />)
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'c' } })
    expect(onChange).toHaveBeenCalledWith('c')
  })

  it('renders with null value as empty string', () => {
    render(<AppSelect value={null} onChange={vi.fn()} options={options} />)
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.value).toBe('a') // defaults to first option
  })

  it('applies aria-label when label prop provided', () => {
    render(<AppSelect value="a" onChange={vi.fn()} options={options} label="Choose one" />)
    const select = screen.getByLabelText('Choose one')
    expect(select).toBeInTheDocument()
  })

  it('renders the chevron icon', () => {
    const { container } = render(<AppSelect value="a" onChange={vi.fn()} options={options} />)
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })
})
