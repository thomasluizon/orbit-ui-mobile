import { View } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { habitSuggestionDraftFixture as draft, makeHabitSuggestionMessage } from '@orbit/shared/test-support/chat-fixtures'
import type { ChatMessage } from '@orbit/shared/types'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { PADDING } from '@orbit/shared/theme'
import { HabitSuggestionsCard } from '@/components/chat/habit-suggestions-card'
import { i18n } from '@/lib/i18n'
import { measureStartEdgeIconAction } from '@/__tests__/support/start-edge-icon-action'

vi.unmock('react-i18next')
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('@/lib/motion', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/motion')>(), usePrefersReducedMotion: () => true }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/use-habits', () => ({ useHabits: vi.fn(), useLogHabit: vi.fn(), useHabitMetrics: vi.fn() }))
vi.mock('@/hooks/use-habit-logging', () => ({ useLogHabit: vi.fn() }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { timeZone: 'UTC' } }) }))
const mocks = vi.hoisted(() => ({ refine: vi.fn(), preview: vi.fn(), scheduleError: false }))
vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayTime: (time: string) => time }) }))
vi.mock('@/hooks/use-habit-suggestion-actions', () => ({ useHabitSuggestionActions: () => ({ refine: mocks.refine, preview: mocks.preview, isCurrent: () => true, transition: vi.fn() }) }))
vi.mock('@/hooks/use-habit-queries', () => ({
  useHabits: vi.fn(),
  useHabitMetrics: vi.fn(),
  useHabitDetail: (id: string | null) => ({ data: id && !mocks.scheduleError ? { ...createMockHabit({ id }), children: [] } : undefined, isError: Boolean(id) && mocks.scheduleError, refetch: vi.fn() }),
}))

type Tree = ReactTestRenderer & Parameters<typeof measureStartEdgeIconAction>[0]
type Failure = { name: string; existing?: boolean; trigger?: (tree: Tree) => Promise<void> }

function pressables(tree: Tree, label: string) {
  return tree.root.findAll((node) => String(node.type) === 'Pressable' && (node.props.accessibilityLabel === label || node.findAll((child) => String(child.type) === 'Text' && child.props.children === label).length > 0))
}

function retries(tree: Tree) {
  return pressables(tree, i18n.t('common.retry'))
}

async function press(tree: Tree, label: string) {
  const control = pressables(tree, label)[0]!
  await act(async () => { await (control.props.onPress as () => Promise<void> | void)() })
}

const failures: Failure[] = [
  { name: 'row refine error', trigger: async (tree) => { mocks.refine.mockRejectedValueOnce(new Error('Unavailable')); await press(tree, i18n.t('chat.habitSuggestions.swap')) } },
  { name: 'card preview error', trigger: async (tree) => { mocks.preview.mockRejectedValueOnce(new Error('Unavailable')); await press(tree, i18n.t('chat.habitSuggestions.addAll')) } },
  { name: 'current schedule error', existing: true },
]

function suggestionMessage(existing: boolean): ChatMessage {
  const message = makeHabitSuggestionMessage()
  if (!existing) return message
  return { ...message, parts: [{ type: 'block', kind: 'habitSuggestions', block: { language: 'en', drafts: [{ ...draft, existingHabitId: '33333333-3333-4333-8333-333333333333' }] } }] }
}

async function mount(existing: boolean) {
  const message = suggestionMessage(existing)
  const part = message.parts![0]!
  if (part.type !== 'block' || part.kind !== 'habitSuggestions') throw new Error('The fixture carries no habit suggestions block')
  let tree!: Tree
  await act(() => { tree = create(<View style={{ paddingHorizontal: PADDING.screenGutter }}><HabitSuggestionsCard card={part.block} message={message} /></View>) as Tree })
  return tree
}

beforeEach(() => {
  mocks.refine.mockReset()
  mocks.preview.mockReset()
  mocks.scheduleError = false
})
afterEach(async () => { await i18n.changeLanguage('en') })

describe('habit suggestion retries below error text', () => {
  it.each(failures.flatMap((failure) => ([412, 1280] as const).flatMap((width) => (['en', 'pt-BR'] as const).map((locale) => ({ ...failure, width, locale })))))(
    'centres the $name retry glyph and starts it on the text column at $width in $locale', async ({ existing, trigger, width, locale }) => {
      await i18n.changeLanguage(locale)
      mocks.scheduleError = Boolean(existing)
      const tree = await mount(Boolean(existing))
      try {
        await trigger?.(tree)
        expect(retries(tree)).toHaveLength(1)
        const geometry = measureStartEdgeIconAction(tree, width, i18n.t('common.retry'))
        const detail = JSON.stringify(geometry)
        const hitExtension = (geometry.targetWidth - geometry.paint.width) / 2
        expect(geometry.texts.length, detail).toBeGreaterThanOrEqual(1)
        expect(geometry.paint.width, detail).toBe(44)
        expect(geometry.targetWidth, detail).toBe(48)
        expect(Math.abs((geometry.glyph.left + geometry.glyph.right) / 2 - (geometry.paint.left + geometry.paint.right) / 2), detail).toBeLessThanOrEqual(0.5)
        expect(Math.abs((geometry.glyph.top + geometry.glyph.bottom) / 2 - (geometry.paint.top + geometry.paint.bottom) / 2), detail).toBeLessThanOrEqual(0.5)
        expect(Math.abs(geometry.glyph.left - geometry.texts[0]!.left), detail).toBeLessThanOrEqual(0.5)
        expect(geometry.paint.top, detail).toBeGreaterThanOrEqual(geometry.texts[0]!.bottom)
        expect(geometry.texts[0]!.left - geometry.root.left, detail).toBeGreaterThanOrEqual(14)
        expect(geometry.paint.left - hitExtension, detail).toBeGreaterThanOrEqual(geometry.root.left)
      } finally { await act(() => tree.unmount()) }
    })

  it.each(failures.filter((failure) => failure.trigger))('keeps the $name in one polite live region', async ({ trigger }) => {
    const tree = await mount(false)
    try {
      await trigger!(tree)
      const retry = retries(tree)[0]!
      let region = retry.parent
      while (region && region.props.accessibilityLiveRegion === undefined) region = region.parent
      expect(region?.props.accessibilityLiveRegion).toBe('polite')
    } finally { await act(() => tree.unmount()) }
  })
})
