import React from 'react'
import { View } from 'react-native'
import { act, create } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { measureSafeArea, type GeometryTree } from '@/__tests__/support/safe-area-geometry'
import { testI18n } from '@/__tests__/support/i18n'
import { ChatEmptyState } from '@/components/chat/chat-empty-state'
import { createStyles } from '@/components/chat/conversation.styles'
import { createTokensV2 } from '@/lib/theme'

const mocks = vi.hoisted(() => ({ language: 'pt-BR' }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: testI18n.getFixedT(mocks.language), i18n: { language: mocks.language } }),
}))

const HEIGHT = 640
const styles = createStyles(createTokensV2('orange', 'dark'))
let tree: GeometryTree | null = null
afterEach(async () => { if (tree) await act(() => tree!.unmount()); tree = null })

describe.each([320, 360, 384, 412])('the empty thread at %i px', (width) => {
  it.each([
    { language: 'pt-BR', state: 'parado' as const },
    { language: 'en', state: 'parado' as const },
    { language: 'pt-BR', state: 'descansando' as const },
  ])('centres the Orbit group in the thread area above the composer in $language, Orbit $state', async ({ language, state }) => {
    mocks.language = language
    await act(() => {
      tree = create(<View testID="thread-area" style={{ width, height: HEIGHT }}><ChatEmptyState styles={styles} mascotState={state} /></View>) as GeometryTree
    })
    const boxes = measureSafeArea(tree!.toJSON(), (host) => host.props.testID, { width, height: HEIGHT })
    const free = boxes.get('thread-area')!
    const group = boxes.get('empty-state')!
    expect(free.bottom - free.top).toBeGreaterThan(group.bottom - group.top)
    expect(Math.abs((group.top + group.bottom) / 2 - (free.top + free.bottom) / 2)).toBeLessThanOrEqual(1)
    const mascots = tree!.root.findAll((node) => typeof node.type === 'string' && node.props['data-orbit-state'] !== undefined)
    expect(mascots.map((mascot) => mascot.props['data-orbit-state'] as string)).toEqual([state])
  })
})
