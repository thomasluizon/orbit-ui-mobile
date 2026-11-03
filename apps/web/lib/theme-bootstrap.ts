import { neutralColors } from '@orbit/shared/theme'
import type { ThemeMode } from '@orbit/shared/types/profile'
import { resolveWebThemeVariables, VALID_COLOR_SCHEMES } from '@/lib/theme-dom'

const schemeNames = Array.from(VALID_COLOR_SCHEMES)
const canvasByScheme = Object.fromEntries(
  schemeNames.map((scheme) => [
    scheme,
    { dark: neutralColors.dark.bg, light: neutralColors.light.bg },
  ]),
)
const variablesByScheme = Object.fromEntries(
  schemeNames.map((scheme) => [
    scheme,
    {
      dark: resolveWebThemeVariables(scheme, 'dark'),
      light: resolveWebThemeVariables(scheme, 'light'),
    },
  ]),
)

export function buildThemeBootstrapScript(initialTheme: ThemeMode | null): string {
  return `
    try {
      const themeName = ${JSON.stringify(initialTheme)} ?? (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
      const root = document.documentElement

      if (themeName === 'dark') {
        root.classList.add('dark')
        root.classList.remove('light')
      } else {
        root.classList.add('light')
        root.classList.remove('dark')
      }

      const schemeNames = ${JSON.stringify(schemeNames)}
      schemeNames.forEach((s) => root.classList.remove('scheme-' + s))
      const activeScheme = 'orange'
      root.classList.add('scheme-' + activeScheme)

      root.style.setProperty('color-scheme', themeName)
      const variables = ${JSON.stringify(variablesByScheme)}
      Object.entries(variables[activeScheme][themeName]).forEach(([property, value]) => {
        root.style.setProperty(property, value)
      })

      const canvases = ${JSON.stringify(canvasByScheme)}
      document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
        meta.setAttribute('content', canvases[activeScheme][themeName])
      })
    } catch {}
  `
}
