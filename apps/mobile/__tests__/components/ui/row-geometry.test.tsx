import React from 'react'
import { __setWindowDimensions } from '../../../test-mocks/react-native'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { Pressable, StyleSheet, View } from 'react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockHabit, createMockProfile } from '@orbit/shared/__tests__/factories'
import { ListRow } from '@/components/ui/list-row'
import { Badge } from '@/components/ui/badge'
import { CheckRow } from '@/components/ui/check-row'
import { DateRow } from '@/components/ui/date-row'
import { HabitFormFields } from '@/components/habits/habit-form-fields'
import type { HabitFormHelpers } from '@/hooks/use-habit-form'
import type { TagSelectionState } from '@/hooks/use-tag-selection'
import { HabitDetailFields, HabitDetailSchedule } from '@/components/habits/habit-detail-fields'
import { ProfileAstraContent } from '@/app/(tabs)/profile/_components/profile-astra-content'
import { PushDevicesRow } from '@/components/profile/push-devices-row'
import { createTokensV2 } from '@/lib/theme'
import { measureProfileRow } from '../../support/profile-row-geometry'

vi.mock('react-i18next', async (importOriginal) => ({ ...await importOriginal<typeof import('react-i18next')>(), useTranslation: () => ({ t: (key: string) => key === 'common.proBadge' || key === 'habits.detail.proGate' ? 'Pro' : key, i18n: { language: 'en' } }) }))
vi.mock('react-hook-form', async (importOriginal) => ({
  ...await importOriginal<typeof import('react-hook-form')>(),
  useController: () => ({ field: { ref: vi.fn() } }),
  useWatch: ({ control, name }: { control: { values: Record<string, unknown> }; name: string }) => control.values[name],
}))
vi.mock('@/hooks/use-push-notifications', () => ({ usePushNotifications: () => ({ isSupported: true, permissionStatus: 'granted', permissionCanAskAgain: true, requestPermissionOutcome: vi.fn() }) }))
vi.mock('@/components/profile/profile-api-keys', () => ({ ProfileApiKeys: () => null }))
vi.mock('@/components/ui/time-field', () => ({ TimeField: () => null }))
vi.mock('@/components/ui/date-field', () => ({ DateField: () => null }))
vi.mock('@/components/habits/habit-checklist', () => ({ HabitChecklist: () => null }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/components/habits/create-goal-from-habit-sheet', () => ({ CreateGoalFromHabitSheet: () => null }))
vi.mock('@/components/ui/bottom-sheet-app-text-input', () => ({ BottomSheetAppTextInput: () => null }))
vi.mock('@/hooks/use-config', () => ({ useConfig: () => ({ config: { features: { 'habits.subHabits': { enabled: true, planRequirement: 'Pro' } } } }) }))
vi.mock('@/hooks/use-profile', () => ({ useHasProAccess: () => false, useProfile: () => ({ profile: createMockProfile() }) }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: vi.fn() }) }))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
vi.mock('@/hooks/use-tags', () => ({ useTags: () => ({ tags: [] }), useCreateTag: () => ({ isPending: false, mutateAsync: vi.fn() }), useUpdateTag: () => ({ isPending: false, mutateAsync: vi.fn() }), useDeleteTag: () => ({ isPending: false, mutateAsync: vi.fn() }), useAssignTags: () => ({ isPending: false, mutateAsync: vi.fn() }) }))
vi.mock('@/hooks/use-checklist-templates', () => ({ useChecklistTemplates: () => ({ data: [], isLoading: false }), useCreateChecklistTemplate: () => ({ mutateAsync: vi.fn(), isPending: false }), useDeleteChecklistTemplate: () => ({ mutateAsync: vi.fn(), isPending: false }) }))

type Tree = ReactTestRenderer & { toJSON: () => Parameters<typeof measureProfileRow>[0] }
const matrix = [412, 840].flatMap((width) => [1, 2].map((scale) => ({ width, scale })))
const tokens = createTokensV2()

function assertRow(host: Parameters<typeof measureProfileRow>[0], width: number, scale: number, column = false) {
  const geometry = measureProfileRow(host, width, scale)
  const part = (slot: string) => geometry.parts.find((item) => item.slot === slot)
  const body = part('list-row-body')!
  const content = part('list-row-content')!
  expect(body).toBeDefined()
  const first = part('list-row-icon') ?? part('list-row-title')!
  const last = part('list-row-chevron') ?? part('list-row-trailing') ?? part('list-row-value') ?? part('list-row-title')!
  expect(first.left - body.left).toBeCloseTo(16, 1)
  expect(body.right - last.right, JSON.stringify({ body, first, last })).toBeCloseTo(16, 1)
  expect(content.style.gap).toBe(12)
  expect(body.style.paddingVertical).toBe(12)
  expect(body.style.minHeight).toBe(part('list-row-description') ? 68 : 52)
  if (column) { expect(body.left).toBe(-16); expect(body.right).toBe(width + 16) }
  if (scale === 2) expect(geometry.height).toBeGreaterThan(part('list-row-description') ? 68 : 52)
  for (const item of geometry.parts) {
    expect(item.style.paddingHorizontal).not.toBe(0)
    expect(Number(item.style.marginHorizontal ?? 0)).toBeGreaterThanOrEqual(0)
  }
  const title = part('list-row-title')!
  const description = part('list-row-description')
  if (description) expect(description.top - title.bottom).toBeCloseTo(4, 1)
  const chevron = part('list-row-chevron')
  if (chevron) expect(chevron.width).toBe(24)
  const track = part('switch-track')
  if (track) expect(track).toMatchObject({ width: 48, height: 28 })
  return geometry
}


