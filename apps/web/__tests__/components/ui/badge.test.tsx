import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Badge } from '@/components/ui/badge'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'

const CUSTOM_PROPERTY_REFERENCE = /var\((--[a-z0-9-]+)\)/g
const CUSTOM_PROPERTY_DECLARATION = /(--[a-z0-9-]+)\s*:/g

function customPropertiesIn(value: string): string[] {
  return [...value.matchAll(CUSTOM_PROPERTY_REFERENCE)].flatMap((match) =>
    match[1] ? [match[1]] : [],
  )
}

function declaredCustomProperties(): Set<string> {
  const stylesheet = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8')
  const staticProperties = [...stylesheet.matchAll(CUSTOM_PROPERTY_DECLARATION)].flatMap(
    (match) => (match[1] ? [match[1]] : []),
  )

  return new Set([
    ...Object.keys(resolveWebThemeVariables('purple', 'dark')),
    ...staticProperties,
  ])
}

function resolveCustomProperty(
  value: string,
  variables: Record<`--${string}`, string>,
): string | undefined {
  const [property] = customPropertiesIn(value)
  return property ? variables[property as `--${string}`] : value
}

describe('Badge', () => {
  it('renders its children', () => {
    render(<Badge>Premium</Badge>)
    expect(screen.getByText('Premium')).toHaveClass('whitespace-nowrap')
  })

  it.each(['solid', 'outline'] as const)(
    'renders the %s variant',
    (variant) => {
      render(<Badge variant={variant}>{variant}</Badge>)
      const badge = screen.getByText(variant)
      expect(badge).toBeInTheDocument()
      expect(badge).toHaveClass('rounded-[8px]', 'uppercase')
    },
  )

  it('uses the specified badge typography', () => {
    render(<Badge>typography</Badge>)
    expect(screen.getByText('typography')).toHaveStyle({
      fontFamily: 'var(--font-mono)',
      fontSize: '12px',
      fontWeight: '500',
      letterSpacing: '0.06em',
      textBox: 'trim-both cap alphabetic',
    })
  })

  it.each(['solid', 'outline'] as const)(
    'references only declared custom properties in the %s variant',
    (variant) => {
      render(<Badge variant={variant}>{variant}</Badge>)
      const badge = screen.getByText(variant)
      const undeclaredProperties = customPropertiesIn(badge.getAttribute('style') ?? '').filter(
        (property) => !declaredCustomProperties().has(property),
      )
      expect(undeclaredProperties).toEqual([])
    },
  )

  it.each(['dark', 'light'] as const)(
    'uses a neutral well with readable solid text in %s mode',
    (mode) => {
      render(<Badge>solid</Badge>)
      const badge = screen.getByText('solid')
      const variables = resolveWebThemeVariables('purple', mode)
      const fill = resolveCustomProperty(badge.style.background, variables)
      const label = resolveCustomProperty(badge.style.color, variables)

      expect(badge.style.background).toBe('var(--bg-well)')
      expect(badge.style.color).toBe('var(--fg-1)')
      expect(contrastOnSurface(label!, [variables['--bg']!, fill!])).toBeGreaterThanOrEqual(4.5)
      expect(contrastOnSurface(label!, [variables['--bg']!, variables['--bg-card']!, fill!])).toBeGreaterThanOrEqual(4.5)
      expect(contrastOnSurface(label!, [variables['--bg']!, variables['--primary-dim']!, fill!])).toBeGreaterThanOrEqual(4.5)
    },
  )
})
