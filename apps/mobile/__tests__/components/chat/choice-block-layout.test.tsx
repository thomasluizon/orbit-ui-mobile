import React from 'react'
import { Text } from 'react-native'
import { afterEach, expect, it, vi } from 'vitest'
import { chatResponseSchema } from '@orbit/shared/types/chat'
import { makeChoiceLayoutBlock, makePickListLayoutBlock } from '@orbit/shared/test-support/choice-layout-fixtures'
import { makeHeldHabitMessage } from '@orbit/shared/test-support/chat-fixtures'
import { MessageBubble } from '@/components/message-bubble'
import { i18n } from '@/lib/i18n'
import { __setWindowDimensions } from '@/test-mocks/react-native'
import { measureProfileRow } from '@/__tests__/support/profile-row-geometry'

vi.unmock('react-i18next')
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@react-native-clipboard/clipboard', () => ({ default: {} }))
vi.mock('@/hooks/use-habits', () => ({
  useHabits: () => ({ data: { habitsById: new Map() } }), useLogHabit: () => ({ mutate: vi.fn() }),
  useBulkCreateHabits: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/hooks/use-notifications', () => ({ useMarkNotificationRead: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { uses24HourClock: false } }) }))
vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayTime: (value: string) => value, displayClock: (value: string) => value }) }))
vi.mock('@/hooks/use-resolve-clarification', () => ({ useResolveClarification: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('@/components/ui/markdown', () => ({ Markdown: ({ children }: { children: string }) => <Text style={{ fontSize: 16, lineHeight: 24 }}>{children}</Text> }))
vi.mock('@/components/shell/composer', () => ({ Composer: () => null }))
vi.mock('@/components/goals/goal-detail-drawer', () => ({ GoalDetailDrawer: () => null }))

const renderer = require('react-test-renderer') as typeof import('react-test-renderer')
type Tree = ReturnType<typeof renderer.create> & { toJSON: () => Parameters<typeof measureProfileRow>[0]; unmount: () => void }
afterEach(async () => { __setWindowDimensions({ width: 412, height: 915, scale: 1, fontScale: 1 }); await i18n.changeLanguage('en') })

it.each([320, 412, 1352].flatMap(width => (['en', 'pt-BR'] as const).flatMap(locale => [1, 2].map(scale => ({ width, scale, locale })))))(
  'keeps both Android answer blocks and option lines and habit names at $width and text scale $scale in $locale', async ({ width, scale, locale }) => {
    __setWindowDimensions({ width, height: 915, scale: 1, fontScale: scale })
    await i18n.changeLanguage(locale)
    const reply = chatResponseSchema.parse({ actions: [], parts: [{ type: 'block', kind: 'choice', block: makeChoiceLayoutBlock(locale, false) }, { type: 'block', kind: 'choice', block: makeChoiceLayoutBlock(locale, true) }, { type: 'block', kind: 'pickList', block: makePickListLayoutBlock(locale) }] })
    let tree!: Tree
    await renderer.act(() => { tree = renderer.create(<MessageBubble message={makeHeldHabitMessage({ ...reply, pendingOperations: [], content: '' })} />) as Tree })
    try {
      const layout = measureProfileRow(tree.toJSON(), width - 32, scale)
      const frames = layout.boxes.filter(box => box.testID === 'block-frame-resting')
      expect(frames).toHaveLength(3)
      expect(frames.every(box => box.width <= width - 32)).toBe(true)
      const labels = [...makeChoiceLayoutBlock(locale, false).options, ...makeChoiceLayoutBlock(locale, true).options, ...makePickListLayoutBlock(locale).items].map(option => option.label)
      const rowControls = layout.parts.filter(part => part.slot === 'radio-row-control' || part.slot === 'check-row-control')
      expect(rowControls).toHaveLength(6)
      for (const [index, label] of labels.entries()) {
        const control = rowControls[index]!
        const text = layout.texts.filter(text => text.label === label).sort((left, right) => Math.abs(left.top - control.top) - Math.abs(right.top - control.top))[0]
        expect(text, label).toBeDefined()
        expect(Math.abs(control.top + control.height / 2 - text!.top - text!.height / text!.lines / 2)).toBeLessThanOrEqual(1)
        if (scale === 1 && index < 4) expect(text!.lines).toBe(1)
        if (index < 4) expect(text!.clipped).toBe(false)
        expect(text!.lineHeightRatio).toBeGreaterThanOrEqual(1.4)
        expect(text!.left).toBeGreaterThanOrEqual(0)
        expect(text!.right).toBeLessThanOrEqual(width - 32 + 1)
        expect(text!.height).toBeGreaterThanOrEqual(16 * scale)
      }
      if (scale === 1) for (const description of makeChoiceLayoutBlock(locale, false).options.map(option => option.description)) {
        expect(layout.texts.filter(text => text.label === description).every(text => text.lines === 1 && !text.clipped)).toBe(true)
      }
      const controls = layout.controls.filter(control => labels.some(label => control.accessibilityLabel?.includes(label)))
      expect(controls).toHaveLength(8)
      const rows = layout.parts.filter(part => part.slot === 'list-row-body')
      expect(rows).toHaveLength(6)
      expect(rows.every(row => row.height >= 48)).toBe(true)
      expect(controls.every(control => control.height >= 24)).toBe(true)
    } finally { await renderer.act(() => tree.unmount()) }
  },
)