function assertComposition(host: Parameters<typeof measureProfileRow>[0], width: number, scale: number, inset: number) {
  const geometry = measureProfileRow(host, width, scale)
  const bodies = geometry.parts.filter((part) => part.slot === 'list-row-body')
  expect(bodies.length).toBeGreaterThan(0)
  for (const body of bodies) {
    const start = geometry.parts.indexOf(body)
    const end = geometry.parts.findIndex((part, index) => index > start && part.slot === 'list-row-body')
    const parts = geometry.parts.slice(start + 1, end < 0 ? undefined : end)
    const first = parts.find((part) => part.slot === 'list-row-icon') ?? parts.find((part) => part.slot === 'list-row-title')!
    const last = ['list-row-chevron', 'list-row-trailing', 'list-row-value', 'list-row-title'].map((slot) => parts.find((part) => part.slot === slot)).find(Boolean)!
    expect(first.left - body.left).toBeCloseTo(16, 1)
    expect(body.right - last.right, JSON.stringify({ body, first, last })).toBeCloseTo(16, 1)
    expect(first.left).toBeGreaterThanOrEqual(inset)
    expect(body.right).toBeLessThanOrEqual(width)
    for (const part of parts) expect(Number(part.style.marginHorizontal ?? 0)).toBeGreaterThanOrEqual(0)
  }
  return geometry
}

afterEach(() => __setWindowDimensions({ width: 412, height: 915, scale: 1, fontScale: 1 }))

async function mount(element: React.ReactElement) {
  let tree!: Tree
  await act(() => { tree = create(element) as Tree })
  return tree
}

function createFormHelpers(overrides: Record<string, unknown> = {}): HabitFormHelpers {
  const values: Record<string, unknown> = { title: 'Run', emoji: '', frequencyUnit: null, frequencyQuantity: 3, days: [], isFlexible: false, dueDate: '2026-09-02', dueTime: '', dueEndTime: '', endDate: '', description: '', reminderEnabled: false, scheduledReminders: [], checklistItems: [], isBadHabit: false, slipAlertEnabled: false, ...overrides }
  return {
    form: { control: { values }, getValues: vi.fn((field: string) => values[field]), setValue: vi.fn((field: string, value: unknown) => { values[field] = value }), formState: { errors: {} } } as unknown as HabitFormHelpers['form'],
    isOneTime: true, isGeneral: false, isFlexible: false, isRecurring: false, showDayPicker: false, showEndDate: true,
    daysList: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((value) => ({ value, label: value.slice(0, 3), accessibleLabel: value })),
    backendFieldErrors: {}, backendFocusRequest: 0, backendFocusField: undefined, reportBackendErrors: vi.fn(() => false), clearBackendErrors: vi.fn(),
    frequencyUnits: [], setOneTime: vi.fn(), setRecurring: vi.fn(), setFlexible: vi.fn(), setGeneral: vi.fn(), toggleDay: vi.fn(), formatTimeInput: vi.fn(), formatEndTimeInput: vi.fn(), validateAll: vi.fn(() => null),
  }
}

function createTags(): TagSelectionState {
  return { selectedTagIds: [], atTagLimit: false, tagValidationErrorKey: null, toggleTag: vi.fn(), resetTags: vi.fn(), showNewTag: false, setShowNewTag: vi.fn(), newTagName: '', setNewTagName: vi.fn(), newTagColor: '#C4530F', setNewTagColor: vi.fn(), tagColors: [], createAndSelectTag: vi.fn(), acceptSuggestedTag: vi.fn(), editingTagId: null, editTagName: '', setEditTagName: vi.fn(), editTagColor: '#C4530F', setEditTagColor: vi.fn(), startEditTag: vi.fn(), saveEditTag: vi.fn(), cancelEditTag: vi.fn(), deleteTag: vi.fn() }
}

