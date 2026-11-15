import React from 'react'
import { View } from 'react-native'
import { act, create } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildOnboardingScheduleFromPhrase, ONBOARDING_WHAT_STEP } from '@orbit/shared/utils'
import { measureSafeArea, type GeometryTree } from '@/__tests__/support/safe-area-geometry'
import { __setWindowDimensions } from '@/test-mocks/react-native'
import { testI18n } from '@/__tests__/support/i18n'
import { GuidedOnboardingFlow, type GuidedOnboardingProps } from '@/components/onboarding/guided-onboarding-flow'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'

const mocks = vi.hoisted(() => ({ language: 'pt-BR' }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: testI18n.getFixedT(mocks.language), i18n: { language: mocks.language } }),
}))
vi.mock('@/lib/posthog', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/posthog')>(), captureGuidedFlowEvent: vi.fn() }))
vi.mock('@/components/ui/flow-screen', async () => {
  const { View: HostView } = await import('react-native')
  return { FlowScreen: ({ children }: { children: React.ReactNode }) => <HostView style={{ flex: 1 }}>{children}</HostView> }
})
vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayTime: (time: string | null) => time ?? '' }) }))
vi.mock('@/components/ui/app-text-input', () => ({ AppTextInput: (props: Record<string, unknown>) => React.createElement('TextInput', props) }))

const HEIGHT = 667
const noop = () => {}
let tree: GeometryTree | null = null
afterEach(async () => { if (tree) await act(() => tree!.unmount()); tree = null })

function props(): GuidedOnboardingProps {
  return {
    step: ONBOARDING_WHAT_STEP, sentence: '', locale: 'pt-BR', marks: [], isLive: true, emoji: '◎', schedule: buildOnboardingScheduleFromPhrase('', 'pt-BR'), dueTime: '',
    proposed: false, correcting: false, atLimit: false, allowance: 5, createFailed: false, creating: false, suggestionPending: false, reminderDecision: 'idle',
    reminderState: 'ask', createdTitle: '', onAccount: noop, onSentence: noop, onContinueWhat: noop, onStarter: noop, onCorrect: noop, onToggleDay: noop, onTime: noop,
    onMode: noop, onFrequencyUnit: noop, onQuantity: noop, onIntervalWeeks: noop, onSave: noop, onAllow: noop, onContinueWithout: noop, onEditSchedule: noop,
    habitEmoji: '', emojiProposed: false, onEmoji: noop, completionPending: false, offline: false, notices: null, onBack: noop, onSkip: noop,
  }
}

describe.each([320, 360, 384, 412])('guided onboarding block at %i px', (width) => {
  it.each([[false, 'talk'], [true, 'what']] as const)('centres the block in the space between the header and the primary action, intro seen %s', async (introSeen, stepKey) => {
    useOnboardingDraftStore.setState({ introSeen })
    __setWindowDimensions({ width, height: HEIGHT, scale: 1, fontScale: 1 })
    await act(() => { tree = create(<View style={{ width, height: HEIGHT }}><GuidedOnboardingFlow {...props()} /></View>) as GeometryTree })
    const boxes = measureSafeArea(tree!.toJSON(), (host) => host.type === 'ScrollView' ? 'free-area' : host.props.testID === `question-flow-step-${stepKey}` ? 'block' : undefined, { width, height: HEIGHT })
    const free = boxes.get('free-area')!
    const block = boxes.get('block')!
    expect(free.bottom - free.top).toBeGreaterThan(block.bottom - block.top)
    expect(Math.abs((block.top + block.bottom) / 2 - (free.top + free.bottom) / 2)).toBeLessThanOrEqual(1)
  })
})
