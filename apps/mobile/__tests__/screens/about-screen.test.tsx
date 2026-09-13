import React from 'react'
import { StyleSheet } from 'react-native'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import AboutScreen from '@/app/about'

const TestRenderer = require('react-test-renderer')

type TestNode = {
  type: unknown
  props: Record<string, unknown>
  findAll: (predicate: (node: TestNode) => boolean) => TestNode[]
}

const mocks = vi.hoisted(() => ({
  email: 'profile-account-with-a-long-address@example.com',
  push: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: mocks.push }),
}))

vi.mock('@/hooks/use-go-back-or-fallback', () => ({
  useGoBackOrFallback: () => vi.fn(),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { email: mocks.email } }),
}))

vi.mock('@/components/ui/app-bar', () => ({ AppBar: () => null }))
vi.mock('@/components/onboarding/feature-guide-drawer', () => ({
  FeatureGuideDrawer: () => null,
}))

function flattenedStyle(node: TestNode) {
  return StyleSheet.flatten(node.props.style) as Record<string, unknown>
}

function textContent(node: TestNode): string {
  return node.findAll((child) => typeof child.props.children === 'string')
    .map((child) => child.props.children)
    .join(' ')
}

describe('AboutScreen', () => {
  beforeEach(() => mocks.push.mockClear())

  it('renders the About identity, real facts, and four destinations in order', () => {
    let tree!: { root: TestNode }
    TestRenderer.act(() => {
      tree = TestRenderer.create(<AboutScreen />)
    })

    expect(
      tree.root.findAll(
        (node) => node.type === 'Svg' && node.props.testID === 'orbit-mark-accent',
      ),
    ).toHaveLength(1)
    expect(textContent(tree.root)).toContain('common.appName')
    expect(textContent(tree.root)).toContain('about.tagline')
    expect(textContent(tree.root)).toContain('1.0.0')
    expect(textContent(tree.root)).toContain(mocks.email)

    const destinations = tree.root.findAll(
      (node) =>
        node.type === 'Pressable' &&
        node.props.accessibilityRole === 'button' &&
        typeof node.props.accessibilityLabel === 'string',
    )
    expect(destinations.map((node) => node.props.accessibilityLabel)).toEqual([
      'onboarding.featureGuide.openButton',
      'profile.support.title',
      'terms.title',
      'privacy.title',
    ])
  })

  it('keeps every 412px column shrinkable and lets fact values wrap', () => {
    let tree!: { root: TestNode }
    TestRenderer.act(() => {
      tree = TestRenderer.create(<AboutScreen />)
    })

    for (const testID of ['about-content', 'about-identity', 'about-destinations', 'about-facts']) {
      expect(flattenedStyle(tree.root.findAll((node) => node.props.testID === testID)[0]!)).toMatchObject({
        minWidth: 0,
      })
    }

    for (const fact of ['version', 'account']) {
      expect(flattenedStyle(tree.root.findAll((node) => node.props.testID === `about-fact-${fact}`)[0]!)).toMatchObject({
        flexDirection: 'row',
        flexWrap: 'wrap',
        minWidth: 0,
      })
      expect(flattenedStyle(tree.root.findAll((node) => node.props.testID === `about-fact-${fact}-label`)[0]!)).toMatchObject({
        flexGrow: 1,
        flexShrink: 1,
        minWidth: 0,
      })
      expect(flattenedStyle(tree.root.findAll((node) => node.props.testID === `about-fact-${fact}-value`)[0]!)).toMatchObject({
        flexShrink: 1,
        minWidth: 0,
        maxWidth: '100%',
      })
    }
  })
})
