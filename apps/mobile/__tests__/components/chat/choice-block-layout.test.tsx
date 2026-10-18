import React from 'react'
import { Text } from 'react-native'
import { afterEach, expect, it, vi } from 'vitest'
import { chatResponseSchema } from '@orbit/shared/types/chat'
import partsFixture from '@orbit/shared/test-support/chat-parts.fixture.json'
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

it.each([320, 412, 1352].flatMap(width => [1, 2].map(scale => ({ width, scale }))))(
  'keeps both Android answer blocks and long Portuguese labels whole at $width and text scale $scale', async ({ width, scale }) => {
    __setWindowDimensions({ width, height: 915, scale: 1, fontScale: scale })
    await i18n.changeLanguage('pt-BR')
    const reply = chatResponseSchema.parse({ actions: [], parts: partsFixture.blocks.filter(part => part.kind === 'choice' || part.kind === 'pickList') })
    let tree!: Tree
    await renderer.act(() => { tree = renderer.create(<MessageBubble message={makeHeldHabitMessage({ ...reply, pendingOperations: [], content: '' })} />) as Tree })
    try {
      const layout = measureProfileRow(tree.toJSON(), width - 32, scale)
      const frames = layout.boxes.filter(box => box.testID === 'block-frame-resting')
      expect(frames).toHaveLength(2)
      expect(frames.every(box => box.width <= width - 32)).toBe(true)
      const labels = partsFixture.blocks.filter(part => part.kind === 'choice' || part.kind === 'pickList').flatMap(part => part.block.options?.map(option => option.label) ?? part.block.items?.map(item => item.label) ?? [])
      for (const label of labels) {
        const text = layout.texts.find(text => text.label === label)
        expect(text, label).toBeDefined()
        expect(text!.clipped).toBe(false)
        expect(text!.lineHeightRatio).toBeGreaterThanOrEqual(1.4)
        expect(text!.left).toBeGreaterThanOrEqual(0)
        expect(text!.right).toBeLessThanOrEqual(width - 32 + 1)
        expect(text!.height).toBeGreaterThanOrEqual(16 * scale)
      }
      const controls = layout.controls.filter(control => labels.some(label => control.accessibilityLabel?.includes(label)))
      expect(controls).toHaveLength(7)
      expect(controls.every(control => control.height >= 48)).toBe(true)
    } finally { await renderer.act(() => tree.unmount()) }
  },
)
