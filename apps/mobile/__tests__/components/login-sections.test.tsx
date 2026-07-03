import React from 'react'
import { describe, expect, it } from 'vitest'

import { createTokensV2 } from '@/lib/theme'
import { createLoginStyles } from '@/app/login-styles'
import {
  LoginHeader,
  ReferralBanner,
  LoginSuccessMessage,
} from '@/app/login-sections'

const TestRenderer = require('react-test-renderer')

const styles = createLoginStyles(createTokensV2('purple', 'dark'))
const t = (key: string) => key

describe('LoginHeader', () => {
  it('marks the step title as an accessibility header', () => {
    let tree: any

    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <LoginHeader step="email" t={t} styles={styles} />,
      )
    })

    const heading = tree.root.find(
      (node: any) => node.props.accessibilityRole === 'header',
    )

    expect(heading.props.children).toBe('auth.signIn')
  })
})

describe('ReferralBanner', () => {
  it('announces the invite through a polite live region', () => {
    let tree: any

    TestRenderer.act(() => {
      tree = TestRenderer.create(<ReferralBanner t={t} styles={styles} />)
    })

    const liveRegion = tree.root.find(
      (node: any) => node.props.accessibilityLiveRegion === 'polite',
    )

    expect(liveRegion.props.accessibilityLiveRegion).toBe('polite')
  })
})

describe('LoginSuccessMessage', () => {
  it('announces the message through a polite live region', () => {
    let tree: any

    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <LoginSuccessMessage message="Code sent" styles={styles} />,
      )
    })

    const liveRegion = tree.root.find(
      (node: any) => node.props.accessibilityLiveRegion === 'polite',
    )

    expect(liveRegion.props.children).toBe('Code sent')
  })
})
