import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, renderHook, fireEvent } from '@testing-library/react'

const mockPush = vi.fn()
const mockTogglePalette = vi.fn()
const mockSetActiveView = vi.fn()
const mockSetAstraConversationOpen = vi.fn()
let overlayOpen = false
let modalFocusOwnerOpen = false
let paletteOpen = false

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('@/stores/shell-store', () => ({
  useShellStore: (
    selector: (state: {
      togglePalette: typeof mockTogglePalette
      paletteOpen: boolean
    }) => unknown,
  ) =>
    selector({
      togglePalette: mockTogglePalette,
      paletteOpen,
    }),
}))

vi.mock('@/stores/ui-store', () => ({
  useUIStore: (selector: (state: { setActiveView: typeof mockSetActiveView; setAstraConversationOpen: typeof mockSetAstraConversationOpen }) => unknown) =>
    selector({ setActiveView: mockSetActiveView, setAstraConversationOpen: mockSetAstraConversationOpen }),
}))

vi.mock('@/lib/overlay-stack', () => ({
  hasOpenOverlay: () => overlayOpen,
  hasOpenModalFocusOwner: () => modalFocusOwnerOpen,
}))

import { useHabitCreateNavigationGuard } from '@/hooks/use-habit-create-navigation-guard'
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts'
import {
  getCurrentRouteTransitionIntent,
  resetRouteTransitionIntent,
} from '@/lib/motion/route-intent'

function Harness({ enabled = true }: Readonly<{ enabled?: boolean }>) {
  useKeyboardShortcuts(enabled)
  return <input data-testid="field" />
}

beforeEach(() => {
  overlayOpen = false
  modalFocusOwnerOpen = false
  paletteOpen = false
  mockPush.mockClear()
  mockTogglePalette.mockClear()
  mockSetActiveView.mockClear()
  mockSetAstraConversationOpen.mockClear()
  resetRouteTransitionIntent()
})

