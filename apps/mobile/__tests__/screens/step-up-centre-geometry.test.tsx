import React from 'react'
import { View } from 'react-native'
import { act, create } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { measureSafeArea, type GeometryTree } from '@/__tests__/support/safe-area-geometry'
import { __setWindowDimensions } from '@/test-mocks/react-native'
import { testI18n } from '@/__tests__/support/i18n'
import { GuidedStepUp, type GuidedStepUpState } from '@/components/auth/guided-step-up'

const mocks = vi.hoisted(() => ({ language: 'pt-BR' }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: testI18n.getFixedT(mocks.language), i18n: { language: mocks.language } }),
}))
vi.mock('@/lib/posthog', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/posthog')>(), captureGuidedFlowEvent: vi.fn() }))

const HEIGHT = 780
let tree: GeometryTree | null = null
afterEach(async () => { if (tree) await act(() => tree!.unmount()); tree = null })

const noop = () => {}
const challenge = { kind: 'challenge', checking: false, code: '', codeFocusRequest: undefined, cooldownSeconds: 42, email: 'ada.lovelace@example.com', expired: false, onCancel: noop, onCodeChange: noop, onConfirm: noop, onResend: noop, requestError: null, requesting: false } as const
const states: Record<string, { stepKey: string; state: GuidedStepUpState }> = {
  'code question': { stepKey: 'code', state: challenge },
  'expired code': { stepKey: 'expired', state: { ...challenge, expired: true } },
  'attempts ran out': { stepKey: 'exhausted', state: { kind: 'exhausted', backLabel: 'Voltar', lockSeconds: 754, onBack: noop } },
  'account closes': { stepKey: 'done', state: { kind: 'success', scheduledAt: '2026-09-24T03:00:00Z', deletionDate: '24 de setembro de 2026', showProNotice: true, onSignOut: noop } },
}

describe.each([320, 360, 384, 412])('the guided step-up block at %i px', (width) => {
  it.each(Object.keys(states).flatMap((name) => (['pt-BR', 'en'] as const).map((language) => ({ name, language }))))('centres the $name block between the header and the primary action in $language', async ({ name, language }) => {
    mocks.language = language
    const { stepKey, state } = states[name]!
    __setWindowDimensions({ width, height: HEIGHT, scale: 1, fontScale: 1 })
    await act(() => { tree = create(<View style={{ width, height: HEIGHT }}><GuidedStepUp operation="delete" state={state} /></View>) as GeometryTree })
    const boxes = measureSafeArea(tree!.toJSON(), (host) => host.type === 'ScrollView' ? 'free-area' : host.props.testID === `question-flow-step-${stepKey}` ? 'block' : undefined, { width, height: HEIGHT })
    const free = boxes.get('free-area')!
    const block = boxes.get('block')!
    expect(free.bottom - free.top).toBeGreaterThan(block.bottom - block.top)
    expect(Math.abs((block.top + block.bottom) / 2 - (free.top + free.bottom) / 2)).toBeLessThanOrEqual(1)
    expect(tree!.root.findAll((node) => (node.props as { testID?: string }).testID === 'orbit-mascot')).toHaveLength(0)
  })
})
