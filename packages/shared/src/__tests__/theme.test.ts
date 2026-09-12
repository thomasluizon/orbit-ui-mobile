import { readdirSync, readFileSync } from 'node:fs'
import { relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { contrastOnSurface, withAlpha } from './contrast'
import { schemes } from '../theme/color-schemes'
import {
  neutralColors,
  selectionAlpha,
  statusConstants,
} from '../theme/neutral-ramp'
import { resolveResponsiveTypeRole, responsiveTypeRoles, typeRoles } from '../theme/type-roles'
import type { ColorScheme } from '../theme/types'

const ALL_SCHEMES: ColorScheme[] = ['purple', 'blue', 'green', 'rose', 'orange', 'cyan']
const REPOSITORY_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))

const BAD_TEXT_SOURCE_SITES = [
  {
    name: 'web destructive menu label',
    path: 'apps/web/app/globals.css',
    pattern: /\.orbit-menu-item\[data-destructive\] \.orbit-menu-label \{\s+color: var\(--status-bad-text\);/,
  },
  {
    name: 'web support field error',
    path: 'apps/web/app/(app)/support/_components/support-field.tsx',
    pattern: /\{error && \([\s\S]*?color: 'var\(--status-bad-text\)'/,
  },
  {
    name: 'web streak repair error',
    path: 'apps/web/app/(app)/progress/_components/progress-content.tsx',
    pattern: /repair\.isError[\s\S]*?text-\[var\(--status-bad-text\)\]/,
  },
  {
    name: 'web failed block status label',
    path: 'apps/web/components/ui/block-frame.tsx',
    pattern: /const labelColor = status === 'failed' \? 'var\(--status-bad-text\)'/,
  },
  {
    name: 'web milestone share error',
    path: 'apps/web/components/milestone-share/milestone-share-prompt.tsx',
    pattern: /hasError[\s\S]*?fontSize: 14, color: 'var\(--status-bad-text\)'/,
  },
  {
    name: 'web settings row title',
    path: 'apps/web/components/ui/settings-row.tsx',
    pattern: /const titleColor = danger \? 'var\(--status-bad-text\)'/,
  },
  {
    name: 'web share-card fetch error',
    path: 'apps/web/components/share/share-card-panel.tsx',
    pattern: /isLoading && isError[\s\S]*?fontSize: 14, color: 'var\(--status-bad-text\)'/,
  },
  {
    name: 'web share-card action error',
    path: 'apps/web/components/share/share-card-panel.tsx',
    pattern: /hasError[\s\S]*?fontSize: 13, color: 'var\(--status-bad-text\)'/,
  },
  {
    name: 'web API-key validation error',
    path: 'apps/web/components/ui/create-api-key-modal.tsx',
    pattern: /\{validationError && \([\s\S]*?color: 'var\(--status-bad-text\)'/,
  },
  {
    name: 'web API-key request error',
    path: 'apps/web/components/ui/create-api-key-modal.tsx',
    pattern: /\{apiError && \([\s\S]*?color: 'var\(--status-bad-text\)'/,
  },
  {
    name: 'web list row title',
    path: 'apps/web/components/ui/list-row.tsx',
    pattern: /const titleColor = danger \? 'var\(--status-bad-text\)'/,
  },
  {
    name: 'web habit understanding error',
    path: 'apps/web/components/habits/habit-form-fields/habit-understanding.tsx',
    pattern: /habit-phrase-error[\s\S]*?text-\[var\(--status-bad-text\)\]/,
  },
  {
    name: 'web goal action label',
    path: 'apps/web/components/goals/goal-detail-sections.tsx',
    pattern: /fontSize: 15,[\s\S]*?color: destructive \? 'var\(--status-bad-text\)'/,
  },
  {
    name: 'web clarification error',
    path: 'apps/web/components/chat/clarification-card.tsx',
    pattern: /errorKey[\s\S]*?text-\[var\(--status-bad-text\)\]/,
  },
  {
    name: 'web conversation send error',
    path: 'apps/web/components/chat/conversation.tsx',
    pattern: /sendError[\s\S]*?text-\[var\(--status-bad-text\)\]/,
  },
  {
    name: 'mobile conversation send error',
    path: 'apps/mobile/components/chat/conversation.tsx',
    pattern: /color: tokens\.statusBadText,[\s\S]*?fontSize: 14/,
  },
  {
    name: 'mobile clarification error',
    path: 'apps/mobile/components/chat/clarification-card.tsx',
    pattern: /errorKey[\s\S]*?color: tokens\.statusBadText/,
  },
  {
    name: 'mobile notification status error',
    path: 'apps/mobile/components/profile/preferences-sections.tsx',
    pattern: /tone === 'critical' \? tokens\.statusBadText/,
  },
  {
    name: 'mobile checkout error',
    path: 'apps/mobile/components/upgrade/plan-selection.tsx',
    pattern: /checkoutError[\s\S]*?color: tokens\.statusBadText/,
  },
  {
    name: 'mobile goal action label',
    path: 'apps/mobile/components/goals/goal-detail-drawer/styles.ts',
    pattern: /actionRowTextDestructive[\s\S]*?color: tokens\.statusBadText/,
  },
  {
    name: 'mobile milestone share error',
    path: 'apps/mobile/components/milestone-share/milestone-share-prompt.tsx',
    pattern: /errorText[\s\S]*?color: tokens\.statusBadText/,
  },
  {
    name: 'mobile habit form error',
    path: 'apps/mobile/components/habits/habit-form-fields/styles.ts',
    pattern: /fieldError[\s\S]*?color: tokens\.statusBadText/,
  },
  {
    name: 'mobile API-key error',
    path: 'apps/mobile/components/ui/create-api-key-modal.styles.ts',
    pattern: /errorText[\s\S]*?color: tokens\.statusBadText/,
  },
  {
    name: 'mobile habit understanding error',
    path: 'apps/mobile/components/habits/habit-form-fields/habit-understanding.tsx',
    pattern: /error: \{ color: tokens\.statusBadText/,
  },
  {
    name: 'mobile failed block status label',
    path: 'apps/mobile/components/ui/block-frame.tsx',
    pattern: /const labelColor = status === 'failed' \? tokens\.statusBadText/,
  },
  {
    name: 'mobile list row title',
    path: 'apps/mobile/components/ui/list-row.tsx',
    pattern: /const titleColor = danger \? tokens\.statusBadText/,
  },
  {
    name: 'mobile streak repair error',
    path: 'apps/mobile/components/progress/progress-content.tsx',
    pattern: /repair\.isError[\s\S]*?color: tokens\.statusBadText/,
  },
  {
    name: 'mobile settings row title',
    path: 'apps/mobile/components/ui/settings-row.tsx',
    pattern: /const titleColor = danger \? tokens\.statusBadText/,
  },
  {
    name: 'mobile share-card errors',
    path: 'apps/mobile/components/share/share-card-panel.tsx',
    pattern: /errorText[\s\S]*?color: tokens\.statusBadText/,
  },
] as const

const BAD_GRAPHIC_SOURCE_SITES = [
  {
    name: 'web conflict warning glyph',
    path: 'apps/web/components/chat/conflict-warning.tsx',
    rolePattern: /case 'HIGH':[\s\S]*?graphicClassName: 'text-\[var\(--status-bad\)\]'/,
    applicationPattern: /<AlertTriangle className=\{`size-3\.5 \$\{severity\.graphicClassName\}`\} \/>/,
  },
  {
    name: 'mobile conflict warning glyph',
    path: 'apps/mobile/components/chat/conflict-warning.tsx',
    rolePattern: /case "HIGH":[\s\S]*?graphic: tokens\.statusBad/,
    applicationPattern: /<AlertTriangle size=\{14\} color=\{sColors\.graphic\} \/>/,
  },
] as const

const DIRECT_BAD_FILL_PATTERN = /\btokens\.statusBad\b|var\(--status-bad\)/g

interface DirectBadFillReference {
  column: number
  line: number
  offset: number
  path: string
  source: string
}

function directBadFillReferencesInSource(path: string, source: string): DirectBadFillReference[] {
  return [...source.matchAll(DIRECT_BAD_FILL_PATTERN)].map((match) => {
    const offset = match.index
    const precedingSource = source.slice(0, offset)
    const lineStart = precedingSource.lastIndexOf('\n') + 1
    return {
      column: offset - lineStart + 1,
      line: precedingSource.match(/\n/g)?.length ?? 0,
      offset,
      path,
      source,
    }
  })
}

function productionSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === '__tests__' || entry.name === 'node_modules' || entry.name === '.next') return []
    const path = `${directory}/${entry.name}`
    if (entry.isDirectory()) return productionSourceFiles(path)
    return /\.(?:css|ts|tsx)$/.test(entry.name) && !/\.(?:spec|test)\.[^.]+$/.test(entry.name)
      ? [path]
      : []
  })
}

function directBadFillReferences(): DirectBadFillReference[] {
  const sourceFiles = [
    ...productionSourceFiles(`${REPOSITORY_ROOT}apps/mobile`),
    ...productionSourceFiles(`${REPOSITORY_ROOT}apps/web`),
  ]
  return sourceFiles.flatMap((path) => {
    const source = readFileSync(path, 'utf8')
    const repositoryPath = relative(REPOSITORY_ROOT, path).replaceAll('\\', '/')
    return directBadFillReferencesInSource(repositoryPath, source)
  })
}

function jsxTagEnd(source: string, tagStart: number): number {
  let braceDepth = 0
  let quote: string | null = null
  for (let index = tagStart; index < source.length; index += 1) {
    const character = source[index]!
    if (quote !== null) {
      if (character === quote && source[index - 1] !== '\\') quote = null
      continue
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character
    } else if (character === '{') {
      braceDepth += 1
    } else if (character === '}') {
      braceDepth -= 1
    } else if (character === '>' && braceDepth === 0) {
      return index
    }
  }
  return -1
}

function openingTagAt(reference: DirectBadFillReference): string | null {
  const tagStart = reference.source.lastIndexOf('<', reference.offset)
  const priorTagEnd = reference.source.lastIndexOf('>', reference.offset)
  if (tagStart < 0 || tagStart < priorTagEnd) return null
  const tagEnd = jsxTagEnd(reference.source, tagStart)
  if (tagEnd < reference.offset) return null
  return reference.source.slice(tagStart, tagEnd + 1)
}

function importedGraphicNames(source: string): Set<string> {
  const names = new Set<string>()
  const imports = source.matchAll(
    /import\s*\{([^}]*)\}\s*from\s*['"]@\/components\/ui\/icons?['"]/g,
  )
  for (const match of imports) {
    for (const specifier of match[1]!.split(',')) {
      const importedName = specifier.trim().replace(/^type\s+/, '')
      if (importedName === '') continue
      names.add(importedName.split(/\s+as\s+/).at(-1)!)
    }
  }
  return names
}

function openingTagHasGraphicRole(openingTag: string, source: string): boolean {
  const names = importedGraphicNames(source)
  const componentName = openingTag.match(/^<([A-Z][\w]*)\b/)?.[1]
  if (componentName !== undefined && names.has(componentName)) return true
  const iconName = openingTag.match(/\bicon=\{([A-Z][\w]*)\}/)?.[1]
  return iconName !== undefined && names.has(iconName)
}

function hasOnlyGraphicButtonChildren(reference: DirectBadFillReference): boolean {
  const buttonStart = reference.source.lastIndexOf('<button', reference.offset)
  const priorButtonEnd = reference.source.lastIndexOf('</button>', reference.offset)
  if (buttonStart < 0 || buttonStart < priorButtonEnd) return false
  const openingEnd = jsxTagEnd(reference.source, buttonStart)
  if (openingEnd < reference.offset) return false
  const closingStart = reference.source.indexOf('</button>', openingEnd)
  if (closingStart < 0) return false
  const children = reference.source.slice(openingEnd + 1, closingStart)
  const graphicNames = importedGraphicNames(reference.source)
  const hasGraphic = [...graphicNames].some((name) => new RegExp(`<${name}\\b`).test(children))
  const childContent = children.replace(/<[^>]+>/g, '').trim()
  return hasGraphic && childContent === ''
}

function cssSelectorAt(reference: DirectBadFillReference): string | null {
  if (!reference.path.endsWith('.css')) return null
  const blockStart = reference.source.lastIndexOf('{', reference.offset)
  const priorBlockEnd = reference.source.lastIndexOf('}', blockStart)
  if (blockStart < 0) return null
  return reference.source.slice(priorBlockEnd + 1, blockStart).trim()
}

function hasSurfaceRole(reference: DirectBadFillReference): boolean {
  const before = reference.source.slice(Math.max(0, reference.offset - 240), reference.offset)
  const lineBefore = before.slice(before.lastIndexOf('\n') + 1)
  return /(?:background(?:Color)?|border(?:Color)?|boxShadow|shadow|ring|bg)\s*[:=][^;{}]*$/.test(before)
    || /(?:background(?:Color)?|border(?:Color)?|boxShadow|shadow|ring|bg)\s*[:=][^;\n]*$/.test(lineBefore)
    || /(?:bg|border|shadow|ring)-\[[^\]\n]*$/.test(lineBefore)
    || /--color-status-bad\s*:\s*$/.test(lineBefore)
}

function hasGraphicRole(reference: DirectBadFillReference): boolean {
  const before = reference.source.slice(Math.max(0, reference.offset - 600), reference.offset)
  const openingTag = openingTagAt(reference)
  const selector = cssSelectorAt(reference)
  return /(?:graphic(?:ClassName)?|iconColor|dangerColor|\bring)\s*[:=][^;\n]*$/.test(before)
    || /function\s+\w*(?:Accent|Ring\w*Color)\b[\s\S]*$/.test(before)
    || /export function Status(?:Ring|Dot)\b[\s\S]*\bbad\s*:\s*[^,]*$/.test(before)
    || /(?:STATUS_COLOR|COLOR_VAR|colorMap)[\s\S]*\bbad\s*:\s*[^,]*$/.test(before)
    || openingTag !== null && openingTagHasGraphicRole(openingTag, reference.source)
    || hasOnlyGraphicButtonChildren(reference)
    || selector !== null && /(?:icon|glyph)/i.test(selector)
    || selector !== null
      && reference.source.includes(`${selector} .`)
      && reference.source.includes('var(--status-bad-text)')
}

function unreviewedBadFillReferences(
  references = directBadFillReferences(),
): string[] {
  return references.flatMap((reference) => {
    if (hasSurfaceRole(reference) || hasGraphicRole(reference)) return []
    const lineSource = reference.source.split('\n')[reference.line]?.trim() ?? ''
    return [`${reference.path}:${reference.line + 1}:${reference.column} ${lineSource}`]
  })
}

/** WHY: both ExpiryWarning mirrors paint their text on the overdue token at this alpha over --bg. */
const EXPIRY_TINT_ALPHA = 0.1
/** WHY: the native high-conflict warning paints bad status text on this status-bad tint inside a card. */
const BAD_WARNING_TINT_ALPHA = 0x1A / 0xFF

const GRANTED_ACCENTS = {
  dark: {
    primary: '#C4530F',
    primaryHover: '#B74E12',
    primaryPressed: '#A24716',
    primarySoft: '#C85716',
    primaryText: '#E16D33',
    primaryDim: '#261611',
    primaryRgb: '196,83,15',
  },
  light: {
    primary: '#C4530F',
    primaryHover: '#B74E12',
    primaryPressed: '#A24716',
    primarySoft: '#C15109',
    primaryText: '#B64900',
    primaryDim: '#F4DDD3',
    primaryRgb: '196,83,15',
  },
} as const

const EMPTY_TRACK_SURFACES = {
  dark: [
    { name: 'canvas', layers: [neutralColors.dark.bg] },
    { name: 'card', layers: [neutralColors.dark.bg, neutralColors.dark.bgCard] },
    { name: 'well or overlay', layers: [neutralColors.dark.bg, neutralColors.dark.bgWell] },
    { name: 'card replacement hover', layers: [neutralColors.dark.bg, neutralColors.dark.bgHover] },
    { name: 'card child hover', layers: [neutralColors.dark.bg, neutralColors.dark.bgCard, neutralColors.dark.bgHover] },
    {
      name: 'canvas selection',
      layers: [
        neutralColors.dark.bg,
        withAlpha(schemes.orange.accent.dark.primary, selectionAlpha.dark),
      ],
    },
    {
      name: 'card selection',
      layers: [
        neutralColors.dark.bg,
        neutralColors.dark.bgCard,
        withAlpha(schemes.orange.accent.dark.primary, selectionAlpha.dark),
      ],
    },
  ],
  light: [
    { name: 'canvas', layers: [neutralColors.light.bg] },
    { name: 'card or overlay', layers: [neutralColors.light.bg, neutralColors.light.bgCard] },
    { name: 'well', layers: [neutralColors.light.bg, neutralColors.light.bgWell] },
    { name: 'card replacement hover', layers: [neutralColors.light.bg, neutralColors.light.bgHover] },
    { name: 'card child hover', layers: [neutralColors.light.bg, neutralColors.light.bgCard, neutralColors.light.bgHover] },
    {
      name: 'canvas selection',
      layers: [
        neutralColors.light.bg,
        withAlpha(schemes.orange.accent.light.primary, selectionAlpha.light),
      ],
    },
    {
      name: 'card selection',
      layers: [
        neutralColors.light.bg,
        neutralColors.light.bgCard,
        withAlpha(schemes.orange.accent.light.primary, selectionAlpha.light),
      ],
    },
  ],
} as const

const BAD_TEXT_SURFACES = {
  dark: [
    { name: 'canvas', layers: [neutralColors.dark.bg] },
    { name: 'card', layers: [neutralColors.dark.bg, neutralColors.dark.bgCard] },
    { name: 'field', layers: [neutralColors.dark.bg, neutralColors.dark.bgField] },
    { name: 'well', layers: [neutralColors.dark.bg, neutralColors.dark.bgWell] },
    { name: 'elevated sheet', layers: [neutralColors.dark.bg, neutralColors.dark.bgElev] },
    { name: 'elevated inline step', layers: [neutralColors.dark.bg, neutralColors.dark.bgElev2] },
    { name: 'canvas hover', layers: [neutralColors.dark.bg, neutralColors.dark.bgHover] },
    {
      name: 'elevated menu item hover',
      layers: [neutralColors.dark.bg, neutralColors.dark.bgElev, neutralColors.dark.bgHover],
    },
    {
      name: 'bad warning tint inside a card',
      layers: [
        neutralColors.dark.bg,
        neutralColors.dark.bgCard,
        withAlpha(statusConstants.dark.bad, BAD_WARNING_TINT_ALPHA),
      ],
    },
  ],
  light: [
    { name: 'canvas', layers: [neutralColors.light.bg] },
    {
      name: 'card, field, or elevated sheet',
      layers: [neutralColors.light.bg, neutralColors.light.bgCard],
    },
    { name: 'well', layers: [neutralColors.light.bg, neutralColors.light.bgWell] },
    { name: 'canvas hover', layers: [neutralColors.light.bg, neutralColors.light.bgHover] },
    {
      name: 'elevated menu item hover',
      layers: [neutralColors.light.bg, neutralColors.light.bgElev, neutralColors.light.bgHover],
    },
    {
      name: 'bad warning tint inside a card',
      layers: [
        neutralColors.light.bg,
        neutralColors.light.bgCard,
        withAlpha(statusConstants.light.bad, BAD_WARNING_TINT_ALPHA),
      ],
    },
  ],
} as const

describe('color schemes', () => {
  it('keeps all 6 contract values during the API overlap', () => {
    expect(Object.keys(schemes)).toHaveLength(6)
    for (const name of ALL_SCHEMES) expect(schemes[name]).toBeDefined()
  })

  for (const name of ALL_SCHEMES) {
    it(`${name}: resolves the granted accent in both modes`, () => {
      expect(schemes[name].accent).toEqual(GRANTED_ACCENTS)
      expect(schemes[name].fgOnPrimary).toEqual({ dark: '#FFFFFF', light: '#FFFFFF' })
    })

  }
})

describe('byte-exact mode colors', () => {
  it('matches the dark DESIGN.md table', () => {
    expect(neutralColors.dark).toEqual({
      bg: '#09090B',
      bgCard: 'rgba(250,250,250,0.04)',
      bgField: 'rgba(250,250,250,0.06)',
      bgWell: 'rgba(250,250,250,0.08)',
      bgElev: '#1C1C1E',
      bgElev2: 'rgba(250,250,250,0.12)',
      bgHover: 'rgba(250,250,250,0.13)',
      bgSunk: 'rgba(0,0,0,0.28)',
      hairline: 'rgba(255,255,255,0.08)',
      borderControl: 'rgba(255,255,255,0.08)',
      hairlineGhost: 'rgba(255,255,255,0.10)',
      hairlineStrong: 'rgba(255,255,255,0.16)',
      fg1: '#F4F4F6',
      fg2: '#C9C9CC',
      fg3: '#8F8F93',
      fg4: '#5D5D60',
      trackEmpty: '#7A7A7D',
      scrim: 'rgba(0,0,0,0.55)',
    })
  })

  it('matches the light DESIGN.md table', () => {
    expect(neutralColors.light).toEqual({
      bg: '#FAFAFA',
      bgCard: '#FFFFFF',
      bgField: '#FFFFFF',
      bgWell: 'rgba(9,9,11,0.04)',
      bgElev: '#FFFFFF',
      bgElev2: '#FFFFFF',
      bgHover: 'rgba(9,9,11,0.06)',
      bgSunk: 'rgba(9,9,11,0.04)',
      hairline: 'rgba(9,9,11,0.08)',
      borderControl: 'rgba(9,9,11,0.08)',
      hairlineGhost: 'rgba(9,9,11,0.10)',
      hairlineStrong: 'rgba(9,9,11,0.16)',
      fg1: '#1A1A1D',
      fg2: '#424247',
      fg3: '#68686D',
      fg4: '#89898D',
      trackEmpty: '#7F7F83',
      scrim: 'rgba(0,0,0,0.55)',
    })
  })

  it('keeps the documented status and selection values', () => {
    expect(statusConstants.dark).toEqual({
      overdue: '#FE9A00', bad: '#FB2C36', overdueText: '#FE9A00',
      badText: '#FF7970', fgOnBad: '#020618', fgOnOverdue: '#020618',
    })
    expect(statusConstants.light).toEqual({
      overdue: '#886100', bad: '#E7000B', overdueText: '#886100',
      badText: '#D70009', fgOnBad: '#FFFFFF', fgOnOverdue: '#FFFFFF',
    })
    expect(selectionAlpha).toEqual({ dark: 0.32, light: 0.18 })
  })

  for (const mode of ['dark', 'light'] as const) {
    for (const surface of BAD_TEXT_SURFACES[mode]) {
      it(`keeps the ${mode} bad status text at the text floor on ${surface.name}`, () => {
        expect(contrastOnSurface(statusConstants[mode].badText, surface.layers))
          .toBeGreaterThanOrEqual(4.5)
      })
    }
  }

  it.each([
    ['dark', '#FB2C36', '#020618'],
    ['light', '#E7000B', '#FFFFFF'],
  ] as const)('keeps the %s destructive fill and its foreground unchanged', (mode, fill, foreground) => {
    expect(statusConstants[mode].bad).toBe(fill)
    expect(statusConstants[mode].fgOnBad).toBe(foreground)
    expect(contrastOnSurface(foreground, [fill])).toBeGreaterThanOrEqual(4.5)
  })

  it.each([
    ['canvas', [neutralColors.light.bg]],
    ['card', [neutralColors.light.bg, neutralColors.light.bgCard]],
    ['well', [neutralColors.light.bg, neutralColors.light.bgWell]],
    ['hover', [neutralColors.light.bg, neutralColors.light.bgHover]],
    ['session-expiry warning tint', [
      neutralColors.light.bg,
      withAlpha(statusConstants.light.overdue, EXPIRY_TINT_ALPHA),
    ]],
  ] as const)('keeps light overdue text AA on the %s surface', (_surface, layers) => {
    expect(contrastOnSurface(statusConstants.light.overdueText, layers))
      .toBeGreaterThanOrEqual(4.5)
  })

  for (const mode of ['dark', 'light'] as const) {
    for (const surface of EMPTY_TRACK_SURFACES[mode]) {
      it(`keeps the ${mode} empty track at the non-text floor on ${surface.name}`, () => {
        expect(contrastOnSurface(neutralColors[mode].trackEmpty, surface.layers))
          .toBeGreaterThanOrEqual(3)
      })
    }

    it(`keeps the ${mode} card neutral ramp ordered around the empty track`, () => {
      const colors = neutralColors[mode]
      const card = [colors.bg, colors.bgCard]
      const ratios = [colors.fg1, colors.fg2, colors.fg3, colors.trackEmpty, colors.fg4]
        .map((color) => contrastOnSurface(color, card))

      for (let index = 1; index < ratios.length; index += 1) {
        expect(ratios[index - 1]).toBeGreaterThan(ratios[index]!)
      }
    })
  }
})

describe('bad status source roles', () => {
  it.each(BAD_TEXT_SOURCE_SITES)('$name uses the text token', ({ path, pattern }) => {
    const source = readFileSync(`${REPOSITORY_ROOT}${path}`, 'utf8')
    expect(source).toMatch(pattern)
  })

  it('derives direct fill-token references and rejects unreviewed text-role syntax', () => {
    expect(unreviewedBadFillReferences()).toEqual([])
  })

  it('rejects the fill token in a custom text component and accepts the text token', () => {
    const path = 'apps/web/components/habits/habit-row-content.tsx'
    const fillSource = [
      'return (',
      '  <TitleText title={habit.title} size={titleSize} color="var(--status-bad)" strikethrough={isDone} />',
      ')',
    ].join('\n')
    const fillReferences = directBadFillReferencesInSource(path, fillSource)
    expect(unreviewedBadFillReferences(fillReferences)).toEqual([
      `${path}:2:58 <TitleText title={habit.title} size={titleSize} color="var(--status-bad)" strikethrough={isDone} />`,
    ])

    const textSource = fillSource.replace('var(--status-bad)', 'var(--status-bad-text)')
    expect(unreviewedBadFillReferences(directBadFillReferencesInSource(path, textSource))).toEqual([])
  })

  it('rejects the fill token in a text-bearing accessible icon button', () => {
    const path = 'apps/web/components/ui/destructive-action.tsx'
    const fillSource = [
      "import { Trash2 } from '@/components/ui/icons'",
      'return (',
      '  <button aria-label={label} className="text-[var(--status-bad)]">',
      '    <Trash2 size={16} aria-hidden="true" /><span>{label}</span>',
      '  </button>',
      ')',
    ].join('\n')
    const fillReferences = directBadFillReferencesInSource(path, fillSource)
    expect(unreviewedBadFillReferences(fillReferences)).toEqual([
      `${path}:3:47 <button aria-label={label} className="text-[var(--status-bad)]">`,
    ])

    const textSource = fillSource.replace('var(--status-bad)', 'var(--status-bad-text)')
    expect(unreviewedBadFillReferences(directBadFillReferencesInSource(path, textSource))).toEqual([])
  })

  it.each(BAD_GRAPHIC_SOURCE_SITES)(
    '$name explicitly uses the fill role instead of inheriting the text role',
    ({ path, rolePattern, applicationPattern }) => {
      const source = readFileSync(`${REPOSITORY_ROOT}${path}`, 'utf8')
      expect(source).toMatch(rolePattern)
      expect(source).toMatch(applicationPattern)
    },
  )
})

describe('type roles', () => {
  it('encodes the Pro drawing heading and allowance pairs', () => {
    expect(responsiveTypeRoles).toEqual({
      displayHeading: {
        family: 'display', weight: 500, letterSpacingEm: -0.02, colorToken: 'fg1',
        compact: { size: 28, lineHeight: 1.18 }, wide: { size: 34, lineHeight: 1.15 },
      },
      allowance: {
        family: 'display', weight: 600, letterSpacingEm: -0.02, colorToken: 'fg1', tabularNums: true,
        compact: { size: 34, lineHeight: 1.05 }, wide: { size: 44, lineHeight: 1.02 },
      },
    })
  })

  it.each([320, 412, 639.99, 640, 1416])('resolves both pairs at width %s', (width) => {
    const wide = width >= 640
    expect(resolveResponsiveTypeRole('displayHeading', width)).toEqual({
      family: 'display', weight: 500, letterSpacingEm: -0.02, colorToken: 'fg1',
      size: wide ? 34 : 28, lineHeight: wide ? 1.15 : 1.18,
    })
    expect(resolveResponsiveTypeRole('allowance', width)).toEqual({
      family: 'display', weight: 600, letterSpacingEm: -0.02, colorToken: 'fg1', tabularNums: true,
      size: wide ? 44 : 34, lineHeight: wide ? 1.02 : 1.05,
    })
  })

  it('defines the 11 semantic roles', () => {
    expect(Object.keys(typeRoles)).toEqual([
      'eyebrow', 'display', 'hero', 'h1', 'h2', 'row',
      'body', 'secondary', 'meta', 'num', 'numXl',
    ])
  })

  it('keeps the documented family assignments', () => {
    expect(typeRoles.hero.family).toBe('display')
    expect(typeRoles.numXl.family).toBe('display')
    expect(typeRoles.meta.family).toBe('mono')
    expect(typeRoles.num.family).toBe('mono')
    expect(typeRoles.body.family).toBe('sans')
  })
})
