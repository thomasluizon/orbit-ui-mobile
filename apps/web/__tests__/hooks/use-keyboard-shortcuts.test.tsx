import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'

const mockPush = vi.fn()
const mockTogglePalette = vi.fn()
const mockSetActiveView = vi.fn()
let overlayOpen = false

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('@/stores/shell-store', () => ({
  useShellStore: (selector: (state: { togglePalette: typeof mockTogglePalette }) => unknown) =>
    selector({ togglePalette: mockTogglePalette }),
}))

vi.mock('@/stores/ui-store', () => ({
  useUIStore: (selector: (state: { setActiveView: typeof mockSetActiveView }) => unknown) =>
    selector({ setActiveView: mockSetActiveView }),
}))

vi.mock('@/lib/overlay-stack', () => ({
  hasOpenOverlay: () => overlayOpen,
}))

import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts'

function Harness() {
  useKeyboardShortcuts()
  return <input data-testid="field" />
}

beforeEach(() => {
  overlayOpen = false
  mockPush.mockClear()
  mockTogglePalette.mockClear()
  mockSetActiveView.mockClear()
})

describe('useKeyboardShortcuts', () => {
  it('toggles the palette on Meta+K', () => {
    render(<Harness />)
    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    expect(mockTogglePalette).toHaveBeenCalledTimes(1)
  })

  it('toggles the palette on Ctrl+K', () => {
    render(<Harness />)
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
    expect(mockTogglePalette).toHaveBeenCalledTimes(1)
  })

  it('navigates with the g then c chord', () => {
    render(<Harness />)
    fireEvent.keyDown(document, { key: 'g' })
    fireEvent.keyDown(document, { key: 'c' })
    expect(mockPush).toHaveBeenCalledWith('/calendar')
  })

  it('sets the today view with the g then t chord', () => {
    render(<Harness />)
    fireEvent.keyDown(document, { key: 'g' })
    fireEvent.keyDown(document, { key: 't' })
    expect(mockSetActiveView).toHaveBeenCalledWith('today')
    expect(mockPush).toHaveBeenCalledWith('/')
  })

  it('ignores the chord while typing in a field', () => {
    const { getByTestId } = render(<Harness />)
    const field = getByTestId('field')
    fireEvent.keyDown(field, { key: 'g' })
    fireEvent.keyDown(field, { key: 'c' })
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('ignores the chord while an overlay is open', () => {
    overlayOpen = true
    render(<Harness />)
    fireEvent.keyDown(document, { key: 'g' })
    fireEvent.keyDown(document, { key: 'c' })
    expect(mockPush).not.toHaveBeenCalled()
  })
})
