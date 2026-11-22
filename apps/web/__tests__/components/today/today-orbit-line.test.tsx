import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createMockProactiveItem } from '@orbit/shared/__tests__/factories'
import { formatAPIDateInTimeZone } from '@orbit/shared/utils'
import { TodayOrbit } from '@/components/today/today-orbit'
import { useUIStore } from '@/stores/ui-store'

const mocks = vi.hoisted(() => ({
  online: true,
  proactive: true,
  profile: { id: 'profile', timeZone: 'UTC', hasProAccess: false, aiMessagesUsed: 0, aiMessagesLimit: 5 } as { id: string; timeZone: string; hasProAccess: boolean; aiMessagesUsed: number; aiMessagesLimit: number; lastCompletionDate?: string },
}))

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: mocks.profile, isPending: false, isError: false }) }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: mocks.online }) }))
vi.mock('@/hooks/use-proactive-item', () => ({ useProactiveItem: () => ({ item: mocks.proactive ? createMockProactiveItem({ text: 'Check in' }) : null, openItem: vi.fn() }) }))

const mascot = (container: HTMLElement) => container.querySelector<SVGElement>('[data-asset="orbit-mascot"]')!
const DAY = 86_400_000
const beyondTheWindow = () => formatAPIDateInTimeZone(new Date(Date.now() - 40 * DAY), 'UTC')
const renderLine = () => render(<TodayOrbit today={formatAPIDateInTimeZone(new Date(), 'UTC')} isTodaySelected suppressed={false} />)

describe('web Orbit line on Hoje', () => {
  beforeEach(() => {
    mocks.online = true
    mocks.proactive = true
    mocks.profile = { id: 'profile', timeZone: 'UTC', hasProAccess: false, aiMessagesUsed: 0, aiMessagesLimit: 5 }
    useUIStore.setState({ orbitConversationOpen: false })
  })
  afterEach(cleanup)

  it('draws the live Orbit at 48 beside the sentence, still while no conversation entry runs with it, and names the row by the sentence', () => {
    const { container } = renderLine()
    expect(mascot(container)).toHaveAttribute('width', '48')
    expect(mascot(container)).toHaveAttribute('data-orbit-state', 'parado')
    expect(mascot(container)).toHaveAttribute('data-orbit-face', 'rig')
    expect(mascot(container)).toHaveAttribute('data-orbit-loop', 'still')
    expect(screen.getByRole('button', { name: 'Check in' })).toHaveAccessibleDescription('todayOrbit.openConversation')
  })

  it('shows Descansando and a first person reason while offline, and the press still opens the conversation', () => {
    mocks.online = false
    const { container } = renderLine()
    expect(mascot(container)).toHaveAttribute('data-orbit-state', 'descansando')
    fireEvent.click(screen.getByRole('button', { name: 'todayOrbit.guided.offline' }))
    expect(useUIStore.getState().orbitConversationOpen).toBe(true)
  })

  it('shows Descansando at the message limit', () => {
    mocks.profile = { ...mocks.profile, aiMessagesUsed: 5 }
    const { container } = renderLine()
    expect(mascot(container)).toHaveAttribute('data-orbit-state', 'descansando')
    expect(screen.getByRole('button', { name: 'conversation.restLimit' })).toBeInTheDocument()
  })

  it('shows the sentence with no count of days for a gap beyond the window, and it opens Progresso', () => {
    mocks.proactive = false
    mocks.profile = { ...mocks.profile, lastCompletionDate: beyondTheWindow() }
    renderLine()
    expect(screen.getByRole('link', { name: 'todayOrbit.guided.returning' })).toHaveAttribute('href', '/progress')
    expect(screen.queryByText('todayOrbit.returningBounded')).not.toBeInTheDocument()
  })
})
