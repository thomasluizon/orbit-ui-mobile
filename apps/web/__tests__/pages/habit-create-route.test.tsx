import type { ComponentProps } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildHabitCreateHref } from '@orbit/shared/utils'
import HabitCreateRoute from '@/app/(app)/habits/new/page'
import { CreateHabitModal } from '@/components/habits/create-habit-modal'
import { useUIStore } from '@/stores/ui-store'
import { RouteContext } from '@/components/navigation/route-context'

const route = vi.hoisted(() => ({ params: new URLSearchParams(), replace: vi.fn(), form: null as ComponentProps<typeof CreateHabitModal> | null }))
vi.mock('next/navigation', () => ({ usePathname: () => '/habits/new', useRouter: () => ({ replace: route.replace }), useSearchParams: () => route.params }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/components/habits/create-habit-modal', () => ({ CreateHabitModal: (props: ComponentProps<typeof CreateHabitModal>) => {
  route.form = props
  return <button type="button" onClick={() => props.onOpenChange(false)}>back</button>
} }))

beforeEach(() => { vi.clearAllMocks(); route.params = new URLSearchParams(); useUIStore.getState().setAstraConversationOpen(false) })
describe('habit creation route', () => {
  it.each(['/?date=2026-09-05', '/calendar', '/search', '/profile'])('preserves prefills and returns from %s', (from) => {
    route.params = new URL(buildHabitCreateHref({ from, title: 'Walk & read', date: '2026-09-05' }), 'https://example.test').searchParams
    render(<HabitCreateRoute />)
    expect(route.form).toMatchObject({ open: true, presentation: 'screen', initialTitle: 'Walk & read', initialDate: '2026-09-05' })
    fireEvent.click(screen.getByRole('button', { name: 'back' }))
    expect(route.replace).toHaveBeenCalledWith(from)
  })
  it.each([2, 8])('returns a copied link with history length %s to its explicit origin', (historyLength) => {
    route.params = new URLSearchParams({ from: '/search' })
    const length = vi.spyOn(history, 'length', 'get').mockReturnValue(historyLength)
    render(<HabitCreateRoute />)
    fireEvent.click(screen.getByRole('button', { name: 'back' }))
    expect(route.replace).toHaveBeenCalledWith('/search')
    length.mockRestore()
  })

  it('restores the conversation on return', () => {
    route.params = new URL(buildHabitCreateHref({ from: '/', conversation: true }), 'https://example.test').searchParams
    vi.spyOn(history, 'go').mockImplementation(() => {})
    render(<HabitCreateRoute />)
    expect(route.form?.fromConversation).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'back' }))
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
    vi.restoreAllMocks()
  })
  it('makes a direct link usable without history', () => {
    render(<><RouteContext /><HabitCreateRoute /></>)
    expect(document.title).toBe('habits.form.newHabit · Orbit')
    fireEvent.click(screen.getByRole('button', { name: 'back' }))
    expect(route.replace).toHaveBeenCalledWith('/')
  })
})
