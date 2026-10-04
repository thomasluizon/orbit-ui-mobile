import { describe, expect, it } from 'vitest'
import { resolveSettingsRowText } from '../hooks/settings-row-text-core'

describe('resolveSettingsRowText', () => {
  for (const textMode of ['label', 'personal'] as const) {
    for (const expanded of [false, true]) {
      for (const hasAction of [false, true]) {
        it.each([undefined, '', 'settings-row-label', 'settings-row-label-'.repeat(20)])(
          `${textMode}, expanded=${expanded}, action=${hasAction}, controls=%s`,
          (labelId) => {
            let toggled = false
            let opened = false
            const onToggle = () => { toggled = true }
            const onAction = hasAction ? () => { opened = true } : undefined

            const resolved = resolveSettingsRowText({ textMode, expanded, labelId, onAction, onToggle })

            if (hasAction) {
              expect(resolved).toEqual({ onAction, expandedState: undefined, controls: undefined })
              resolved.onAction?.()
              expect(opened).toBe(true)
              expect(toggled).toBe(false)
            } else if (textMode === 'personal') {
              expect(resolved).toEqual({ onAction: onToggle, expandedState: expanded, controls: labelId })
              resolved.onAction?.()
              expect(toggled).toBe(true)
              expect(opened).toBe(false)
            } else {
              expect(resolved).toEqual({ onAction: undefined, expandedState: undefined, controls: undefined })
              expect(toggled).toBe(false)
              expect(opened).toBe(false)
            }
          },
        )
      }
    }
  }
})
