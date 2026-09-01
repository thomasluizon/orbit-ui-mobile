import { afterEach, describe, expect, it } from 'vitest'
import type { ColorScheme, ThemeMode } from '@orbit/shared'
import {
  applyThemeTokensToDOM,
  resolveWebThemeVariables,
} from '@/lib/theme-dom'

const SCHEMES: ColorScheme[] = ['purple', 'blue', 'green', 'rose', 'orange', 'cyan']
const MODES: ThemeMode[] = ['dark', 'light']

describe('web theme variables', () => {
  afterEach(() => {
    document.documentElement.className = ''
    document.documentElement.removeAttribute('style')
  })

  for (const scheme of SCHEMES) {
    for (const mode of MODES) {
      it(`${scheme} ${mode} resolves the granted accent`, () => {
        const variables = resolveWebThemeVariables(scheme, mode)

        expect(variables['--primary']).toBe('#C4530F')
        expect(variables['--primary-hover']).toBe('#b74e12')
        expect(variables['--primary-pressed']).toBe('#a24716')
        expect(variables['--primary-rgb']).toBe('196, 83, 15')
        expect(variables['--fg-on-primary']).toBe('#ffffff')
        expect(variables['--primary-soft']).toBe(
          mode === 'dark' ? '#c85716' : '#c15109',
        )
        expect(variables['--primary-dim']).toBe(
          mode === 'dark' ? '#261611' : '#f4ddd3',
        )
      })
    }
  }

  it('honors the served scheme while applying shared values to the document', () => {
    applyThemeTokensToDOM('rose', 'light')

    const root = document.documentElement
    expect(root.classList.contains('scheme-rose')).toBe(true)
    expect(root.classList.contains('light')).toBe(true)
    expect(root.style.getPropertyValue('--primary')).toBe('#C4530F')
    expect(root.style.getPropertyValue('--primary-soft')).toBe('#c15109')
  })
})
