import React from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { HabitEmojiSelector } from '@/components/habits/habit-form-fields/habit-emoji-selector'
import { createStyles } from '@/components/habits/habit-form-fields/styles'
import { i18n } from '@/lib/i18n'
import { createTokensV2 } from '@/lib/theme'

vi.unmock('react-i18next')

const TestRenderer = require('react-test-renderer')
const tokens = createTokensV2('purple', 'dark')
const styles = createStyles(tokens)

function renderSelector(props: {
  canSuggest: boolean
  isSuggesting?: boolean
  onSuggest?: () => void
}) {
  let tree: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      <I18nextProvider i18n={i18n}>
        <HabitEmojiSelector
          selectedEmoji="📖"
          tokens={tokens}
          styles={styles}
          onSelect={vi.fn()}
          {...props}
        />
      </I18nextProvider>,
    )
  })
  return tree!
}

describe('HabitEmojiSelector', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en')
  })

  it('uses the app i18n label and states why an empty title disables suggestion', () => {
    const tree = renderSelector({ canSuggest: false, onSuggest: vi.fn() })
    const button = tree.root.findAllByProps({ accessibilityLabel: 'Suggest an emoji' })
      .find((node: { props: { onPress?: unknown } }) => typeof node.props.onPress === 'function')

    expect(button).toBeTruthy()
    expect(button!.props.disabled).toBe(true)
    expect(button!.props.accessibilityHint).toBe('Title is required')
    expect(button!.props.accessibilityState).toEqual({ disabled: true, busy: false })
  })

  it('names the pending state and prevents another press', () => {
    const onSuggest = vi.fn()
    const tree = renderSelector({ canSuggest: true, isSuggesting: true, onSuggest })
    const button = tree.root.findAllByProps({ accessibilityLabel: 'Finding an emoji…' })
      .find((node: { props: { onPress?: unknown } }) => typeof node.props.onPress === 'function')

    expect(button).toBeTruthy()
    expect(button!.props.disabled).toBe(true)
    expect(button!.props.accessibilityState).toEqual({ disabled: true, busy: true })
  })
})
