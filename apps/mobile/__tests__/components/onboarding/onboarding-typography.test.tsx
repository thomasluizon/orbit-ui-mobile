import { StyleSheet, type TextStyle } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import { __setWindowDimensions } from '@/test-mocks/react-native'
import { OnboardingWelcome } from '@/components/onboarding/onboarding-welcome'
import { OnboardingRemind } from '@/components/onboarding/onboarding-remind'
import { OnboardingComplete } from '@/components/onboarding/onboarding-complete'
import { renderNavigation } from '../ui/navigation-render'

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/hooks/use-time-format', () => ({
  useTimeFormat: () => ({ displayTime: (value: string) => value }),
}))

describe('drawn onboarding typography', () => {
  it.each([412, 1024])('uses the compact and wide hierarchy at %ipx', (width) => {
    __setWindowDimensions({ width, height: 900, scale: 1, fontScale: 1 })
    const screens = [
      { element: <OnboardingWelcome sentence="" marks={[]} onChange={vi.fn()} />, size: width >= 1024 ? 34 : 28 },
      { element: <OnboardingRemind state="ask" title="Read" dueTime="08:00" isLive />, size: width >= 1024 ? 28 : 22 },
      { element: <OnboardingComplete createdHabit="" emoji="" remindersOff={false} skipped signedOut={false}
        dueToday={false} general={false} onFinish={vi.fn()} />, size: width >= 1024 ? 28 : 22 },
    ]
    for (const screen of screens) {
      const tree = renderNavigation(screen.element)
      const heading = tree.hosts().find((node) => node.props.accessibilityRole === 'header')
      expect(heading).toBeDefined()
      expect.soft(StyleSheet.flatten(heading?.props.style as TextStyle).fontSize).toBe(screen.size)
      tree.unmount()
    }
  })
})
