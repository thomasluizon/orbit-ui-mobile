import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'

const mockPush = vi.fn()
const mockTogglePalette = vi.fn()
const mockSetAstraOpen = vi.fn()
const mockSetAstraMaximized = vi.fn()
const mockSetActiveView = vi.fn()
let overlayOpen = false
let isDesktop = false

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('@/stores/shell-store', () => ({
  useShellStore: (
    selector: (state: {
      togglePalette: typeof mockTogglePalette
      setAstraOpen: typeof mockSetAstraOpen
      setAstraMaximized: typeof mockSetAstraMaximized
    }) => unknown,
  ) =>
    selector({
      togglePalette: mockTogglePalette,
      setAstraOpen: mockSetAstraOpen,
      setAstraMaximized: mockSetAstraMaximized,
    }),
}))

vi.mock('@/stores/ui-store', () => ({
  useUIStore: (selector: (state: { setActiveView: typeof mockSetActiveView }) => unknown) =>
    selector({ setActiveView: mockSetActiveView }),
}))

vi.mock('@/lib/overlay-stack', () => ({
  hasOpenOverlay: () => overlayOpen,
}))

vi.mock('@/hooks/use-is-desktop', () => ({
  useIsDesktop: () => isDesktop,
}))

import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts'
import {
  getCurrentRouteTransitionIntent,
  resetRouteTransitionIntent,
} from '@/lib/motion/route-intent'

function Harness() {
  useKeyboardShortcuts()
  return <input data-testid="field" />
}

beforeEach(() => {
  overlayOpen = false
  isDesktop = false
  mockPush.mockClear()
  mockTogglePalette.mockClear()
  mockSetAstraOpen.mockClear()
  mockSetAstraMaximized.mockClear()
  mockSetActiveView.mockClear()
  resetRouteTransitionIntent()
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

  it('marks chord navigation with the tab transition intent', () => {
    render(<Harness />)
    fireEvent.keyDown(document, { key: 'g' })
    fireEvent.keyDown(document, { key: 'c' })
    expect(getCurrentRouteTransitionIntent()).toBe('tab')
  })

  it('sets the today view with the g then t chord', () => {
    render(<Harness />)
    fireEvent.keyDown(document, { key: 'g' })
    fireEvent.keyDown(document, { key: 't' })
    expect(mockSetActiveView).toHaveBeenCalledWith('today')
    expect(mockPush).toHaveBeenCalledWith('/')
  })

  it('opens the maximized Astra copilot with g then a at the desktop breakpoint', () => {
    isDesktop = true
    render(<Harness />)
    fireEvent.keyDown(document, { key: 'g' })
    fireEvent.keyDown(document, { key: 'a' })
    expect(mockSetAstraOpen).toHaveBeenCalledWith(true)
    expect(mockSetAstraMaximized).toHaveBeenCalledWith(true)
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('routes to chat with g then a below the desktop breakpoint', () => {
    render(<Harness />)
    fireEvent.keyDown(document, { key: 'g' })
    fireEvent.keyDown(document, { key: 'a' })
    expect(mockPush).toHaveBeenCalledWith('/chat')
    expect(mockSetAstraOpen).not.toHaveBeenCalled()
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
