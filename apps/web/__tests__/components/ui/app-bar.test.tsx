import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { AppBar } from '@/components/ui/app-bar'

describe('AppBar', () => {
  it('always shows the caller title without requiring a back control', () => {
    render(<AppBar title="Preferences" />)
    expect(screen.getByRole('heading', { name: 'Preferences' })).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
  it('keeps the exact back name and renders the action on both variants', () => {
    const onBack = vi.fn()
    const action = <button type="button">Share</button>
    const { rerender } = render(<AppBar title="Habit" onBack={onBack} backLabel="Back to walking" action={action} />)
    fireEvent.click(screen.getByRole('button', { name: 'Back to walking' }))
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('heading', { name: 'Habit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument()
    rerender(<AppBar title="Habit" action={action} />)
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Back to walking' })).not.toBeInTheDocument()
  })
  it('names a visual title when the caller does not use a heading', () => {
    render(<AppBar title="Astra" titleVisual={<AstraGlyph size={16} />} titleIsHeading={false} />)
    expect(screen.getByRole('img', { name: 'Astra' })).toBeInTheDocument()
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })
  it('keeps an object view title visible without adding a page heading', () => {
    render(<AppBar title="Habit" titleIsHeading={false} />)
    expect(screen.getByText('Habit')).toBeVisible()
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })
})
