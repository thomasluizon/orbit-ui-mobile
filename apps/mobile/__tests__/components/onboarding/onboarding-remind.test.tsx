import React from 'react'
import { StyleSheet } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import { OnboardingRemind } from '@/components/onboarding/onboarding-remind'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }) }))

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')
type TestNode = ReturnType<typeof TestRenderer.create>['root']

function flatStyle(node: TestNode): Record<string, unknown> {
  return (StyleSheet.flatten(Reflect.get(node.props as object, 'style')) ?? {}) as Record<string, unknown>
}

function hasText(node: TestNode, text: string): boolean {
  return node.findAll((child) => Reflect.get(child.props, 'children') === text).length > 0
}

describe('OnboardingRemind', () => {
  it('uses gap for the ask heading and body', async () => {
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<OnboardingRemind state="ask" title="Walk" dueTime="18:00" />)
    })
    const intro = tree.root.findAll((node) => flatStyle(node).gap === 12 && hasText(node, 'onboarding.flow.remind.title'))
    expect(intro.length).toBeGreaterThan(0)
    const body = tree.root.findAll((node) => Reflect.get(node.props, 'children') === 'onboarding.flow.remind.body')[0]!
    expect(flatStyle(body).marginTop).toBeUndefined()
    const preview = tree.root.findAll((node) => flatStyle(node).gap === 8 && hasText(node, 'onboarding.flow.remind.fine'))
    expect(preview.length).toBeGreaterThan(0)
  })
})
