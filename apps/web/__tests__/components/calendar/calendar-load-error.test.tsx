import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { enableTestFlags } from '@orbit/shared/test-support/flag-state'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { CalendarBody } from '@/app/(app)/calendar/_components/calendar-body'

const view = vi.hoisted(() => ({ locale: 'en' as 'en' | 'pt-BR', online: true, reduced: false }))
vi.mock('next-intl', async () => {
  const { createTranslator } = await vi.importActual<typeof import('next-intl')>('next-intl')
  const messages = { en: (await import('@orbit/shared/i18n/en.json')).default, 'pt-BR': (await import('@orbit/shared/i18n/pt-BR.json')).default }
  return { useTranslations: () => createTranslator({ locale: view.locale, messages: messages[view.locale] }) }
})
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: view.online }) }))

const catalogs = { en, 'pt-BR': ptBR } as const
const mascot = () => document.querySelector('svg[data-asset="orbit-mascot"]')

function mount(failed: 'profile' | 'month', retry = vi.fn(), profileError: Error = new Error('profile unavailable')) {
  const profile = failed === 'profile'
  render(<CalendarBody profileReady={!profile} profileError={profile ? profileError : null} onRetryProfile={profile ? retry : vi.fn()} error={profile ? null : 'month unavailable'} onRetry={profile ? vi.fn() : retry}>
    <p>The month</p>
  </CalendarBody>)
  return retry
}

beforeEach(() => {
  view.locale = 'en'; view.online = true; view.reduced = false
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: view.reduced && query.includes('prefers-reduced-motion'), addEventListener: vi.fn(), removeEventListener: vi.fn() }))
})
afterEach(cleanup)

describe.each(['en', 'pt-BR'] as const)('web Calendário load error in %s', (locale) => {
  const messages = catalogs[locale]
  beforeEach(() => { view.locale = locale })

  it.each(['profile', 'month'] as const)('shows Orbit in Parado, one first person line and the retry for a %s failure, centred in the free area', (failed) => {
    enableTestFlags('orbit_guided_flows')
    const retry = mount(failed)
    expect(mascot()).toHaveAttribute('data-orbit-state', 'parado')
    expect(mascot()).toHaveAttribute('width', '96')
    expect(screen.getByRole('alert')).toHaveTextContent(messages.calendar.orbit.loadError)
    expect(document.querySelector('[data-shell-centred-region]')).not.toBeNull()
    expect(screen.queryByText('The month')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: messages.common.retry }))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('runs the idle loop with motion and keeps a still face under reduced motion', () => {
    enableTestFlags('orbit_guided_flows')
    mount('month')
    expect(mascot()).toHaveAttribute('data-orbit-loop', 'running')
    cleanup()
    view.reduced = true
    mount('month')
    expect(mascot()).toHaveAttribute('data-orbit-loop', 'still')
    expect(mascot()).toHaveAttribute('data-orbit-turn', 'rest')
  })

  it('says the read needs a connection when the device is offline', () => {
    enableTestFlags('orbit_guided_flows')
    view.online = false
    mount('month')
    expect(screen.getByRole('alert')).toHaveTextContent(messages.offline.description)
    expect(screen.getByRole('alert')).not.toHaveTextContent(messages.calendar.orbit.loadError)
    expect(mascot()).toHaveAttribute('data-orbit-state', 'parado')
  })

  it('says the read needs a connection when the profile read failed for want of one', () => {
    enableTestFlags('orbit_guided_flows')
    mount('profile', vi.fn(), new TypeError('Failed to fetch'))
    expect(screen.getByRole('alert')).toHaveTextContent(messages.offline.description)
  })

  it('keeps the current card, with no Orbit, when the flag is off', () => {
    const retry = mount('month')
    expect(mascot()).toBeNull()
    expect(document.querySelector('[data-shell-centred-region]')).toBeNull()
    expect(screen.getByText(messages.calendar.loadError)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: messages.common.retry }))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('shows the month when nothing failed', () => {
    enableTestFlags('orbit_guided_flows')
    render(<CalendarBody profileReady profileError={null} onRetryProfile={vi.fn()} error={null} onRetry={vi.fn()}><p>The month</p></CalendarBody>)
    expect(screen.getByText('The month')).toBeInTheDocument()
    expect(mascot()).toBeNull()
  })
})
