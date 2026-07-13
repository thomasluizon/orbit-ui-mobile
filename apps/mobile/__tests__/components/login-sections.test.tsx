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

interface TestNode {
  type: unknown
  props: Record<string, unknown>
  find: (predicate: (node: TestNode) => boolean) => TestNode
  findAll: (predicate: (node: TestNode) => boolean) => TestNode[]
}

interface TestRoot {
  root: TestNode
}

const styles = createLoginStyles(createTokensV2('purple', 'dark'))

function render(element: React.ReactElement): TestRoot {
  let tree: TestRoot | undefined
  TestRenderer.act(() => {
    tree = TestRenderer.create(element)
  })
  return tree as TestRoot
}

function createTranslator(copy: Record<string, string>): (key: string) => string {
  return (key) => copy[key] ?? key
}

function findText(root: TestNode, style: unknown): TestNode {
  return root.find((node) => node.type === 'Text' && node.props.style === style)
}

describe('LoginHeader', () => {
  it('marks the step title as an accessibility header', () => {
    const t = (key: string) => key

    const tree = render(<LoginHeader step="email" t={t} styles={styles} />)

    const heading = tree.root.find(
      (node) => node.props.accessibilityRole === 'header',
    )

    expect(heading.props.children).toBe('auth.signIn')
  })
})

describe('ReferralBanner', () => {
  it('announces the localized referral invite through a polite live region', () => {
    const inviteCopy = 'Invite a friend, you both unlock Astra'
    const t = createTranslator({ 'referral.loginBanner': inviteCopy })

    const tree = render(<ReferralBanner t={t} styles={styles} />)

    const liveRegion = tree.root.find(
      (node) => node.props.accessibilityLiveRegion === 'polite',
    )
    const bannerText = findText(liveRegion, styles.referralBannerText)

    expect(bannerText.props.children).toBe(inviteCopy)
  })

  it('falls back to the raw key when the copy is missing so a broken key is visible', () => {
    const t = createTranslator({})

    const tree = render(<ReferralBanner t={t} styles={styles} />)

    const bannerText = findText(tree.root, styles.referralBannerText)

    expect(bannerText.props.children).toBe('referral.loginBanner')
  })
})

describe('LoginSuccessMessage', () => {
  it('renders the provided copy inside the politely announced success text', () => {
    const message = 'We just sent a code to you@example.com'

    const tree = render(<LoginSuccessMessage message={message} styles={styles} />)

    const successText = findText(tree.root, styles.successText)

    expect(successText.props.children).toBe(message)
    expect(successText.props.accessibilityLiveRegion).toBe('polite')
  })

  it('reflects the exact message it is given rather than a fixed string', () => {
    const firstText = findText(
      render(<LoginSuccessMessage message="Verification email sent" styles={styles} />)
        .root,
      styles.successText,
    )
    const secondText = findText(
      render(<LoginSuccessMessage message="Signed in successfully" styles={styles} />)
        .root,
      styles.successText,
    )

    expect(firstText.props.children).toBe('Verification email sent')
    expect(secondText.props.children).toBe('Signed in successfully')
  })
})