afterEach(() => vi.useRealTimers())

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

  it('does not open the palette while another modal owns focus', () => {
    modalFocusOwnerOpen = true
    render(<Harness />)
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
    expect(mockTogglePalette).not.toHaveBeenCalled()
  })

  it('registers no palette or destination shortcuts when navigation is disabled', () => {
    render(<Harness enabled={false} />)
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
    fireEvent.keyDown(document, { key: 'g' })
    fireEvent.keyDown(document, { key: 'c' })
    fireEvent.keyDown(document, { key: 'g' })
    fireEvent.keyDown(document, { key: 'a' })
    fireEvent.keyDown(document, { key: 'g' })
    fireEvent.keyDown(document, { key: 'i' })

    expect(mockSetAstraConversationOpen).not.toHaveBeenCalled()
    expect(mockTogglePalette).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
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

  it.each([['g', 'a'], ['G', 'A']])('opens the conversation with %s then %s without routing', (prefix, key) => {
    render(<Harness />)
    fireEvent.keyDown(document, { key: prefix })
    const allowedDefault = fireEvent.keyDown(document, { key })
    expect(mockSetAstraConversationOpen).toHaveBeenCalledExactlyOnceWith(true)
    expect(allowedDefault).toBe(false)
    expect(mockPush).not.toHaveBeenCalled()
    expect(mockSetActiveView).not.toHaveBeenCalled()
    expect(getCurrentRouteTransitionIntent()).toBe('neutral')
  })

  it('requires an uninterrupted g prefix', () => {
    render(<Harness />)
    fireEvent.keyDown(document, { key: 'a' })
    fireEvent.keyDown(document, { key: 'g' })
    fireEvent.keyDown(document, { key: 'x' })
    fireEvent.keyDown(document, { key: 'a' })
    expect(mockSetAstraConversationOpen).not.toHaveBeenCalled()
  })

  it.each([1199, 1200])('expires the Astra chord after 1200 ms, elapsed %s', (elapsed) => {
    vi.useFakeTimers()
    render(<Harness />)
    fireEvent.keyDown(document, { key: 'g' })
    vi.advanceTimersByTime(elapsed)
    fireEvent.keyDown(document, { key: 'a' })
    expect(mockSetAstraConversationOpen).toHaveBeenCalledTimes(elapsed < 1200 ? 1 : 0)
  })

  it.each(['input', 'textarea', 'select', 'div'])('clears the Astra chord when typing in %s', (tag) => {
    const view = render(<Harness />)
    const field = document.createElement(tag)
    if (tag === 'div') Object.defineProperty(field, 'isContentEditable', { value: true })
    view.container.append(field)
    fireEvent.keyDown(field, { key: 'g' })
    fireEvent.keyDown(field, { key: 'a' })
    fireEvent.keyDown(document, { key: 'g' })
    fireEvent.keyDown(field, { key: 'a' })
    fireEvent.keyDown(document, { key: 'a' })
    expect(mockSetAstraConversationOpen).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'g' })
    fireEvent.keyDown(document, { key: 'a' })
    expect(mockSetAstraConversationOpen).toHaveBeenCalledExactlyOnceWith(true)
  })

  it('clears the Astra chord when an overlay opens between keys', () => {
    render(<Harness />)
    overlayOpen = true
    fireEvent.keyDown(document, { key: 'g' })
    fireEvent.keyDown(document, { key: 'a' })
    overlayOpen = false
    fireEvent.keyDown(document, { key: 'g' })
    overlayOpen = true
    fireEvent.keyDown(document, { key: 'a' })
    overlayOpen = false
    fireEvent.keyDown(document, { key: 'a' })
    expect(mockSetAstraConversationOpen).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'g' })
    fireEvent.keyDown(document, { key: 'a' })
    expect(mockSetAstraConversationOpen).toHaveBeenCalledExactlyOnceWith(true)
  })

  it.each(['metaKey', 'ctrlKey', 'altKey'])('ignores the Astra chord with %s', (modifier) => {
    render(<Harness />)
    fireEvent.keyDown(document, { key: 'g', [modifier]: true })
    fireEvent.keyDown(document, { key: 'a', [modifier]: true })
    expect(mockSetAstraConversationOpen).not.toHaveBeenCalled()
  })

  it('clears an armed Astra chord when shortcuts become disabled', () => {
    const view = render(<Harness />)
    fireEvent.keyDown(document, { key: 'g' })
    view.rerender(<Harness enabled={false} />)
    fireEvent.keyDown(document, { key: 'a' })
    view.rerender(<Harness />)
    fireEvent.keyDown(document, { key: 'a' })
    expect(mockSetAstraConversationOpen).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'g' })
    fireEvent.keyDown(document, { key: 'a' })
    expect(mockSetAstraConversationOpen).toHaveBeenCalledExactlyOnceWith(true)
  })

  it('keeps palette toggling available from a typing target', () => {
    const view = render(<Harness />)
    fireEvent.keyDown(view.getByTestId('field'), { key: 'k', ctrlKey: true })
    expect(mockTogglePalette).toHaveBeenCalledOnce()
    expect(mockSetAstraConversationOpen).not.toHaveBeenCalled()
  })

  it('allows closing the palette while it owns modal focus', () => {
    paletteOpen = true
    modalFocusOwnerOpen = true
    render(<Harness />)
    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    expect(mockTogglePalette).toHaveBeenCalledOnce()
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

describe('progress destination shortcut', () => {
  it.each([['g', 'i'], ['G', 'I']])('opens Progress with %s then %s', (prefix, destination) => {
    render(<Harness />)
    fireEvent.keyDown(document, { key: prefix })
    expect(fireEvent.keyDown(document, { key: destination })).toBe(false)
    expect(mockPush).toHaveBeenCalledExactlyOnceWith('/progress')
    expect(mockSetActiveView).not.toHaveBeenCalled()
    expect(getCurrentRouteTransitionIntent()).toBe('tab')
  })

  it.each([[1199, true], [1200, false]] as const)('honors the chord timeout after %s milliseconds', (elapsed, accepted) => {
    vi.useFakeTimers()
    render(<Harness />)
    fireEvent.keyDown(document, { key: 'g' })
    act(() => { vi.advanceTimersByTime(elapsed) })
    fireEvent.keyDown(document, { key: 'i' })
    expect(mockPush.mock.calls).toEqual(accepted ? [['/progress']] : [])
  })

  it('requires a fresh prefix after an unknown key', () => {
    render(<Harness />)
    fireEvent.keyDown(document, { key: 'i' })
    fireEvent.keyDown(document, { key: 'g' })
    fireEvent.keyDown(document, { key: 'x' })
    fireEvent.keyDown(document, { key: 'i' })
    expect(mockPush).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'g' })
    fireEvent.keyDown(document, { key: 'i' })
    expect(mockPush).toHaveBeenCalledExactlyOnceWith('/progress')
  })

  it.each(['input', 'textarea', 'select'] as const)('clears the chord while typing in a %s', (tag) => {
    const view = render(<Harness />)
    const field = document.createElement(tag)
    view.container.append(field)
    fireEvent.keyDown(field, { key: 'g' })
    fireEvent.keyDown(document, { key: 'i' })
    fireEvent.keyDown(document, { key: 'g' })
    fireEvent.keyDown(field, { key: 'i' })
    fireEvent.keyDown(document, { key: 'i' })
    expect(mockPush).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'g' })
    fireEvent.keyDown(document, { key: 'i' })
    expect(mockPush).toHaveBeenCalledExactlyOnceWith('/progress')
  })

  it('clears an armed chord when an overlay opens', () => {
    render(<Harness />)
    fireEvent.keyDown(document, { key: 'g' })
    overlayOpen = true
    fireEvent.keyDown(document, { key: 'i' })
    overlayOpen = false
    fireEvent.keyDown(document, { key: 'i' })
    expect(mockPush).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'g' })
    fireEvent.keyDown(document, { key: 'i' })
    expect(mockPush).toHaveBeenCalledExactlyOnceWith('/progress')
  })

  it.each(['ctrlKey', 'metaKey', 'altKey'])('ignores modified chord keys with %s', (modifier) => {
    render(<Harness />)
    fireEvent.keyDown(document, { key: 'g', [modifier]: true })
    fireEvent.keyDown(document, { key: 'i' })
    expect(mockPush).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'g' })
    fireEvent.keyDown(document, { key: 'i', [modifier]: true })
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('discards an armed chord when navigation becomes disabled', () => {
    const view = render(<Harness />)
    fireEvent.keyDown(document, { key: 'g' })
    view.rerender(<Harness enabled={false} />)
    fireEvent.keyDown(document, { key: 'i' })
    view.rerender(<Harness />)
    fireEvent.keyDown(document, { key: 'i' })
    expect(mockPush).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'g' })
    fireEvent.keyDown(document, { key: 'i' })
    expect(mockPush).toHaveBeenCalledExactlyOnceWith('/progress')
  })

  it('keeps an unsaved habit until its navigation guard approves leaving', () => {
    const onNavigate = vi.fn<(action: () => void) => void>()
    const guard = renderHook(() => useHabitCreateNavigationGuard({
      active: true, dirty: true, leaving: false, onNavigate, onReturn: vi.fn(),
    }))
    render(<Harness />)
    fireEvent.keyDown(document, { key: 'g' })
    fireEvent.keyDown(document, { key: 'i' })
    expect(onNavigate).toHaveBeenCalledTimes(1)
    expect(mockPush).not.toHaveBeenCalled()
    expect(getCurrentRouteTransitionIntent()).toBe('neutral')
    fireEvent.keyDown(document, { key: 'g' })
    fireEvent.keyDown(document, { key: 'i' })
    expect(onNavigate).toHaveBeenCalledTimes(2)
    act(() => onNavigate.mock.calls[1]![0]())
    expect(mockPush).toHaveBeenCalledExactlyOnceWith('/progress')
    expect(getCurrentRouteTransitionIntent()).toBe('tab')
    guard.unmount()
  })
})
