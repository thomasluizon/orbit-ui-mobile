import {
  PROPOSED_RADIUS,
  type ProposedProps,
} from '@orbit/shared/contracts/blocks'
import { tintProposedChildren, type ProposedTintAdapter } from '@orbit/shared/utils'
import { cloneElement, Fragment, type CSSProperties } from 'react'

const proposedColor = 'var(--fg-3)'
const tailwindThemeColorKeys = new Set([
  'bg',
  'bg-card',
  'bg-elev',
  'bg-elev-2',
  'bg-elev-pressed',
  'bg-field',
  'bg-sheet',
  'bg-sunk',
  'bg-well',
  'black',
  'fg-1',
  'fg-2',
  'fg-3',
  'fg-4',
  'fg-on-primary',
  'hairline',
  'hairline-strong',
  'primary',
  'primary-pressed',
  'primary-soft',
  'status-bad',
  'status-bad-text',
  'status-done',
  'status-empty',
  'status-frozen',
  'status-overdue',
  'status-overdue-text',
  'status-skip',
  'white',
])
const tailwindThemeColorFamilies = new Set([
  'amber',
  'blue',
  'cyan',
  'emerald',
  'fuchsia',
  'gray',
  'green',
  'indigo',
  'lime',
  'mauve',
  'mist',
  'neutral',
  'olive',
  'orange',
  'pink',
  'purple',
  'red',
  'rose',
  'sky',
  'slate',
  'stone',
  'taupe',
  'teal',
  'violet',
  'yellow',
  'zinc',
])
const tailwindThemeColorShades = new Set([
  '50',
  '100',
  '200',
  '300',
  '400',
  '500',
  '600',
  '700',
  '800',
  '900',
  '950',
])
const textBearingElements = new Set([
  'a',
  'button',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'input',
  'label',
  'li',
  'p',
  'span',
  'td',
  'textarea',
  'th',
])

function isTailwindThemeColor(colorName: string): boolean {
  if (tailwindThemeColorKeys.has(colorName)) return true
  const separator = colorName.lastIndexOf('-')
  if (separator < 0) return false
  return tailwindThemeColorFamilies.has(colorName.slice(0, separator))
    && tailwindThemeColorShades.has(colorName.slice(separator + 1))
}

export function hasExplicitTextColorClass(className: unknown): boolean {
  if (typeof className !== 'string') return false

  return className.split(/\s+/).some((classToken) => {
    const utility = classToken.split(':').at(-1)?.replace(/^!/, '')
    if (utility == null || !utility.startsWith('text-')) return false
    const [value] = utility.slice('text-'.length).split('/')
    if (value == null) return false
    if (/^\[(?:var\(--[^)]+\)|#[\da-f]{3,8}|rgba?\(.+\))\]$/i.test(value)) return true
    return isTailwindThemeColor(value)
  })
}

const tintAdapter: ProposedTintAdapter = {
  wrapText(child) {
    return <span style={{ color: proposedColor }}>{child}</span>
  },
  visitElement(child) {
    if (child.type === Fragment) return { kind: 'recurse' }
    if (typeof child.type !== 'string') return { kind: 'keep' }
    const style = child.props.style as CSSProperties | undefined
    if (style?.color != null || hasExplicitTextColorClass(child.props.className)) {
      return { kind: 'keep' }
    }
    if (!textBearingElements.has(child.type)) return { kind: 'recurse' }
    return {
      kind: 'replace',
      child: cloneElement(child, { style: { ...style, color: proposedColor } }),
    }
  },
}

export function Proposed({ proposed, scope, label, children }: Readonly<ProposedProps>) {
  if (!proposed) return children

  return (
    <div
      aria-label={label}
      className="border border-dashed border-[var(--hairline-strong)]"
      data-proposed=""
      role="group"
      style={{ borderRadius: PROPOSED_RADIUS[scope] }}
    >
      {tintProposedChildren(children, tintAdapter)}
    </div>
  )
}
