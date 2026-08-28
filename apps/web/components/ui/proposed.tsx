import {
  PROPOSED_RADIUS,
  type ProposedProps,
} from '@orbit/shared/contracts/blocks'
import { tintProposedChildren, type ProposedTintAdapter } from '@orbit/shared/utils'
import { cloneElement, Fragment, type CSSProperties } from 'react'

const proposedColor = 'var(--fg-3)'
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

const tintAdapter: ProposedTintAdapter = {
  wrapText(child) {
    return <span style={{ color: proposedColor }}>{child}</span>
  },
  visitElement(child) {
    if (child.type === Fragment) return { kind: 'recurse' }
    if (typeof child.type !== 'string') return { kind: 'keep' }
    const style = child.props.style as CSSProperties | undefined
    if (style?.color != null) return { kind: 'keep' }
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
