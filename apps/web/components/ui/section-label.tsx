import type { ReactNode } from 'react'

const levelRoleClass = {
  page: 't-h1',
  section: 't-h2',
  sub: 't-eyebrow',
} as const

/** Visual weight of a section head on the DESIGN.md type-role scale. */
export type SectionLabelLevel = keyof typeof levelRoleClass

interface SectionLabelProps {
  children: ReactNode
  /** Visual type role: `page` (t-h1), `section` (t-h2, default), `sub` (t-eyebrow). */
  level?: SectionLabelLevel
  /** Semantic heading element, chosen independently of `level`. */
  as?: 'h1' | 'h2' | 'h3' | 'h4'
  /** Supporting line that recedes to fg-2 instead of being boxed off in its own panel. */
  description?: ReactNode
  top?: number
  bottom?: number
  trailing?: ReactNode
  inset?: boolean
}

/** Kit section head: the single hierarchy contract for "this is a section" across every
 *  surface. `level` picks the type role, `as` picks the semantic level, and `description`
 *  carries supporting copy on the fg recession scale so no surface hand-rolls a heading.
 *  `inset={false}` drops the horizontal gutter inside an already-padded container. */
export function SectionLabel({
  children,
  level = 'section',
  as: Heading = 'h2',
  description,
  top = 24,
  bottom = 12,
  trailing,
  inset = true,
}: Readonly<SectionLabelProps>) {
  return (
    <div
      data-section-label=""
      data-level={level}
      className={`flex justify-between gap-3 ${description ? 'items-start' : 'items-center'}${inset ? ' px-5' : ''}`}
      style={{ paddingTop: top, paddingBottom: bottom }}
    >
      <div className="min-w-0 flex-1">
        <Heading className={`${levelRoleClass[level]} m-0 text-balance`}>{children}</Heading>
        {description ? (
          <p className="t-secondary m-0 max-w-[65ch] text-pretty" style={{ marginTop: 4 }}>
            {description}
          </p>
        ) : null}
      </div>
      {trailing ? <div className="flex shrink-0 items-center gap-2">{trailing}</div> : null}
    </div>
  )
}
