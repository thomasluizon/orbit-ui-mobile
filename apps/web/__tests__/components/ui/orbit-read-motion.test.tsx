import { act, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query'
import { setOrbitMotionEnabled } from '@orbit/shared/utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HabitEmojiSelector } from '@/components/habits/habit-form-fields/habit-emoji-selector'
import { PillButton } from '@/components/ui/pill-button'
import { OrbitMascot } from '@/components/ui/orbit-mascot'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => <div role="dialog">{children}</div>,
  useSheetHost: () => ({ sheetRef: { current: null }, closeSheet: vi.fn() }),
}))

function setReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

let settle: { resolve: (emoji: string) => void; reject: (error: Error) => void }

function EmojiRead() {
  const suggestion = useMutation({ mutationFn: () => new Promise<string>((resolve, reject) => { settle = { resolve, reject } }) })
  return <HabitEmojiSelector selectedEmoji="" onSelect={() => {}} canSuggest onSuggest={() => suggestion.mutate()} isSuggesting={suggestion.isPending} />
}

function mountEmojiRead() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  render(<QueryClientProvider client={client}><EmojiRead /></QueryClientProvider>)
  return screen.getByRole('button', { name: 'habits.form.suggestEmoji' })
}

async function settled(change: () => void) {
  await act(async () => {
    change()
    await vi.advanceTimersByTimeAsync(0)
  })
}

async function press(button: HTMLElement) {
  await settled(() => fireEvent.click(button))
}

function faceOf(button: HTMLElement) {
  const svg = button.querySelector('svg[data-orbit-face="small"]')!
  return {
    loop: svg.getAttribute('data-orbit-loop'),
    moon: svg.querySelector('[data-part="moon"]')!.getAttribute('transform'),
    eyes: svg.querySelector('[data-part="eye"]')!.getAttribute('transform'),
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
  setReducedMotion(false)
})

afterEach(() => {
  setOrbitMotionEnabled(undefined)
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('the Orbit of the fill icon button on web', () => {
  it('rests as the drawn small face before the press', () => {
    const button = mountEmojiRead()
    expect(faceOf(button)).toEqual({ loop: 'still', moon: null, eyes: null })
    expect(button).not.toHaveAttribute('aria-busy')
  })

  it.each([
    ['ends', () => settle.resolve('🏃')],
    ['fails', () => settle.reject(new Error('read failed'))],
  ])('moves from the press until the read %s, with no skeleton light and the busy state kept', async (_outcome, finish) => {
    const button = mountEmojiRead()
    await press(button)
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(document.getElementById(button.getAttribute('aria-describedby')!)).toHaveTextContent('habits.form.emojiSuggesting')
    expect(button.querySelector('[data-slot="skeleton-face"]')).toBeNull()
    expect(faceOf(button).loop).toBe('running')
    act(() => { vi.advanceTimersByTime(200) })
    const moving = faceOf(button)
    expect(moving.moon).toMatch(/^matrix\(1 0 0 1 /)
    expect(moving.moon).not.toBe('matrix(1 0 0 1 0 0)')
    act(() => { vi.advanceTimersByTime(200) })
    expect(faceOf(button).moon).not.toBe(moving.moon)
    await settled(finish)
    expect(button).not.toHaveAttribute('aria-busy')
    expect(faceOf(button)).toEqual({ loop: 'still', moon: null, eyes: null })
  })

  it('keeps the face still with the busy state under reduced motion', async () => {
    setReducedMotion(true)
    const button = mountEmojiRead()
    await press(button)
    act(() => { vi.advanceTimersByTime(400) })
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button.querySelector('[data-slot="skeleton-face"]')).toBeNull()
    expect(faceOf(button)).toEqual({ loop: 'still', moon: null, eyes: null })
  })

  it('keeps the face still when Orbit em movimento is off', async () => {
    setOrbitMotionEnabled(false)
    const button = mountEmojiRead()
    await press(button)
    act(() => { vi.advanceTimersByTime(400) })
    expect(faceOf(button)).toEqual({ loop: 'still', moon: null, eyes: null })
  })

  it('starts each read at the drawn face', async () => {
    const button = mountEmojiRead()
    await press(button)
    act(() => { vi.advanceTimersByTime(400) })
    await settled(() => settle.resolve('🏃'))
    await press(button)
    expect(faceOf(button)).toEqual({ loop: 'running', moon: 'matrix(1 0 0 1 0 0)', eyes: 'matrix(1 0 0 1 0 0)' })
  })
})

describe('a pill that starts an Orbit read on web', () => {
  it('draws the skeleton light by default and no light when its Orbit carries the busy motion', () => {
    const { rerender } = render(<PillButton variant="ghost" size="sm" loading leadingIcon={<OrbitMascot size={16} />}>Plan</PillButton>)
    const button = screen.getByRole('button', { name: 'Plan' })
    expect(button.querySelector('[data-slot="skeleton-face"]')).not.toBeNull()
    rerender(<PillButton variant="ghost" size="sm" loading loadingFace="icon" leadingIcon={<OrbitMascot size={16} reading />}>Plan</PillButton>)
    expect(button.querySelector('[data-slot="skeleton-face"]')).toBeNull()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button.className).not.toContain('disabled:opacity-40')
    expect(button.className).toContain('shadow-[inset_0_0_0_1.5px_var(--hairline-strong)]')
    expect(button.querySelector('svg')).toHaveAttribute('data-orbit-loop', 'running')
  })
})
