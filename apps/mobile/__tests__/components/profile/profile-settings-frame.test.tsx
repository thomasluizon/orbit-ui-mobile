import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Text } from 'react-native'
import {
  ProfileSettingsFrame,
} from '@/components/profile/profile-settings-frame'

const TestRenderer = require('react-test-renderer')

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))

vi.mock('@/lib/theme', () => ({
  createTokensV2: () => ({ bgWell: '#222222', bgCard: '#111111', hairline: '#333333', fg1: '#ffffff', fg3: '#999999' }),
  radius: { md: 12, xl: 20, full: 999 },
}))

vi.mock('@/lib/motion', () => ({
  usePrefersReducedMotion: () => true,
}))

describe('ProfileSettingsFrame', () => {
  it('keeps the navigation and More of Orbit in one 32px stack', () => {
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <ProfileSettingsFrame
          isLoading={false}
          loadingLabel="Loading profile"
          labels={{
                  more: 'More of Orbit',
            }}
          rows={{ more: <Text>About Orbit</Text> }}
        />,
      )
    })

    expect(tree.root.findByProps({ testID: 'profile-settings-groups' }).props.style).toEqual(
      expect.objectContaining({ gap: 32 }),
    )
    expect(tree.root.findAll((node: { type: unknown; props: { accessibilityRole?: string } }) =>
      node.type === 'Text' && node.props.accessibilityRole === 'header')).toHaveLength(1)
  })

})