describe('canonical row geometry in Yoga', () => {
  it.each(matrix)('measures primitive slots at $width and text scale $scale', async ({ width, scale }) => {
    __setWindowDimensions({ width, height: 915, scale: 1, fontScale: scale })
    for (const props of [
      { title: 'Details', onClick: vi.fn() },
      { title: 'Tags', value: '3', onClick: vi.fn() },
      { title: 'Analytics', description: 'Share anonymous usage', onClick: vi.fn() },
      { title: 'Notifications', toggle: { checked: true, onChange: vi.fn() } },
      { title: 'Upgrade', trailing: <Badge>Pro</Badge>, onClick: vi.fn() },
    ]) {
      const tree = await mount(<ListRow {...props} />)
      try { assertRow(tree.toJSON(), width, scale) }
      finally { await act(() => tree.update(<></>)) }
    }
    const tree = await mount(<CheckRow label="Family calendar" textMode="personal" checked onChange={vi.fn()} onOpenLabel={vi.fn()} />)
    try {
      const measured = measureProfileRow(tree.toJSON(), width, scale)
      const body = measured.parts.find((part) => part.slot === 'list-row-body')!
      const checkbox = measured.parts.find((part) => part.slot === 'checkbox-box')!
      expect(body.style).toMatchObject({ paddingHorizontal: 16, paddingVertical: 12, minHeight: 52, gap: 12 })
      expect(measured.texts[0]!.left - body.left).toBe(16)
      expect(body.right - checkbox.right).toBe(16)
      expect(checkbox).toMatchObject({ width: 24, height: 24 })
      const controls = tree.root.findAll((node) => node.type === Pressable)
      expect(controls).toHaveLength(2)
      expect(controls[1]!.props.hitSlop).toBe(12)
    } finally { await act(() => tree.update(<></>)) }
    const date = await mount(<DateRow label="Starts" value="September 2" />)
    try { expect(measureProfileRow(date.toJSON(), width, scale).texts[0]!.left).toBe(0) }
    finally { await act(() => date.update(<></>)) }
  })

  it.each(matrix)('measures the owning habit form, detail fields and profile compositions at $width and scale $scale', async ({ width, scale }) => {
    __setWindowDimensions({ width, height: 915, scale: 1, fontScale: scale })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const form = await mount(<QueryClientProvider client={queryClient}><View style={{ paddingHorizontal: 16 }}><HabitFormFields defaultExpanded formHelpers={createFormHelpers({ isBadHabit: true })} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} /></View></QueryClientProvider>)
    try {
      const rows = form.root.findAll((node) => node.type === ListRow)
      for (const title of ['moreDetails', 'upgrade', 'habitTypeAvoid', 'tags', 'goals', 'useTemplate']) {
        const key = title === 'upgrade' ? 'common.upgrade' : `habits.form.${title}`
        expect(rows.some((row) => row.props.title === key), key).toBe(true)
      }
      const geometry = assertComposition(form.toJSON(), width, scale, 16)
      const leading = geometry.parts.filter((part) => part.slot === 'list-row-title')
      expect(leading.find((part) => part.left === 56)).toBeDefined()
      expect(geometry.parts.filter((part) => part.slot === 'list-row-body').some((body) => body.left === 16)).toBe(true)
    } finally { await act(() => form.update(<></>)); queryClient.clear() }
    const habit = createMockHabit({ isBadHabit: true })
    const detail = await mount(<QueryClientProvider client={queryClient}><View style={{ paddingHorizontal: 16 }}><HabitDetailSchedule habit={habit} summary="Every day" open={false} tokens={tokens} onToggle={vi.fn()} onCancel={vi.fn()} onSave={vi.fn()} /><HabitDetailFields habit={habit} hasProAccess={false} relationshipControlsAvailable tokens={tokens} onItemsChange={vi.fn()} onPatch={vi.fn().mockResolvedValue(true)} onUpgrade={vi.fn()} /></View></QueryClientProvider>)
    try {
      const rows = detail.root.findAll((node) => node.type === ListRow)
      expect(rows.some((row) => row.props.title === 'habits.form.habitTypeAvoid')).toBe(true)
      assertComposition(detail.toJSON(), width, scale, 16)
    } finally { await act(() => detail.update(<></>)); queryClient.clear() }
    const profile = await mount(<QueryClientProvider client={queryClient}><View><ProfileAstraContent profile={createMockProfile({ hasProAccess: true })} patchProfile={vi.fn()} /><PushDevicesRow tokens={tokens} count={1} max={5} currentDeviceRegistered supported loading={false} error={false} permissionStatus="granted" registrationStatus="idle" onToggle={vi.fn()} onOpenSettings={vi.fn()} onRetry={vi.fn()} /></View></QueryClientProvider>)
    try {
      const rows = profile.root.findAll((node) => node.type === ListRow).filter((row) => row.props.toggle)
      expect(rows).toHaveLength(3)
      assertComposition(profile.toJSON(), width, scale, 16)
    } finally { await act(() => profile.update(<></>)); queryClient.clear() }
  })
})
