import React, { StrictMode, type ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildHabitCreateHref } from '@orbit/shared/utils'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { useTodayDate } from '@/app/(tabs)/use-today-date'
import { TodayModals } from '@/components/today/today-modals'
import { useUIStore } from '@/stores/ui-store'

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')
const navigation = vi.hoisted(() => ({ push: vi.fn(), date: undefined as string | undefined, timeZone: 'UTC', locale: 'en' }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: navigation.push }), usePathname: () => '/', useLocalSearchParams: () => ({ date: navigation.date }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: createMockProfile({ timeZone: navigation.timeZone }) }) }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({
  i18n: { language: navigation.locale },
  t: (key: string) => {
    const messages = navigation.locale === 'en' ? en : ptBR
    const value = messages.dates[key.slice('dates.'.length) as keyof typeof messages.dates]
    return typeof value === 'string' ? value : key
  },
}) }))
vi.mock('@/components/habits/edit-habit-modal', () => ({ EditHabitModal: () => null }))
vi.mock('@/components/referral/referral-drawer', () => ({ ReferralDrawer: () => null }))
vi.mock('@/components/ui/confirm-sheet', () => ({ ConfirmSheet: () => null }))

const originalTimeZone = process.env.TZ
beforeEach(() => {
  process.env.TZ = 'UTC'
  vi.clearAllMocks()
  navigation.date = undefined
  navigation.timeZone = 'UTC'
  navigation.locale = 'en'
  useUIStore.setState(useUIStore.getInitialState())
})
afterEach(() => {
  vi.useRealTimers()
  if (originalTimeZone === undefined) delete process.env.TZ
  else process.env.TZ = originalTimeZone
})

const props: ComponentProps<typeof TodayModals> = {
  showCreateModal: true,
  createInitialDate: '2026-09-05',
  onCloseCreateModal: () => useUIStore.getState().setShowCreateModal(false),
  editHabit: null,
  editHabitParentIsGeneral: null,
  onCloseEdit: () => {},
  editHabitOnSaved: null,
  showBulkDeleteConfirm: false,
  onBulkDeleteOpenChange: () => {},
  onConfirmBulkDelete: () => {},
  selectedCount: 0,
  showReferral: false,
  onCloseReferral: () => {},
}

function AccountTodayEntry() {
  const date = useTodayDate()
  return <TodayModals {...props} createInitialDate={date.dateStr} />
}

describe('Today creation entry', () => {
  it.each([false, true])('pushes once with the selected date and conversation origin %s', async (conversation) => {
    useUIStore.setState({ showCreateModal: true, astraConversationOpen: conversation })
    let tree!: import('react-test-renderer').ReactTestRenderer
    await TestRenderer.act(() => { tree = TestRenderer.create(<StrictMode><TodayModals {...props} /></StrictMode>) })
    expect(navigation.push).toHaveBeenCalledExactlyOnceWith(buildHabitCreateHref({ from: '/', date: props.createInitialDate, conversation }))
    expect(useUIStore.getState().showCreateModal).toBe(false)
    expect(useUIStore.getState().astraConversationOpen).toBe(false)
    await TestRenderer.act(() => tree.update(<></>))
  })

  it.each(['en', 'pt-BR'].flatMap((locale) => [
    { locale, instant: '2026-10-21T02:40:00Z', timeZone: 'America/Sao_Paulo', accountDay: '2026-10-20' },
    { locale, instant: '2026-10-20T12:40:00Z', timeZone: 'Pacific/Kiritimati', accountDay: '2026-10-21' },
  ].flatMap((boundary) => [undefined, '2026-10-19', '2026-10-26'].map((date) => ({ ...boundary, date })))))('uses the $locale account in $timeZone or explicit date $date', async ({ locale, instant, timeZone, accountDay, date }) => {
    vi.setSystemTime(new Date(instant))
    navigation.locale = locale
    navigation.timeZone = timeZone
    navigation.date = date
    useUIStore.setState({ showCreateModal: true })
    let tree!: import('react-test-renderer').ReactTestRenderer
    await TestRenderer.act(() => { tree = TestRenderer.create(<AccountTodayEntry />) })
    expect(navigation.push).toHaveBeenCalledExactlyOnceWith(buildHabitCreateHref({ from: '/', date: date ?? accountDay }))
    await TestRenderer.act(() => tree.update(<></>))
  })

  it('leaves an unseeded entry without a date', async () => {
    useUIStore.setState({ showCreateModal: true })
    let tree!: import('react-test-renderer').ReactTestRenderer
    await TestRenderer.act(() => { tree = TestRenderer.create(<TodayModals {...props} createInitialDate={null} />) })
    expect(navigation.push).toHaveBeenCalledExactlyOnceWith('/habits/new?from=%2F')
    await TestRenderer.act(() => tree.update(<></>))
  })
})
